import {
  type SQL,
  and,
  asc,
  eq,
  gte,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { isUniqueViolation } from '../../common/utils/db-errors.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { memberships } from '../../db/schema/access.js'
import { fieldGroups } from '../../db/schema/field.js'
import { areas } from '../../db/schema/geo.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import { workItems } from '../../db/schema/work.js'
import {
  type AuthContext,
  loadAuthContext,
  loadOverrides,
} from '../access/access.service.js'
import { effectiveCapabilities } from '../access/capabilities.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { loadScopeProgress } from '../impact/impact.service.js'
import { listTasks } from '../work/work.service.js'
import type { FieldPrincipal } from './field-auth.js'
import type * as dto from './field.schemas.js'

const DAY_MS = 86_400_000

/**
 * ما يُقبل بعد إغلاق المبادرة: ما التُقط في الميدان بلا شبكة يصل حين تعود،
 * وقد يكون المنسّق أغلق الحملة مساء يومها. رفضه يُضيّع ما سُجّل فعلًا.
 */
const ENTRY_GRACE_DAYS = 14

/** مجموعة مضى موعدها بأكثر من هذا لا تُعرض على قائدها: انتهى يومها. */
const HOME_WINDOW_DAYS = 14

const lead = alias(users, 'field_group_lead')

type InitiativeRow = typeof initiatives.$inferSelect

export function acceptsEntries(
  initiative: Pick<InitiativeRow, 'status' | 'completedAt'>,
  now = new Date(),
) {
  if (initiative.status === 'ACTIVE') return true

  return (
    initiative.status === 'COMPLETED' &&
    initiative.completedAt !== null &&
    now.getTime() - initiative.completedAt.getTime() <= ENTRY_GRACE_DAYS * DAY_MS
  )
}

// ── المنسّق: القراءة ───────────────────────────────────────────────────

const groupColumns = {
  id: fieldGroups.id,
  initiativeId: fieldGroups.initiativeId,
  siteId: fieldGroups.siteId,
  siteNameAr: initiativeSites.nameAr,
  siteStatus: initiativeSites.status,
  nameAr: fieldGroups.nameAr,
  leadUserId: fieldGroups.leadUserId,
  leadNameAr: lead.fullNameAr,
  meetsAt: fieldGroups.meetsAt,
  meetingPointAr: fieldGroups.meetingPointAr,
  instructionsAr: fieldGroups.instructionsAr,
  displayOrder: fieldGroups.displayOrder,
  createdAt: fieldGroups.createdAt,
}

function groupQuery() {
  return db
    .select(groupColumns)
    .from(fieldGroups)
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .leftJoin(lead, eq(fieldGroups.leadUserId, lead.id))
}

type GroupRow = Awaited<ReturnType<typeof groupQuery>>[number]

function serializeGroup(row: GroupRow) {
  return {
    ...row,
    meetsAt: row.meetsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function requireInitiative(initiativeId: string) {
  const [row] = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!row) throw errors.notFound('المبادرة غير موجودة.')

  return row
}

/** يُستدعى بعد كل تعديل ليعود ميدان المبادرة كاملًا في نداء واحد. */
export async function loadInitiativeField(initiativeId: string) {
  await requireInitiative(initiativeId)

  const rows = await groupQuery()
    .where(eq(fieldGroups.initiativeId, initiativeId))
    .orderBy(
      asc(initiativeSites.displayOrder),
      asc(initiativeSites.nameAr),
      asc(fieldGroups.displayOrder),
      asc(fieldGroups.nameAr),
    )

  return { initiativeId, groups: rows.map(serializeGroup) }
}

/**
 * من يحمل `field.lead` فعلًا، بعد الاستثناءات الفردية على عضوياته.
 *
 * القدرة تُحل هنا كما تُحل في الجلسة، لا بقراءة حزمة الدور وحدها: عضو
 * نُزعت منه القدرة باستثناء لا يُعرض قائدًا، وآخر مُنحها باستثناء يُعرض.
 * الفريق عشرات لا آلاف، فقراءة عضوياته كلها أرخص من استعلام يكرر القاعدة.
 */
export async function listLeadCandidates() {
  const rows = await db
    .select({
      userId: users.id,
      fullNameAr: users.fullNameAr,
      membershipId: memberships.id,
      isPrimary: memberships.isPrimary,
      roleNameAr: roles.nameAr,
      roleCapabilities: roles.capabilities,
      officeNameAr: offices.nameAr,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .innerJoin(offices, eq(memberships.officeId, offices.id))
    .where(
      and(
        eq(memberships.status, 'ACTIVE'),
        eq(users.kind, 'STAFF'),
        eq(users.status, 'ACTIVE'),
      ),
    )
    // العضوية الرئيسية أولًا، فهي ما يُعرض حين تمنح القدرةَ أكثرُ من عضوية.
    .orderBy(asc(users.fullNameAr), sql`${memberships.isPrimary} desc`)

  const overrides = await loadOverrides(rows.map((row) => row.membershipId))
  const candidates = new Map<
    string,
    { id: string; fullNameAr: string; roleNameAr: string; officeNameAr: string }
  >()

  for (const row of rows) {
    if (candidates.has(row.userId)) continue

    const held = effectiveCapabilities(
      row.roleCapabilities,
      overrides.get(row.membershipId) ?? [],
    )

    if (!held.includes('field.lead')) continue

    candidates.set(row.userId, {
      id: row.userId,
      fullNameAr: row.fullNameAr,
      roleNameAr: row.roleNameAr,
      officeNameAr: row.officeNameAr,
    })
  }

  return [...candidates.values()]
}

// ── المنسّق: الكتابة ───────────────────────────────────────────────────

/**
 * المجموعات للحملات وحدها، وللحملة التي ما زالت تُنفَّذ أو تُحضَّر.
 *
 * النقطة الخضراء توثيق لفعل نفّذه غيرنا: لا يوم ميداني فيها ولا حضور.
 * والمبادرة المغلقة أو الملغاة انتهى ميدانها، فتعديله يغيّر سجلًا لا خطة.
 */
async function requireOpenCampaign(initiativeId: string) {
  const initiative = await requireInitiative(initiativeId)

  if (initiative.kind !== 'CAMPAIGN') {
    throw errors.unprocessable(
      'النقطة الخضراء توثيق لا حملة، فلا تُكوَّن لها مجموعات ميدانية.',
    )
  }

  if (initiative.status === 'COMPLETED' || initiative.status === 'CANCELLED') {
    throw errors.conflict('المبادرة مغلقة، فلا يُعدَّل ميدانها.')
  }

  return initiative
}

async function requireLiveSite(initiativeId: string, siteId: string) {
  const [site] = await db
    .select({
      id: initiativeSites.id,
      initiativeId: initiativeSites.initiativeId,
      nameAr: initiativeSites.nameAr,
      status: initiativeSites.status,
    })
    .from(initiativeSites)
    .where(eq(initiativeSites.id, siteId))
    .limit(1)

  if (!site || site.initiativeId !== initiativeId) {
    throw errors.unprocessable('الموقع غير موجود في هذه المبادرة.')
  }

  if (site.status === 'CANCELLED') {
    throw errors.unprocessable('الموقع ملغى، فلا تُكوَّن له مجموعة.')
  }

  return site
}

/**
 * القائد يُفحص بقدرته الفعلية لا بدوره: الأدوار تُحرَّر من اللوحة، ودور
 * يحمل اسم «قائد» قد نُزعت منه القدرة.
 */
async function requireLead(userId: string) {
  const context = await loadAuthContext(userId)

  if (!context || context.kind !== 'STAFF' || context.status !== 'ACTIVE') {
    throw errors.unprocessable('القائد المختار ليس عضوًا نشطًا في الفريق.')
  }

  if (!context.capabilities.includes('field.lead')) {
    throw errors.unprocessable(
      'العضو المختار لا يحمل صلاحية قيادة مجموعة ميدانية. أسند إليه دور «قائد مجموعة ميداني» أولًا.',
    )
  }

  return context
}

async function requireGroup(initiativeId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(fieldGroups)
    .where(
      and(
        eq(fieldGroups.id, groupId),
        eq(fieldGroups.initiativeId, initiativeId),
      ),
    )
    .limit(1)

  if (!row) throw errors.notFound('المجموعة غير موجودة في هذه المبادرة.')

  return row
}

const duplicateName = () =>
  errors.conflict('في هذا الموقع مجموعة بالاسم نفسه. اختر اسمًا يميّزها.')

/**
 * الفهرس الفريد هو الحَكَم حين يتسابق منسّقان على الاسم نفسه؛ ترجمته هنا
 * تُبقي الجواب تعارضًا مفهومًا بدل خطأ داخلي.
 */
async function guardName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateName()

    throw error
  }
}

export async function createGroup(
  initiativeId: string,
  input: dto.CreateGroupBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const site = await requireLiveSite(initiativeId, input.siteId)
  const leader = input.leadUserId ? await requireLead(input.leadUserId) : null
  const nameAr = normalizeText(input.nameAr)

  await guardName(() =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(fieldGroups)
        .values({
          initiativeId,
          siteId: site.id,
          nameAr,
          leadUserId: leader?.userId ?? null,
          meetsAt: input.meetsAt ? new Date(input.meetsAt) : null,
          meetingPointAr: input.meetingPointAr
            ? normalizeText(input.meetingPointAr)
            : null,
          instructionsAr: input.instructionsAr?.trim() || null,
          ...(input.displayOrder !== undefined
            ? { displayOrder: input.displayOrder }
            : {}),
        })
        .returning({ id: fieldGroups.id })

      if (!created) throw new Error('Failed to create field group.')

      await recordAudit(
        {
          action: 'field.group_created',
          actorUserId: actor.userId,
          entityType: 'field_group',
          entityId: created.id,
          entityLabel: nameAr,
          summaryAr: `إضافة مجموعة ميدانية في ${site.nameAr}`,
          metadata: {
            initiativeId,
            siteId: site.id,
            leadUserId: leader?.userId ?? null,
          },
          ...trace,
        },
        tx,
      )
    }),
  )

  return loadInitiativeField(initiativeId)
}

