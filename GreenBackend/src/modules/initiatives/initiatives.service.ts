import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { areas } from '../../db/schema/geo.js'
import { users } from '../../db/schema/identity.js'
import { metricTargets, metrics } from '../../db/schema/metrics.js'
import {
  initiativeAreas,
  initiativeSites,
  initiatives,
  programs,
} from '../../db/schema/programs.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { loadInitiativeProgress } from '../impact/impact.service.js'
import {
  type Executor,
  instantiateProgramTemplates,
  loadInitiativeWork,
} from '../work/work.service.js'
import type * as dto from './initiatives.schemas.js'

type InitiativeStatus = (typeof initiatives.$inferSelect)['status']

/** الحالتان اللتان يجوز البدء منهما؛ يُفرضان في شرط التحديث نفسه. */
const LAUNCHABLE_STATUSES: InitiativeStatus[] = ['DRAFT', 'PLANNING']

/** ما دون النهائيتين: مبادرة مغلقة أو ملغاة لا تُلغى مرة أخرى. */
const CANCELLABLE_STATUSES: InitiativeStatus[] = ['DRAFT', 'PLANNING', 'ACTIVE']

const initiativeLead = alias(users, 'initiative_lead')

/**
 * `numeric` يعود نصًّا من السائق ثم عائمًا بعد `Number`، والمساواة الحرفية
 * بين عائمين تكذب: مجموع ٣٣٫٣٣٣٣ ثلاث مرات لا يساوي ١٠٠ بالضبط. الفارق
 * المسموح يبقي المطابقة أمينة دون أن ترفض أرقامًا صحيحة عمليًا.
 */
const TARGET_EPSILON = 1e-6

function toNumber(value: string | null) {
  return value === null ? null : Number(value)
}

/**
 * قيد `initiatives_date_order` يرفض العكس في القاعدة، لكنه يصل المستخدم
 * خطأ ٥٠٠ غامضًا. الفحص هنا يحوّله إلى رسالة تشرح ما يجب تغييره.
 */
function assertDateOrder(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw errors.unprocessable('تاريخ الانتهاء قبل تاريخ البدء.')
  }
}

/** القيد يفرض الإحداثيين معًا أو لا شيء: نصف إحداثي لا يدل على مكان. */
function assertCoordinatePair(lat: number | null, lng: number | null) {
  if ((lat === null) !== (lng === null)) {
    throw errors.unprocessable('الإحداثيات تُرسل خط عرض وخط طول معًا.')
  }
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(value) : null
}

async function requireInitiative(initiativeId: string, tx: Executor = db) {
  const [row] = await tx
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!row) throw errors.notFound('المبادرة غير موجودة.')

  return row
}

/**
 * يُقرأ صف المبادرة مقفلًا أولَ كل معاملة تمسّ أهدافها أو حالتها.
 *
 * القفل على صف المبادرة تحديدًا لأن الأهداف صفوف متفرقة على المبادرة
 * ومواقعها، فلا صف واحد يمثلها ليُقفل. جعله نقطة التسلسل يمنع تعديل هدف
 * من الانزلاق بين فحص المطابقة وكتابة البدء تحت READ COMMITTED.
 */
async function lockInitiative(tx: Executor, initiativeId: string) {
  const [row] = await tx
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)
    .for('update')

  if (!row) throw errors.notFound('المبادرة غير موجودة.')

  return row
}

async function requireSite(
  initiativeId: string,
  siteId: string,
  tx: Executor = db,
) {
  const [row] = await tx
    .select()
    .from(initiativeSites)
    .where(
      and(
        eq(initiativeSites.id, siteId),
        eq(initiativeSites.initiativeId, initiativeId),
      ),
    )
    .limit(1)

  if (!row) throw errors.notFound('الموقع غير موجود في هذه المبادرة.')

  return row
}

async function requireArea(areaId: string) {
  const [row] = await db
    .select({ id: areas.id, nameAr: areas.nameAr, path: areas.path })
    .from(areas)
    .where(eq(areas.id, areaId))
    .limit(1)

  if (!row) throw errors.unprocessable('المنطقة غير موجودة.')

  return row
}

async function requireMetric(metricId: string, tx: Executor = db) {
  const [row] = await tx
    .select({
      id: metrics.id,
      nameAr: metrics.nameAr,
      isActive: metrics.isActive,
    })
    .from(metrics)
    .where(eq(metrics.id, metricId))
    .limit(1)

  if (!row) throw errors.unprocessable('المؤشر غير موجود.')

  if (!row.isActive) {
    throw errors.unprocessable('المؤشر معطّل، فلا تُعلَّق عليه أهداف جديدة.')
  }

  return row
}

