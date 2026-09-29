import {
  type SQL,
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { isUniqueViolation } from '../../common/utils/db-errors.js'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/identity.js'
import { impactEntries, metricTargets, metrics } from '../../db/schema/metrics.js'
import {
  initiativeSites,
  initiatives,
  programs,
} from '../../db/schema/programs.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type * as dto from './impact.schemas.js'

export type ImpactScope = {
  kind: 'PROGRAM' | 'INITIATIVE' | 'SITE'
  id: string
}

export type ScopeProgress = {
  metricId: string
  metricSlug: string
  metricNameAr: string
  unitAr: string
  aggregation: string
  decimals: number
  target: number | null
  siteTargetSum: number
  actual: number
  unverified: number
  percent: number | null
}

export type MetricProgress = Omit<ScopeProgress, 'target'> & {
  initiativeTarget: number | null
}

const recorder = alias(users, 'impact_recorder')
const verifier = alias(users, 'impact_verifier')
const reversalEntry = alias(impactEntries, 'impact_reversal')
const scopeProgram = alias(programs, 'impact_scope_program')
const scopeInitiative = alias(initiatives, 'impact_scope_initiative')
const scopeSite = alias(initiativeSites, 'impact_scope_site')

// ── النطاق ─────────────────────────────────────────────────────────────

/**
 * شرط النطاق يصعد لأعلى دائمًا: قيد المبادرة يشمل قيود مواقعها، وقيد
 * البرنامج يشمل مبادراته ومواقعها.
 *
 * الفريق الميداني يسجّل الرقم على الموقع الذي عمل فيه، لا على الحملة.
 * قصر مجموع الحملة على القيود المعلَّقة عليها مباشرةً يجعل لوحة التقدم
 * تُظهر صفرًا بينما الأرض مزروعة — وهو أسهل خطأ يقع في هذه الوحدة.
 */
function scopeCondition(scope: ImpactScope): SQL {
  if (scope.kind === 'SITE') {
    return sql`${impactEntries.siteId} = ${scope.id}`
  }

  if (scope.kind === 'INITIATIVE') {
    return sql`(${impactEntries.initiativeId} = ${scope.id}
      or ${impactEntries.siteId} in (
        select ${initiativeSites.id} from ${initiativeSites}
         where ${initiativeSites.initiativeId} = ${scope.id}))`
  }

  return sql`(${impactEntries.programId} = ${scope.id}
    or ${impactEntries.initiativeId} in (
      select ${initiatives.id} from ${initiatives}
       where ${initiatives.programId} = ${scope.id})
    or ${impactEntries.siteId} in (
      select ${initiativeSites.id} from ${initiativeSites}
       join ${initiatives} on ${initiatives.id} = ${initiativeSites.initiativeId}
       where ${initiatives.programId} = ${scope.id}))`
}

/**
 * المدخلان العامّان — تسجيل قيد وملخص — يرفضان أكثر من نطاق واحد في
 * `.refine()` بـ`impact.schemas.ts` قبل الوصول إلى هنا، فترتيب الأولوية
 * لا يُطبَّق إلا على نداء داخلي. لذلك يحسم بصمت بدل أن يرمي خطأ تعارضٍ
 * لا يراه مستخدم قط.
 */
function resolveScope(input: {
  initiativeId?: string | undefined
  siteId?: string | undefined
  programId?: string | undefined
}): ImpactScope {
  if (input.siteId) return { kind: 'SITE', id: input.siteId }
  if (input.initiativeId) return { kind: 'INITIATIVE', id: input.initiativeId }
  if (input.programId) return { kind: 'PROGRAM', id: input.programId }

  throw errors.unprocessable('حدد نطاقًا واحدًا: برنامج أو مبادرة أو موقع.')
}

async function findScopeLabel(scope: ImpactScope): Promise<string | null> {
  if (scope.kind === 'SITE') {
    const [row] = await db
      .select({ nameAr: initiativeSites.nameAr })
      .from(initiativeSites)
      .where(eq(initiativeSites.id, scope.id))
      .limit(1)

    return row?.nameAr ?? null
  }

  if (scope.kind === 'INITIATIVE') {
    const [row] = await db
      .select({ nameAr: initiatives.nameAr })
      .from(initiatives)
      .where(eq(initiatives.id, scope.id))
      .limit(1)

    return row?.nameAr ?? null
  }

  const [row] = await db
    .select({ nameAr: programs.nameAr })
    .from(programs)
    .where(eq(programs.id, scope.id))
    .limit(1)

  return row?.nameAr ?? null
}

// ── التجميع ────────────────────────────────────────────────────────────

/**
 * تعبير التجميع يتفرّع على `metrics.aggregation` داخل SQL نفسها، فيُحسب
 * كل المؤشرات باستعلام واحد مهما اختلفت دوالها.
 *
 * القيد العكسي صف سالب، فيطرح نفسه من `SUM` تلقائيًا. لكنه بلا معنى في
 * `MAX` و`LATEST`: «أكبر قيمة» تساوي سالبًا ليست قراءة، و«آخر قيمة» قد
 * تكون هي التصحيح نفسه. لذلك تستبعد الدالتان القيدَ العكسي والقيدَ الذي
 * عُكس معًا، فيعود المؤشر إلى آخر قراءة صالحة بدل رقم مصطنع.
 */
function aggregated(gate: SQL) {
  const settled = sql`${gate}
    and ${impactEntries.reversalOfId} is null
    and ${reversalEntry.id} is null`

  return sql<string>`case ${metrics.aggregation}
    when 'SUM' then coalesce(sum(${impactEntries.value}) filter (where ${gate}), 0)
    when 'MAX' then coalesce(max(${impactEntries.value}) filter (where ${settled}), 0)
    when 'LATEST' then coalesce((
      array_agg(${impactEntries.value}
        order by ${impactEntries.occurredAt} desc, ${impactEntries.createdAt} desc)
      filter (where ${settled}))[1], 0)
    else 0
  end`
}

async function aggregateScope(scope: ImpactScope) {
  return db
    .select({
      metricId: metrics.id,
      verified: aggregated(sql`${impactEntries.verifiedAt} is not null`),
      unverified: aggregated(sql`${impactEntries.verifiedAt} is null`),
    })
    .from(impactEntries)
    .innerJoin(metrics, eq(impactEntries.metricId, metrics.id))
    .leftJoin(reversalEntry, eq(reversalEntry.reversalOfId, impactEntries.id))
    .where(scopeCondition(scope))
    .groupBy(metrics.id, metrics.aggregation)
}

async function scopeTargets(scope: ImpactScope) {
  const column =
    scope.kind === 'SITE'
      ? metricTargets.siteId
      : scope.kind === 'INITIATIVE'
        ? metricTargets.initiativeId
        : metricTargets.programId

  const rows = await db
    .select({ metricId: metricTargets.metricId, value: metricTargets.value })
    .from(metricTargets)
    .where(eq(column, scope.id))

  return new Map(rows.map((row) => [row.metricId, Number(row.value)]))
}

/**
 * الملغى يخرج من مجموع الأهداف، موقعًا كان أو مبادرة بكاملها؛ إبقاؤه
 * يضخّم خطة لن تُنفَّذ.
 */
async function siteTargetSums(scope: ImpactScope) {
  if (scope.kind === 'SITE') return new Map<string, number>()

  const rows = await db
    .select({
      metricId: metricTargets.metricId,
      total: sql<string>`coalesce(sum(${metricTargets.value}), 0)`,
    })
    .from(metricTargets)
    .innerJoin(initiativeSites, eq(metricTargets.siteId, initiativeSites.id))
    .innerJoin(initiatives, eq(initiativeSites.initiativeId, initiatives.id))
    .where(
      and(
        scope.kind === 'INITIATIVE'
          ? eq(initiativeSites.initiativeId, scope.id)
          : and(
              eq(initiatives.programId, scope.id),
              // المكتملة تبقى محسوبة: خطة مبادرة انتهت كانت خطة حقيقية.
              ne(initiatives.status, 'CANCELLED'),
            ),
        ne(initiativeSites.status, 'CANCELLED'),
      ),
    )
    .groupBy(metricTargets.metricId)

  return new Map(rows.map((row) => [row.metricId, Number(row.total)]))
}

/**
 * المؤشرات المعروضة هي كل ما له هدف في هذا النطاق أو في أحد مواقعه أو
 * قيد مسجَّل فيه.
 *
 * إدراج أهداف المواقع في هذه المجموعة مقصود: مبادرة وُزّعت أهدافها على
 * مواقعها دون هدف كلي، ولم يُسجَّل فيها قيد بعد، كانت ستظهر بلوحة تقدم
 * فارغة يوم انطلاقها — وهو أول يوم يُنظر فيه إليها.
 */
export async function loadScopeProgress(
  scope: ImpactScope,
): Promise<ScopeProgress[]> {
  const [targets, siteSums, aggregates] = await Promise.all([
    scopeTargets(scope),
    siteTargetSums(scope),
    aggregateScope(scope),
  ])

  const totals = new Map(
    aggregates.map((row) => [
      row.metricId,
      { actual: Number(row.verified), unverified: Number(row.unverified) },
    ]),
  )

  const metricIds = [
    ...new Set([...targets.keys(), ...siteSums.keys(), ...totals.keys()]),
  ]

  if (metricIds.length === 0) return []

  const catalog = await db
    .select({
      id: metrics.id,
      slug: metrics.slug,
      nameAr: metrics.nameAr,
      unitAr: metrics.unitAr,
      aggregation: metrics.aggregation,
      decimals: metrics.decimals,
    })
    .from(metrics)
    .where(inArray(metrics.id, metricIds))
    .orderBy(asc(metrics.displayOrder), asc(metrics.nameAr))

  return catalog.map((metric) => {
    const target = targets.get(metric.id) ?? null
    const totalsRow = totals.get(metric.id)
    const actual = totalsRow?.actual ?? 0

    return {
      metricId: metric.id,
      metricSlug: metric.slug,
      metricNameAr: metric.nameAr,
      unitAr: metric.unitAr,
      aggregation: metric.aggregation,
      decimals: metric.decimals,
      target,
      siteTargetSum: siteSums.get(metric.id) ?? 0,
      actual,
      unverified: totalsRow?.unverified ?? 0,
      // هدف صفري ليس نسبة مئوية بل قسمة على صفر؛ يُعامَل كغياب هدف.
      percent:
        target !== null && target > 0
          ? Math.round((actual / target) * 1000) / 10
          : null,
    }
  })
}

export async function loadInitiativeProgress(
  initiativeId: string,
): Promise<MetricProgress[]> {
  const rows = await loadScopeProgress({ kind: 'INITIATIVE', id: initiativeId })

  return rows.map(({ target, ...rest }) => ({ ...rest, initiativeTarget: target }))
}

export async function loadSummary(query: dto.SummaryQuery) {
  return loadScopeSummary(resolveScope(query))
}

export async function loadScopeSummary(scope: ImpactScope) {
  const scopeNameAr = await findScopeLabel(scope)

  if (scopeNameAr === null) throw errors.notFound('النطاق المطلوب غير موجود.')

  return {
    scope: scope.kind,
    scopeId: scope.id,
    scopeNameAr,
    metrics: await loadScopeProgress(scope),
  }
}

// ── الدفتر ─────────────────────────────────────────────────────────────

const entryColumns = {
  id: impactEntries.id,
  metricId: impactEntries.metricId,
  metricSlug: metrics.slug,
  metricNameAr: metrics.nameAr,
  unitAr: metrics.unitAr,
  decimals: metrics.decimals,
  programId: impactEntries.programId,
  initiativeId: impactEntries.initiativeId,
  siteId: impactEntries.siteId,
  programNameAr: scopeProgram.nameAr,
  initiativeNameAr: scopeInitiative.nameAr,
  siteNameAr: scopeSite.nameAr,
  value: impactEntries.value,
  source: impactEntries.source,
  occurredAt: impactEntries.occurredAt,
  noteAr: impactEntries.noteAr,
  recordedById: impactEntries.recordedById,
  recordedByNameAr: recorder.fullNameAr,
  verifiedAt: impactEntries.verifiedAt,
  verifiedByNameAr: verifier.fullNameAr,
  reversalOfId: impactEntries.reversalOfId,
  reversedByEntryId: reversalEntry.id,
  createdAt: impactEntries.createdAt,
}

/**
 * جداول النطاق تُوصل بأسماء مستعارة لا بأسمائها الأصلية، لأن شرط الترشيح
 * يحوي استعلامات فرعية على الجداول نفسها؛ تطابق الأسماء كان سيحوّلها إلى
 * استعلامات مرتبطة تعيد نتيجة أخرى بصمت.
 */
function entryQuery() {
  return db
    .select(entryColumns)
    .from(impactEntries)
    .innerJoin(metrics, eq(impactEntries.metricId, metrics.id))
    .leftJoin(recorder, eq(impactEntries.recordedById, recorder.id))
    .leftJoin(verifier, eq(impactEntries.verifiedById, verifier.id))
    .leftJoin(reversalEntry, eq(reversalEntry.reversalOfId, impactEntries.id))
    .leftJoin(scopeProgram, eq(impactEntries.programId, scopeProgram.id))
    .leftJoin(scopeInitiative, eq(impactEntries.initiativeId, scopeInitiative.id))
    .leftJoin(scopeSite, eq(impactEntries.siteId, scopeSite.id))
}

type EntryRow = Awaited<ReturnType<typeof entryQuery>>[number]

function serializeEntry(row: EntryRow) {
  return {
    id: row.id,
    metricId: row.metricId,
    metricSlug: row.metricSlug,
    metricNameAr: row.metricNameAr,
    unitAr: row.unitAr,
    decimals: row.decimals,
    scope: row.siteId ? 'SITE' : row.initiativeId ? 'INITIATIVE' : 'PROGRAM',
    programId: row.programId,
    initiativeId: row.initiativeId,
    siteId: row.siteId,
    scopeLabelAr: row.siteNameAr ?? row.initiativeNameAr ?? row.programNameAr,
    value: Number(row.value),
    source: row.source,
    occurredAt: row.occurredAt.toISOString(),
    noteAr: row.noteAr,
    recordedById: row.recordedById,
    recordedByNameAr: row.recordedByNameAr,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedByNameAr: row.verifiedByNameAr,
    reversalOfId: row.reversalOfId,
    reversedByEntryId: row.reversedByEntryId,
    createdAt: row.createdAt.toISOString(),
  }
}

async function loadEntry(entryId: string) {
  const [row] = await entryQuery().where(eq(impactEntries.id, entryId)).limit(1)

  if (!row) throw errors.notFound('قيد الأثر غير موجود.')

  return serializeEntry(row)
}

export async function listEntries(filters: dto.ListEntriesQuery) {
  const conditions = [
    filters.metricId ? eq(impactEntries.metricId, filters.metricId) : undefined,
    filters.siteId ? eq(impactEntries.siteId, filters.siteId) : undefined,
    filters.initiativeId
      ? scopeCondition({ kind: 'INITIATIVE', id: filters.initiativeId })
      : undefined,
    filters.programId
      ? scopeCondition({ kind: 'PROGRAM', id: filters.programId })
      : undefined,
    filters.verified === undefined
      ? undefined
      : filters.verified
        ? isNotNull(impactEntries.verifiedAt)
        : isNull(impactEntries.verifiedAt),
    filters.source ? eq(impactEntries.source, filters.source) : undefined,
  ].filter(Boolean)

  const rows = await entryQuery()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(impactEntries.occurredAt), desc(impactEntries.createdAt))
    .limit(300)

  return rows.map(serializeEntry)
}