export async function updateGroup(
  initiativeId: string,
  groupId: string,
  input: dto.UpdateGroupBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const existing = await requireGroup(initiativeId, groupId)

  if (input.siteId && input.siteId !== existing.siteId) {
    await requireLiveSite(initiativeId, input.siteId)
  }

  const leadChanged =
    input.leadUserId !== undefined && input.leadUserId !== existing.leadUserId

  const leader =
    leadChanged && input.leadUserId ? await requireLead(input.leadUserId) : null

  const changes = {
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.nameAr ? { nameAr: normalizeText(input.nameAr) } : {}),
    ...(leadChanged ? { leadUserId: input.leadUserId ?? null } : {}),
    ...(input.meetsAt !== undefined
      ? { meetsAt: input.meetsAt ? new Date(input.meetsAt) : null }
      : {}),
    ...(input.meetingPointAr !== undefined
      ? {
          meetingPointAr: input.meetingPointAr
            ? normalizeText(input.meetingPointAr)
            : null,
        }
      : {}),
    ...(input.instructionsAr !== undefined
      ? { instructionsAr: input.instructionsAr?.trim() || null }
      : {}),
    ...(input.displayOrder !== undefined
      ? { displayOrder: input.displayOrder }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await guardName(() =>
      db.transaction(async (tx) => {
        await tx
          .update(fieldGroups)
          .set(changes)
          .where(eq(fieldGroups.id, groupId))

        await recordAudit(
          {
            /**
             * تسمية القائد حدث بذاته: هي ما يفتح لحساب بابَ التسجيل على
             * موقع، فسؤال «من جعله قائدًا ومتى؟» يُجاب من السجل مباشرة.
             */
            action: leadChanged ? 'field.lead_assigned' : 'field.group_updated',
            severity: leadChanged ? 'NOTICE' : 'INFO',
            actorUserId: actor.userId,
            entityType: 'field_group',
            entityId: groupId,
            entityLabel: changes.nameAr ?? existing.nameAr,
            summaryAr: leadChanged
              ? leader
                ? `تسمية ${leader.fullNameAr} قائدًا للمجموعة`
                : 'ترك المجموعة بلا قائد'
              : 'تعديل مجموعة ميدانية',
            metadata: {
              initiativeId,
              fields: Object.keys(changes),
              ...(leadChanged
                ? {
                    previousLeadUserId: existing.leadUserId,
                    leadUserId: input.leadUserId ?? null,
                  }
                : {}),
            },
            ...trace,
          },
          tx,
        )
      }),
    )
  }

  return loadInitiativeField(initiativeId)
}