// ── المطابقة ───────────────────────────────────────────────────────────

export type RollupMetric = {
  metricId: string
  metricNameAr: string
  unitAr: string
  initiativeTarget: number | null
  siteTargetSum: number
  matches: boolean
}

export type InitiativeRollup = {
  policy: 'STRICT' | 'ADVISORY' | 'NONE'
  satisfied: boolean
  metrics: RollupMetric[]
}

/**
 * مقارنة مجموع أهداف المواقع بهدف المبادرة.
 *
 * تنفيذ واحد تستعمله القراءة وبوابة البدء معًا: نسختان تفترقان يومًا ما،
 * فتعرض اللوحة مطابقةً ترفضها البوابة.
 *
 * مواقع `CANCELLED` خارج المجموع لأن هدف موقع ملغى غير مستحق — وإبقاؤه
 * يجعل إلغاء موقع سببًا لمنع بدء المبادرة كلها.
 */
export async function computeRollup(
  initiativeId: string,
  tx: Executor = db,
): Promise<InitiativeRollup> {
  const [initiative] = await tx
    .select({ targetRollup: initiatives.targetRollup })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!initiative) throw errors.notFound('المبادرة غير موجودة.')

  const targetRows = await tx
    .select({
      metricId: metricTargets.metricId,
      value: metricTargets.value,
    })
    .from(metricTargets)
    .where(eq(metricTargets.initiativeId, initiativeId))

  const siteSumRows = await tx
    .select({
      metricId: metricTargets.metricId,
      total: sql<string>`sum(${metricTargets.value})`,
    })
    .from(metricTargets)
    .innerJoin(initiativeSites, eq(metricTargets.siteId, initiativeSites.id))
    .where(
      and(
        eq(initiativeSites.initiativeId, initiativeId),
        ne(initiativeSites.status, 'CANCELLED'),
      ),
    )
    .groupBy(metricTargets.metricId)

  const targets = new Map(
    targetRows.map((row) => [row.metricId, Number(row.value)]),
  )

  const sums = new Map(
    siteSumRows.map((row) => [row.metricId, Number(row.total)]),
  )

  /**
   * المؤشرات المقارَنة اتحاد الجهتين لا أهداف المبادرة وحدها.
   *
   * مؤشر وُزّع على المواقع بلا هدف على مستوى المبادرة كان يغيب عن القائمة
   * فلا يختلف أبدًا، وتمرّ عليه `STRICT` صامتة. وهو بالضبط خطأ التخطيط
   * الذي تُشترى به هذه السياسة: تخصيصٌ على الأرض لا يطالب به رقم كلي —
   * الحملة لا تعرف كم وعدت به.
   */
  const metricIds = [...new Set([...targets.keys(), ...sums.keys()])]

  // مبادرة بلا هدف واحد على أي مستوى: لا شيء يُقارن، ولا استعلام كتالوج له معنى.
  if (metricIds.length === 0) {
    return { policy: initiative.targetRollup, satisfied: true, metrics: [] }
  }

  const catalog = await tx
    .select({
      id: metrics.id,
      nameAr: metrics.nameAr,
      unitAr: metrics.unitAr,
    })
    .from(metrics)
    .where(inArray(metrics.id, metricIds))
    .orderBy(asc(metrics.displayOrder), asc(metrics.nameAr))

  const rollupMetrics = catalog.map((metric) => {
    const initiativeTarget = targets.get(metric.id) ?? null
    const siteTargetSum = sums.get(metric.id) ?? 0

    return {
      metricId: metric.id,
      metricNameAr: metric.nameAr,
      unitAr: metric.unitAr,
      initiativeTarget,
      siteTargetSum,
      matches:
        initiativeTarget !== null &&
        Math.abs(initiativeTarget - siteTargetSum) < TARGET_EPSILON,
    }
  })

  return {
    policy: initiative.targetRollup,
    // سياسة NONE لا تقارن أصلًا، فإظهارها «غير مستوفاة» تحذيرٌ أبديٌّ بلا معنى.
    satisfied:
      initiative.targetRollup === 'NONE' ||
      rollupMetrics.every((metric) => metric.matches),
    metrics: rollupMetrics,
  }
}

// ── القراءة ────────────────────────────────────────────────────────────