async function requireScope(scope: ImpactScope) {
  const label = await findScopeLabel(scope)

  if (label === null) {
    throw errors.unprocessable('النطاق المطلوب تعليق القيد عليه غير موجود.')
  }

  return label
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * التوثيق والعكس يتنازعان الصف نفسه، فيبدأ كلاهما بقفل الأصل ثم يفحص
 * شروطه على الصف المقفول لا على قراءة سابقة.
 *
 * فحصٌ خارج المعاملة يسمح للعمليتين بالمرور معًا تحت READ COMMITTED،
 * فيبقى الأصل موثَّقًا (+100 محتسَبة) وعكسه غير موثَّق (−100 في المعلَّق).
 * لا مسار في الواجهة يصلح ذلك بعدها: توثيق القيد العكسي مرفوض، وعكس ما
 * عُكس مرفوض — فيبقى الرقم المعلن مضخَّمًا إلى الأبد.
 */
async function lockEntry(tx: Transaction, entryId: string) {
  const [row] = await tx
    .select()
    .from(impactEntries)
    .where(eq(impactEntries.id, entryId))
    .limit(1)
    .for('update')

  return row
}

/**
 * الفهرس الجزئي `impact_entries_reversal_unique` هو الحَكَم الأخير حين
 * يسبق كاتبٌ آخر القفل (نسخة أخرى من الخدمة، أو سكربت يكتب مباشرةً):
 * ترجمة 23505 هنا تُبقي الجواب تعارضًا مفهومًا بدل خطأ داخلي.
 */
async function insertReversal(
  tx: Transaction,
  values: typeof impactEntries.$inferInsert,
): Promise<string> {
  let rows: { id: string }[]

  try {
    rows = await tx
      .insert(impactEntries)
      .values(values)
      .returning({ id: impactEntries.id })
  } catch (error) {
    if (isUniqueViolation(error)) throw errors.conflict('سبق عكس هذا القيد.')

    throw error
  }

  const created = rows[0]

  if (!created) throw new Error('Failed to reverse impact entry.')

  return created.id
}

async function findByClientId(clientId: string) {
  const [row] = await entryQuery()
    .where(eq(impactEntries.clientId, clientId))
    .limit(1)

  return row ? serializeEntry(row) : null
}

/**
 * `clientId` يجعل التسجيل آمن التكرار: الهاتف في الميدان يعيد الطلب حين
 * تنقطع الشبكة قبل الجواب، فيعود القيد الأول بدل أن يُسجَّل الرقم مرتين.
 * والفهرس الفريد هو الحَكَم حين يتسابق الطلبان.
 */
export async function recordEntry(
  input: dto.CreateEntryBody,
  actor: AuthContext,
  trace: RequestTrace,
  options: { clientId?: string | undefined } = {},
) {
  if (options.clientId) {
    const existing = await findByClientId(options.clientId)

    if (existing) return existing
  }

  try {
    return await insertEntry(input, actor, trace, options.clientId)
  } catch (error) {
    const raced =
      options.clientId && isUniqueViolation(error)
        ? await findByClientId(options.clientId)
        : null

    if (raced) return raced

    throw error
  }
}

async function insertEntry(
  input: dto.CreateEntryBody,
  actor: AuthContext,
  trace: RequestTrace,
  clientId: string | undefined,
) {
  const scope = resolveScope(input)

  const [metric] = await db
    .select({
      id: metrics.id,
      nameAr: metrics.nameAr,
      unitAr: metrics.unitAr,
      isActive: metrics.isActive,
    })
    .from(metrics)
    .where(eq(metrics.id, input.metricId))
    .limit(1)

  if (!metric) throw errors.unprocessable('المؤشر غير موجود.')

  if (!metric.isActive) {
    throw errors.unprocessable('المؤشر معطّل، ولا تُسجَّل عليه قيود جديدة.')
  }

  const scopeLabel = await requireScope(scope)

  const entryId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(impactEntries)
      .values({
        metricId: input.metricId,
        value: String(input.value),
        source: input.source,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        recordedById: actor.userId,
        ...(input.programId ? { programId: input.programId } : {}),
        ...(input.initiativeId ? { initiativeId: input.initiativeId } : {}),
        ...(input.siteId ? { siteId: input.siteId } : {}),
        ...(input.noteAr ? { noteAr: input.noteAr } : {}),
        ...(clientId ? { clientId } : {}),
      })
      .returning({ id: impactEntries.id })

    if (!created) throw new Error('Failed to record impact entry.')

    await recordAudit(
      {
        action: 'impact.entry_recorded',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'impact_entry',
        entityId: created.id,
        entityLabel: metric.nameAr,
        summaryAr: `تسجيل ${input.value} ${metric.unitAr} على ${scopeLabel}`,
        metadata: {
          metricId: metric.id,
          scope: scope.kind,
          scopeId: scope.id,
          source: input.source,
        },
        ...trace,
      },
      tx,
    )

    return created.id
  })

  return loadEntry(entryId)
}