export async function deleteGroup(
  initiativeId: string,
  groupId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const existing = await requireGroup(initiativeId, groupId)

  await db.transaction(async (tx) => {
    await tx.delete(fieldGroups).where(eq(fieldGroups.id, groupId))

    await recordAudit(
      {
        action: 'field.group_deleted',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'field_group',
        entityId: groupId,
        entityLabel: existing.nameAr,
        summaryAr: 'حذف مجموعة ميدانية',
        metadata: {
          initiativeId,
          siteId: existing.siteId,
          leadUserId: existing.leadUserId,
        },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeField(initiativeId)
}

// ── التطبيق ────────────────────────────────────────────────────────────

/**
 * العدّ باستعلام فرعي لا بوصلة: الوصلة تضرب صف المجموعة بعدد مهام موقعها،
 * والبطاقة تحتاج رقمين لا قائمة. الملغاة خارج العدّين — لا تُعرض في الورقة.
 */
const siteTaskCount = (extra: SQL) =>
  sql<number>`(
    select count(*)::int from ${workItems}
     where ${workItems.siteId} = ${fieldGroups.siteId}
       and ${workItems.status} <> 'CANCELLED'
       ${extra}
  )`

export async function loadHome(principal: FieldPrincipal) {
  const { auth } = principal
  const canLead = auth.capabilities.includes('field.lead')

  /**
   * من لا يحمل `field.lead` لا مجموعات له ولو سُمّي قائدًا قبل أن تُنزع
   * منه القدرة: الاسم في الصف لا يغني عن القدرة، والحراس تفحصها هي.
   */
  const rows = canLead
    ? await db
        .select({
          id: fieldGroups.id,
          nameAr: fieldGroups.nameAr,
          meetsAt: fieldGroups.meetsAt,
          meetingPointAr: fieldGroups.meetingPointAr,
          initiativeId: initiatives.id,
          initiativeNameAr: initiatives.nameAr,
          initiativeStatus: initiatives.status,
          siteId: initiativeSites.id,
          siteNameAr: initiativeSites.nameAr,
          siteStatus: initiativeSites.status,
          areaNameAr: areas.nameAr,
          taskCount: siteTaskCount(sql``).as('task_count'),
          openTaskCount: siteTaskCount(
            sql`and ${workItems.status} <> 'DONE'`,
          ).as('open_task_count'),
        })
        .from(fieldGroups)
        .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
        .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
        .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
        .where(
          and(
            eq(fieldGroups.leadUserId, auth.userId),
            ne(initiatives.status, 'CANCELLED'),
            ne(initiativeSites.status, 'CANCELLED'),
            or(
              isNull(fieldGroups.meetsAt),
              gte(
                fieldGroups.meetsAt,
                new Date(Date.now() - HOME_WINDOW_DAYS * DAY_MS),
              ),
            ),
          ),
        )
        // ASC في Postgres يضع NULL آخرًا: ما لا موعد له ينزل تحت المجدوَل.
        .orderBy(asc(fieldGroups.meetsAt), asc(fieldGroups.nameAr))
        .limit(50)
    : []

  return {
    kind: 'STAFF' as const,
    user: { id: auth.userId, fullNameAr: auth.fullNameAr },
    canLead,
    canManage: auth.capabilities.includes('field.manage'),
    groups: rows.map((row) => ({
      ...row,
      meetsAt: row.meetsAt?.toISOString() ?? null,
    })),
  }
}

/** كل حالات المهمة إلا الملغاة: ما أُلغي ضجيج في الميدان. */
const SHEET_TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
] as const

/**
 * المجموعة كما يراها مبدأ بعينه، أو 404.
 *
 * «ليست لك» و«غير موجودة» جواب واحد: قائد يجرّب معرّفات لا يعرف منها أي
 * مجموعات قائمة. وهذه البوابة نفسها تمرّ منها مسارات الكتابة.
 */
export async function requireAccessibleGroup(
  groupId: string,
  principal: FieldPrincipal,
) {
  const [row] = await db
    .select({
      group: fieldGroups,
      leadNameAr: lead.fullNameAr,
      initiative: initiatives,
      site: initiativeSites,
      areaNameAr: areas.nameAr,
    })
    .from(fieldGroups)
    .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
    .leftJoin(lead, eq(fieldGroups.leadUserId, lead.id))
    .where(eq(fieldGroups.id, groupId))
    .limit(1)

  const { auth } = principal

  const allowed =
    row !== undefined &&
    (auth.capabilities.includes('field.manage') ||
      (auth.capabilities.includes('field.lead') &&
        row.group.leadUserId === auth.userId))

  if (!row || !allowed) throw errors.notFound('المجموعة غير موجودة.')

  return row
}

export async function loadSheet(groupId: string, principal: FieldPrincipal) {
  const { group, leadNameAr, initiative, site, areaNameAr } =
    await requireAccessibleGroup(groupId, principal)

  const statuses = [...SHEET_TASK_STATUSES]

  /**
   * مهام الورقة نوعان: ما عُلّق على الموقع، وما عُلّق على المبادرة وأُسند
   * إلى قائد المجموعة. خطة البرنامج تولّد مهامها على المبادرة لا المواقع،
   * فالاقتصار على الأول يُفرغ ورقة قائد أُسندت إليه مهام الحملة نفسها.
   */
  const [siteTasks, leadTasks, progress] = await Promise.all([
    listTasks({ siteId: site.id, status: statuses }, principal.auth),
    group.leadUserId
      ? listTasks(
          {
            initiativeId: initiative.id,
            assigneeUserId: group.leadUserId,
            status: statuses,
          },
          principal.auth,
        )
      : [],
    loadScopeProgress({ kind: 'SITE', id: site.id }),
  ])

  const toFieldTask =
    (scope: 'SITE' | 'INITIATIVE') =>
    (task: (typeof siteTasks)[number]) => ({
      id: task.id,
      titleAr: task.titleAr,
      descriptionAr: task.descriptionAr,
      status: task.status,
      priority: task.priority,
      scope,
      milestoneTitleAr: task.milestoneTitleAr,
      dueAt: task.dueAt,
      isOverdue: task.isOverdue,
      blockedReasonAr: task.blockedReasonAr,
      assigneeNameAr: task.assigneeNameAr,
      commentCount: task.commentCount,
    })

  return {
    group: {
      id: group.id,
      nameAr: group.nameAr,
      meetsAt: group.meetsAt?.toISOString() ?? null,
      meetingPointAr: group.meetingPointAr,
      instructionsAr: group.instructionsAr,
      leadUserId: group.leadUserId,
      leadNameAr,
    },
    initiative: {
      id: initiative.id,
      nameAr: initiative.nameAr,
      status: initiative.status,
      acceptsEntries: acceptsEntries(initiative),
    },
    site: {
      id: site.id,
      nameAr: site.nameAr,
      descriptionAr: site.descriptionAr,
      status: site.status,
      areaNameAr,
      lat: site.lat === null ? null : Number(site.lat),
      lng: site.lng === null ? null : Number(site.lng),
    },
    tasks: [
      ...siteTasks.map(toFieldTask('SITE')),
      ...leadTasks.map(toFieldTask('INITIATIVE')),
    ],
    targets: progress.map((metric) => ({
      metricId: metric.metricId,
      metricNameAr: metric.metricNameAr,
      unitAr: metric.unitAr,
      decimals: metric.decimals,
      aggregation: metric.aggregation,
      target: metric.target,
      actual: metric.actual,
      unverified: metric.unverified,
    })),
    generatedAt: new Date().toISOString(),
  }
}