export async function listInitiatives(filters: dto.ListInitiativesQuery) {
  /**
   * الترشيح بالمنطقة يشمل ذرّيتها عبر المسار المادّي: النطاق يُعلن غالبًا
   * على مستوى محافظة بينما المواقع أحياء تحتها، فمطابقة المعرّف وحده كانت
   * تعيد لا شيء لأكثر ترشيح متوقع.
   */
  const scopePath = filters.areaId
    ? (await requireArea(filters.areaId)).path
    : null

  const conditions = [
    filters.programId ? eq(initiatives.programId, filters.programId) : undefined,
    filters.status ? eq(initiatives.status, filters.status) : undefined,
    filters.q
      ? or(
          ilike(initiatives.nameAr, `%${filters.q}%`),
          ilike(initiatives.nameEn, `%${filters.q}%`),
        )
      : undefined,
    scopePath
      ? sql`(
          exists (
            select 1 from ${initiativeAreas}
              join ${areas} on ${areas.id} = ${initiativeAreas.areaId}
             where ${initiativeAreas.initiativeId} = ${initiatives.id}
               and (${areas.path} = ${scopePath}
                    or ${areas.path} like ${`${scopePath}/%`})
          )
          or exists (
            select 1 from ${initiativeSites}
              join ${areas} on ${areas.id} = ${initiativeSites.areaId}
             where ${initiativeSites.initiativeId} = ${initiatives.id}
               and (${areas.path} = ${scopePath}
                    or ${areas.path} like ${`${scopePath}/%`})
          )
        )`
      : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      id: initiatives.id,
      programId: initiatives.programId,
      programNameAr: programs.nameAr,
      kind: initiatives.kind,
      contributorNameAr: initiatives.contributorNameAr,
      coverImageUrl: initiatives.coverImageUrl,
      slug: initiatives.slug,
      nameAr: initiatives.nameAr,
      nameEn: initiatives.nameEn,
      season: initiatives.season,
      status: initiatives.status,
      targetRollup: initiatives.targetRollup,
      startsAt: initiatives.startsAt,
      endsAt: initiatives.endsAt,
      launchedAt: initiatives.launchedAt,
      completedAt: initiatives.completedAt,
      leadUserId: initiatives.leadUserId,
      leadNameAr: initiativeLead.fullNameAr,
      createdAt: initiatives.createdAt,
      areaCount: sql<number>`(
        select count(*)::int from ${initiativeAreas}
         where ${initiativeAreas.initiativeId} = ${initiatives.id}
      )`.as('area_count'),
      siteCount: sql<number>`(
        select count(*)::int from ${initiativeSites}
         where ${initiativeSites.initiativeId} = ${initiatives.id}
      )`.as('site_count'),
    })
    .from(initiatives)
    .innerJoin(programs, eq(initiatives.programId, programs.id))
    .leftJoin(initiativeLead, eq(initiatives.leadUserId, initiativeLead.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(initiatives.createdAt))
    .limit(300)

  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    launchedAt: row.launchedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** يُستدعى بعد كل تعديل ليعود الملف الكامل للواجهة في نداء واحد. */
export async function loadInitiativeDetail(
  initiativeId: string,
  viewer: AuthContext,
) {
  const [head] = await db
    .select({
      initiative: initiatives,
      programNameAr: programs.nameAr,
      leadNameAr: initiativeLead.fullNameAr,
    })
    .from(initiatives)
    .innerJoin(programs, eq(initiatives.programId, programs.id))
    .leftJoin(initiativeLead, eq(initiatives.leadUserId, initiativeLead.id))
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!head) throw errors.notFound('المبادرة غير موجودة.')

  const row = head.initiative

  const [areaRows, siteRows, siteTargetRows, targetRows] = await Promise.all([
    db
      .select({
        id: initiativeAreas.id,
        areaId: initiativeAreas.areaId,
        areaNameAr: areas.nameAr,
        areaPath: areas.path,
        level: areas.level,
        noteAr: initiativeAreas.noteAr,
      })
      .from(initiativeAreas)
      .innerJoin(areas, eq(initiativeAreas.areaId, areas.id))
      .where(eq(initiativeAreas.initiativeId, initiativeId))
      .orderBy(asc(areas.depth), asc(areas.path)),

    db
      .select({ site: initiativeSites, areaNameAr: areas.nameAr })
      .from(initiativeSites)
      .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
      .where(eq(initiativeSites.initiativeId, initiativeId))
      .orderBy(asc(initiativeSites.displayOrder), asc(initiativeSites.nameAr)),

    /** أهداف كل المواقع في استعلام واحد ثم تُوزَّع، بدل استعلام لكل موقع. */
    db
      .select({
        siteId: metricTargets.siteId,
        metricId: metrics.id,
        metricNameAr: metrics.nameAr,
        unitAr: metrics.unitAr,
        decimals: metrics.decimals,
        value: metricTargets.value,
      })
      .from(metricTargets)
      .innerJoin(initiativeSites, eq(metricTargets.siteId, initiativeSites.id))
      .innerJoin(metrics, eq(metricTargets.metricId, metrics.id))
      .where(eq(initiativeSites.initiativeId, initiativeId))
      .orderBy(asc(metrics.displayOrder), asc(metrics.nameAr)),

    db
      .select({
        metricId: metrics.id,
        metricSlug: metrics.slug,
        metricNameAr: metrics.nameAr,
        unitAr: metrics.unitAr,
        decimals: metrics.decimals,
        value: metricTargets.value,
        noteAr: metricTargets.noteAr,
      })
      .from(metricTargets)
      .innerJoin(metrics, eq(metricTargets.metricId, metrics.id))
      .where(eq(metricTargets.initiativeId, initiativeId))
      .orderBy(asc(metrics.displayOrder), asc(metrics.nameAr)),
  ])

  const [rollup, progress, work] = await Promise.all([
    computeRollup(initiativeId),
    loadInitiativeProgress(initiativeId),
    loadInitiativeWork(initiativeId),
  ])

  const targetsBySite = new Map<
    string,
    Array<{
      metricId: string
      metricNameAr: string
      unitAr: string
      decimals: number
      value: number
    }>
  >()

  for (const target of siteTargetRows) {
    if (!target.siteId) continue

    const list = targetsBySite.get(target.siteId) ?? []

    list.push({
      metricId: target.metricId,
      metricNameAr: target.metricNameAr,
      unitAr: target.unitAr,
      decimals: target.decimals,
      value: Number(target.value),
    })

    targetsBySite.set(target.siteId, list)
  }

  /** الملاحظات الداخلية لا تخرج إلا لمن يملك القدرة صراحةً. */
  const canSeeNotes = viewer.capabilities.includes('initiatives.notes.view')

  return {
    id: row.id,
    programId: row.programId,
    programNameAr: head.programNameAr,
    kind: row.kind,
    contributorNameAr: row.contributorNameAr,
    contributorKind: row.contributorKind,
    coverImageUrl: row.coverImageUrl,
    storyAr: row.storyAr,
    slug: row.slug,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    summaryAr: row.summaryAr,
    season: row.season,
    status: row.status,
    targetRollup: row.targetRollup,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    launchedAt: row.launchedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    leadUserId: row.leadUserId,
    leadNameAr: head.leadNameAr,
    internalNotesAr: canSeeNotes ? row.internalNotesAr : null,
    areaCount: areaRows.length,
    siteCount: siteRows.length,
    createdAt: row.createdAt.toISOString(),

    areas: areaRows,

    sites: siteRows.map((item) => ({
      id: item.site.id,
      areaId: item.site.areaId,
      areaNameAr: item.areaNameAr,
      nameAr: item.site.nameAr,
      descriptionAr: item.site.descriptionAr,
      status: item.site.status,
      lat: toNumber(item.site.lat),
      lng: toNumber(item.site.lng),
      startsAt: item.site.startsAt?.toISOString() ?? null,
      endsAt: item.site.endsAt?.toISOString() ?? null,
      displayOrder: item.site.displayOrder,
      targets: targetsBySite.get(item.site.id) ?? [],
    })),

    targets: targetRows.map((target) => ({
      metricId: target.metricId,
      metricSlug: target.metricSlug,
      metricNameAr: target.metricNameAr,
      unitAr: target.unitAr,
      decimals: target.decimals,
      value: Number(target.value),
      noteAr: target.noteAr,
    })),

    progress,
    work,
    rollup,
  }
}