export async function verifyEntry(
  entryId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await db.transaction(async (tx) => {
    const entry = await lockEntry(tx, entryId)

    if (!entry) throw errors.notFound('قيد الأثر غير موجود.')

    if (entry.verifiedAt) throw errors.conflict('القيد موثَّق سلفًا.')

    /**
     * القيد وعكسه يتحركان معًا في المجاميع أو لا يتحركان.
     *
     * توثيق أحد الطرفين وحده يُدخل نصف المعادلة: عكسٌ موثَّق لأصل غير
     * موثَّق يطرح رقمًا لم يُضف قط فيظهر أثر سالب، وأصلٌ يُوثَّق بعد عكسه
     * يضيف رقمًا سبق إلغاؤه.
     */
    if (entry.reversalOfId) {
      throw errors.conflict(
        'القيد العكسي يتبع أصله في التوثيق ولا يُوثَّق منفردًا.',
      )
    }

    const [reversal] = await tx
      .select({ id: impactEntries.id })
      .from(impactEntries)
      .where(eq(impactEntries.reversalOfId, entryId))
      .limit(1)

    if (reversal) throw errors.conflict('سبق عكس هذا القيد، فلا معنى لتوثيقه.')

    // العمودان يُكتبان معًا: قيد القاعدة يرفض توثيقًا بلا موثِّق.
    await tx
      .update(impactEntries)
      .set({ verifiedAt: new Date(), verifiedById: actor.userId })
      .where(eq(impactEntries.id, entryId))

    await recordAudit(
      {
        action: 'impact.entry_verified',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'impact_entry',
        entityId: entryId,
        summaryAr: 'توثيق قيد أثر',
        metadata: { metricId: entry.metricId, source: entry.source },
        ...trace,
      },
      tx,
    )
  })

  return loadEntry(entryId)
}

/**
 * التصحيح الوحيد المسموح في دفتر إضافي فقط.
 *
 * العكس ينسخ النطاق والمؤشر والمصدر من الأصل ويقلب الإشارة، فيبقى الصفّان
 * ظاهرين ويمكن شرح تقرير أُرسل قبل التصحيح.
 */
export async function reverseEntry(
  entryId: string,
  input: dto.ReverseEntryBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const reversalId = await db.transaction(async (tx) => {
    const original = await lockEntry(tx, entryId)

    if (!original) throw errors.notFound('قيد الأثر غير موجود.')

    /**
     * عكس القيد العكسي يعيد الأثر الأصلي من باب خلفي لا يقرؤه أحد في
     * السجل: صفّان يلغيان بعضهما ثم ثالث يعيد الرقم بلا سبب مكتوب.
     */
    if (original.reversalOfId) {
      throw errors.conflict(
        'هذا القيد تصحيح لقيد آخر ولا يُعكس. سجّل قيدًا جديدًا بالقيمة الصحيحة.',
      )
    }

    /** الفهرس الجزئي يرفض العكس المكرر؛ الفحص هنا ليعرف المستخدم السبب. */
    const [existing] = await tx
      .select({ id: impactEntries.id })
      .from(impactEntries)
      .where(eq(impactEntries.reversalOfId, entryId))
      .limit(1)

    if (existing) throw errors.conflict('سبق عكس هذا القيد.')

    const now = new Date()

    /**
     * النفي على النص لا على الرقم: `numeric(16,4)` يتجاوز مدى الأعداد
     * الصحيحة الآمنة في JavaScript، والمرور بـ`Number` قد يقصّ خانة في
     * رقم كبير — في دفتر أثر ذلك فرق لا يُكتشف إلا في تقرير.
     */
    const negated = original.value.startsWith('-')
      ? original.value.slice(1)
      : `-${original.value}`

    const createdId = await insertReversal(tx, {
      metricId: original.metricId,
      programId: original.programId,
      initiativeId: original.initiativeId,
      siteId: original.siteId,
      value: negated,
      source: original.source,
      occurredAt: now,
      noteAr: input.noteAr,
      recordedById: actor.userId,
      reversalOfId: original.id,
      // عكس قيد محتسَب يُوثَّق فورًا، وإلا بقي الرقم الخاطئ في المجاميع
      // ينتظر توثيق تصحيحه.
      ...(original.verifiedAt
        ? { verifiedAt: now, verifiedById: actor.userId }
        : {}),
    })

    await recordAudit(
      {
        action: 'impact.entry_reversed',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'impact_entry',
        entityId: createdId,
        summaryAr: 'عكس قيد أثر',
        metadata: {
          reversalOfId: original.id,
          metricId: original.metricId,
          wasVerified: original.verifiedAt !== null,
          reason: input.noteAr,
        },
        ...trace,
      },
      tx,
    )

    return createdId
  })

  return loadEntry(reversalId)
}