// ── الكتابة ────────────────────────────────────────────────────────────

export async function createInitiative(
  input: dto.CreateInitiativeBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const [program] = await db
    .select({
      id: programs.id,
      nameAr: programs.nameAr,
      isActive: programs.isActive,
      defaultTargetRollup: programs.defaultTargetRollup,
    })
    .from(programs)
    .where(eq(programs.id, input.programId))
    .limit(1)

  if (!program) throw errors.unprocessable('البرنامج غير موجود.')

  if (!program.isActive) {
    throw errors.unprocessable('البرنامج معطّل، فلا تُنشأ تحته مبادرات جديدة.')
  }

  const startsAt = parseDate(input.startsAt)
  const endsAt = parseDate(input.endsAt)

  assertDateOrder(startsAt, endsAt)

  const nameAr = normalizeText(input.nameAr)

  const created = await db.transaction(async (tx) => {
    const [initiative] = await tx
      .insert(initiatives)
      .values({
        programId: input.programId,
        nameAr,
        // سياسة المطابقة تُنسخ من البرنامج ثم تستقل: مبادرتان تحته قد
        // تختلفان في الصرامة، وربطهما بصف البرنامج يجعل تعديله يغيّر
        // قواعد مبادرة جارية.
        targetRollup: input.targetRollup ?? program.defaultTargetRollup,
        ...(input.nameEn ? { nameEn: normalizeText(input.nameEn) } : {}),
        ...(input.summaryAr ? { summaryAr: input.summaryAr } : {}),
        ...(input.season ? { season: normalizeText(input.season) } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
        ...(input.leadUserId ? { leadUserId: input.leadUserId } : {}),
        ...(input.internalNotesAr
          ? { internalNotesAr: input.internalNotesAr }
          : {}),
      })
      .returning({ id: initiatives.id })

    if (!initiative) throw new Error('Failed to create initiative.')

    /**
     * نسخ قوالب البرنامج داخل المعاملة نفسها: مبادرة أُنشئت بلا خطتها
     * تبدو جاهزة وهي فارغة، ولا شيء يعيد تشغيل النسخ لاحقًا.
     */
    const templateCount = await instantiateProgramTemplates(tx, {
      initiativeId: initiative.id,
      programId: input.programId,
      startsAt,
      createdById: actor.userId,
    })

    await recordAudit(
      {
        action: 'initiative.created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiative.id,
        entityLabel: nameAr,
        summaryAr: `إنشاء مبادرة تحت برنامج ${program.nameAr}`,
        metadata: { programId: input.programId, templateCount },
        ...trace,
      },
      tx,
    )

    return initiative.id
  })

  return loadInitiativeDetail(created, actor)
}

export async function updateInitiative(
  initiativeId: string,
  input: dto.UpdateInitiativeBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const existing = await requireInitiative(initiativeId)

  /**
   * التواريخ تُفحص بعد الدمج مع المحفوظ لا على المرسل وحده: إرسال تاريخ
   * انتهاء أسبق من بدءٍ قائم يمرّ من التحقق ثم يصطدم بقيد القاعدة.
   */
  const startsAt =
    input.startsAt === undefined ? existing.startsAt : parseDate(input.startsAt)
  const endsAt =
    input.endsAt === undefined ? existing.endsAt : parseDate(input.endsAt)

  assertDateOrder(startsAt, endsAt)

  if (input.slug && input.slug !== existing.slug) {
    const [duplicate] = await db
      .select({ id: initiatives.id })
      .from(initiatives)
      .where(eq(initiatives.slug, input.slug))
      .limit(1)

    if (duplicate) throw errors.conflict('الـslug مستخدم بمبادرة أخرى.')
  }

  const changes = {
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.nameAr ? { nameAr: normalizeText(input.nameAr) } : {}),
    ...(input.nameEn !== undefined
      ? { nameEn: input.nameEn ? normalizeText(input.nameEn) : null }
      : {}),
    ...(input.storyAr !== undefined ? { storyAr: input.storyAr || null } : {}),
    ...(input.coverImageUrl !== undefined
      ? { coverImageUrl: input.coverImageUrl || null }
      : {}),
    ...(input.summaryAr !== undefined
      ? { summaryAr: input.summaryAr || null }
      : {}),
    ...(input.season !== undefined
      ? { season: input.season ? normalizeText(input.season) : null }
      : {}),
    ...(input.startsAt !== undefined ? { startsAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt } : {}),
    ...(input.targetRollup ? { targetRollup: input.targetRollup } : {}),
    ...(input.leadUserId !== undefined
      ? { leadUserId: input.leadUserId || null }
      : {}),
    ...(input.internalNotesAr !== undefined
      ? { internalNotesAr: input.internalNotesAr || null }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(initiatives)
        .set(changes)
        .where(eq(initiatives.id, initiativeId))

      await recordAudit(
        {
          action: 'initiative.updated',
          actorUserId: actor.userId,
          entityType: 'initiative',
          entityId: initiativeId,
          entityLabel: existing.nameAr,
          summaryAr: 'تعديل المبادرة',
          metadata: { fields: Object.keys(changes) },
          ...trace,
        },
        tx,
      )
    })
  }

  return loadInitiativeDetail(initiativeId, actor)
}

export async function addArea(
  initiativeId: string,
  input: dto.AddAreaBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)
  const area = await requireArea(input.areaId)

  const [existing] = await db
    .select({ id: initiativeAreas.id })
    .from(initiativeAreas)
    .where(
      and(
        eq(initiativeAreas.initiativeId, initiativeId),
        eq(initiativeAreas.areaId, input.areaId),
      ),
    )
    .limit(1)

  if (existing) throw errors.conflict('المنطقة معلنة بالفعل لهذه المبادرة.')

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(initiativeAreas)
      .values({
        initiativeId,
        areaId: input.areaId,
        ...(input.noteAr ? { noteAr: input.noteAr } : {}),
      })
      .returning({ id: initiativeAreas.id })

    if (!created) throw new Error('Failed to declare initiative area.')

    await recordAudit(
      {
        action: 'initiative.area_added',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: `إعلان النطاق: ${area.nameAr}`,
        metadata: { areaId: input.areaId, areaPath: area.path },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeDetail(initiativeId, actor)
}

export async function removeArea(
  initiativeId: string,
  areaId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(initiativeAreas)
      .where(
        and(
          eq(initiativeAreas.initiativeId, initiativeId),
          eq(initiativeAreas.areaId, areaId),
        ),
      )
      .returning({ id: initiativeAreas.id })

    if (removed.length === 0) {
      throw errors.notFound('المنطقة غير معلنة لهذه المبادرة.')
    }

    await recordAudit(
      {
        action: 'initiative.area_removed',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: 'سحب نطاق جغرافي معلن',
        metadata: { areaId },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeDetail(initiativeId, actor)
}

export async function addSite(
  initiativeId: string,
  input: dto.CreateSiteBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  if (input.areaId) await requireArea(input.areaId)

  const lat = input.lat ?? null
  const lng = input.lng ?? null
  const startsAt = parseDate(input.startsAt)
  const endsAt = parseDate(input.endsAt)

  assertCoordinatePair(lat, lng)
  assertDateOrder(startsAt, endsAt)

  const nameAr = normalizeText(input.nameAr)

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(initiativeSites)
      .values({
        initiativeId,
        nameAr,
        status: input.status,
        displayOrder: input.displayOrder,
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.descriptionAr ? { descriptionAr: input.descriptionAr } : {}),
        ...(lat !== null ? { lat: String(lat) } : {}),
        ...(lng !== null ? { lng: String(lng) } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
      })
      .returning({ id: initiativeSites.id })

    if (!created) throw new Error('Failed to create initiative site.')

    await recordAudit(
      {
        action: 'initiative.site_added',
        actorUserId: actor.userId,
        entityType: 'initiative_site',
        entityId: created.id,
        entityLabel: nameAr,
        summaryAr: `إضافة موقع تنفيذ إلى ${initiative.nameAr}`,
        metadata: { initiativeId },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeDetail(initiativeId, actor)
}

export async function updateSite(
  initiativeId: string,
  siteId: string,
  input: dto.UpdateSiteBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const site = await requireSite(initiativeId, siteId)

  if (input.areaId) await requireArea(input.areaId)

  // الإحداثيان والتاريخان يُفحصان بعد الدمج مع المحفوظ: تعديل أحدهما وحده
  // قد يكسر قيدًا لا يعرفه المرسل.
  const lat = input.lat === undefined ? toNumber(site.lat) : input.lat
  const lng = input.lng === undefined ? toNumber(site.lng) : input.lng
  const startsAt =
    input.startsAt === undefined ? site.startsAt : parseDate(input.startsAt)
  const endsAt =
    input.endsAt === undefined ? site.endsAt : parseDate(input.endsAt)

  assertCoordinatePair(lat, lng)
  assertDateOrder(startsAt, endsAt)

  const changes = {
    ...(input.areaId !== undefined ? { areaId: input.areaId || null } : {}),
    ...(input.nameAr ? { nameAr: normalizeText(input.nameAr) } : {}),
    ...(input.descriptionAr !== undefined
      ? { descriptionAr: input.descriptionAr || null }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.lat !== undefined
      ? { lat: input.lat === null ? null : String(input.lat) }
      : {}),
    ...(input.lng !== undefined
      ? { lng: input.lng === null ? null : String(input.lng) }
      : {}),
    ...(input.startsAt !== undefined ? { startsAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt } : {}),
    ...(input.displayOrder !== undefined
      ? { displayOrder: input.displayOrder }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(initiativeSites)
        .set(changes)
        .where(eq(initiativeSites.id, siteId))

      await recordAudit(
        {
          action: 'initiative.site_updated',
          actorUserId: actor.userId,
          entityType: 'initiative_site',
          entityId: siteId,
          entityLabel: site.nameAr,
          summaryAr: 'تعديل موقع تنفيذ',
          metadata: { initiativeId, fields: Object.keys(changes) },
          ...trace,
        },
        tx,
      )
    })
  }

  return loadInitiativeDetail(initiativeId, actor)
}

/**
 * الهدف صف واحد لكل مؤشر في كل نطاق، تفرضه فهارس جزئية فريدة.
 *
 * الكتابة نفسها `ON CONFLICT DO UPDATE` لا قراءةً ثم تفرّعًا: تحت
 * READ COMMITTED يقرأ إرسالان متزامنان «لا صف» كلاهما فيدرجان معًا،
 * ويسقط الثاني بتعارض فهرس على شكل خطأ ٥٠٠. و`targetWhere` مذكور لأن
 * الفهرس جزئي: بدون تكرار شرطه لا تعرف Postgres أيَّ فهرس يقصد
 * `ON CONFLICT`.
 *
 * القراءة السابقة باقية لأن السجل يحتاج القيمة القديمة، لا لأنها تحمي
 * من التزامن.
 */
async function upsertTarget(
  scope: { initiativeId: string; siteId?: string | undefined },
  input: dto.UpsertTargetBody,
  actor: AuthContext,
  trace: RequestTrace,
  context: { entityId: string; entityLabel: string; summaryAr: string },
) {
  const metric = await requireMetric(input.metricId)

  await db.transaction(async (tx) => {
    await lockInitiative(tx, scope.initiativeId)

    /** عمود النطاق واحد: هو مفتاح الفهرس الجزئي وشرطه معًا. */
    const scopeColumn = scope.siteId
      ? metricTargets.siteId
      : metricTargets.initiativeId

    const scopeCondition = scope.siteId
      ? eq(metricTargets.siteId, scope.siteId)
      : eq(metricTargets.initiativeId, scope.initiativeId)

    const [existing] = await tx
      .select({ value: metricTargets.value })
      .from(metricTargets)
      .where(and(scopeCondition, eq(metricTargets.metricId, input.metricId)))
      .limit(1)

    await tx
      .insert(metricTargets)
      .values({
        metricId: input.metricId,
        value: String(input.value),
        ...(scope.siteId
          ? { siteId: scope.siteId }
          : { initiativeId: scope.initiativeId }),
        ...(input.noteAr ? { noteAr: input.noteAr } : {}),
      })
      .onConflictDoUpdate({
        target: [scopeColumn, metricTargets.metricId],
        targetWhere: sql`${scopeColumn} is not null`,
        set: {
          value: String(input.value),
          ...(input.noteAr !== undefined ? { noteAr: input.noteAr || null } : {}),
        },
      })

    await recordAudit(
      {
        action: 'initiative.target_set',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: scope.siteId ? 'initiative_site' : 'initiative',
        entityId: context.entityId,
        entityLabel: context.entityLabel,
        summaryAr: context.summaryAr,
        metadata: {
          metricId: input.metricId,
          metricNameAr: metric.nameAr,
          value: input.value,
          previousValue: existing ? Number(existing.value) : null,
        },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeDetail(scope.initiativeId, actor)
}

export async function setInitiativeTarget(
  initiativeId: string,
  input: dto.UpsertTargetBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  return upsertTarget({ initiativeId }, input, actor, trace, {
    entityId: initiativeId,
    entityLabel: initiative.nameAr,
    summaryAr: 'تحديد هدف على مستوى المبادرة',
  })
}

export async function setSiteTarget(
  initiativeId: string,
  siteId: string,
  input: dto.UpsertTargetBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const site = await requireSite(initiativeId, siteId)

  return upsertTarget({ initiativeId, siteId }, input, actor, trace, {
    entityId: siteId,
    entityLabel: site.nameAr,
    summaryAr: 'تحديد هدف على مستوى الموقع',
  })
}

/**
 * بوابة بدء التنفيذ.
 *
 * الفحص والقفل داخل المعاملة لا قبلها: بين فحصٍ خارجها وكتابةٍ بعده نافذةٌ
 * يتغير فيها هدف موقع، فتبدأ مبادرة بأهداف لم تُطابق قط.
 *
 * مبادرة بلا موقع غير قابلة للتنفيذ — المواقع الملغاة لا تُحتسب لأنها
 * ليست أماكن تنفيذ، وهو المنطق نفسه الذي يُخرجها من مجموع المطابقة.
 */
export async function launchInitiative(
  initiativeId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const warnings = await db.transaction(async (tx) => {
    const initiative = await lockInitiative(tx, initiativeId)

    if (initiative.status === 'ACTIVE') {
      throw errors.conflict('المبادرة قيد التنفيذ بالفعل.')
    }

    if (!LAUNCHABLE_STATUSES.includes(initiative.status)) {
      throw errors.conflict('لا يبدأ تنفيذ مبادرة مغلقة أو ملغاة.')
    }

    const [tally] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(initiativeSites)
      .where(
        and(
          eq(initiativeSites.initiativeId, initiativeId),
          ne(initiativeSites.status, 'CANCELLED'),
        ),
      )

    if (!tally || tally.total === 0) {
      throw errors.unprocessable(
        'لا يبدأ تنفيذ مبادرة بلا مواقع. أضف موقعًا واحدًا على الأقل.',
      )
    }

    const rollup = await computeRollup(initiativeId, tx)
    const mismatches = rollup.metrics.filter((metric) => !metric.matches)

    if (rollup.policy === 'STRICT' && mismatches.length > 0) {
      throw errors.unprocessable(
        'مجموع أهداف المواقع لا يطابق أهداف المبادرة.',
        mismatches,
      )
    }

    /**
     * الحالة شرطٌ في التحديث لا فحصٌ سبقه: صفر صف معاد يعني أن طلبًا آخر
     * سبقنا، وبدونه يكتب الثاني تاريخ بدء ثانيًا وسطرَ سجلٍّ ثانيًا لبدء
     * واحد.
     */
    const launched = await tx
      .update(initiatives)
      .set({
        status: 'ACTIVE',
        launchedAt: new Date(),
        launchedById: actor.userId,
      })
      .where(
        and(
          eq(initiatives.id, initiativeId),
          inArray(initiatives.status, LAUNCHABLE_STATUSES),
        ),
      )
      .returning({ id: initiatives.id })

    if (launched.length === 0) {
      throw errors.conflict('سبق أن بدأ تنفيذ المبادرة أو تغيّرت حالتها.')
    }

    await recordAudit(
      {
        action: 'initiative.launched',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: 'بدء تنفيذ المبادرة',
        metadata: {
          policy: rollup.policy,
          siteCount: tally.total,
          mismatchCount: mismatches.length,
        },
        ...trace,
      },
      tx,
    )

    // تحت ADVISORY يمرّ الاختلاف لكنه لا يُبتلع: يعود مع الاستجابة ليقرره المسؤول.
    return rollup.policy === 'ADVISORY' ? mismatches : []
  })

  const detail = await loadInitiativeDetail(initiativeId, actor)

  return { ...detail, warnings }
}

export async function completeInitiative(
  initiativeId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  if (initiative.status !== 'ACTIVE') {
    throw errors.conflict('لا تُغلق إلا مبادرة قيد التنفيذ.')
  }

  await db.transaction(async (tx) => {
    const completed = await tx
      .update(initiatives)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(
        and(eq(initiatives.id, initiativeId), eq(initiatives.status, 'ACTIVE')),
      )
      .returning({ id: initiatives.id })

    if (completed.length === 0) {
      throw errors.conflict('تغيّرت حالة المبادرة قبل تنفيذ الإغلاق.')
    }

    await recordAudit(
      {
        action: 'initiative.completed',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: 'إغلاق المبادرة',
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeDetail(initiativeId, actor)
}

export async function cancelInitiative(
  initiativeId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  if (initiative.status === 'COMPLETED' || initiative.status === 'CANCELLED') {
    throw errors.conflict('المبادرة مغلقة أو ملغاة أصلًا.')
  }

  await db.transaction(async (tx) => {
    const cancelled = await tx
      .update(initiatives)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(initiatives.id, initiativeId),
          inArray(initiatives.status, CANCELLABLE_STATUSES),
        ),
      )
      .returning({ id: initiatives.id })

    if (cancelled.length === 0) {
      throw errors.conflict('تغيّرت حالة المبادرة قبل تنفيذ الإلغاء.')
    }

    await recordAudit(
      {
        action: 'initiative.cancelled',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: 'إلغاء المبادرة',
        metadata: { previousStatus: initiative.status },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeDetail(initiativeId, actor)
}
