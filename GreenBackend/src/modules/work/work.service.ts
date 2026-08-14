import { randomUUID } from 'node:crypto'

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/identity.js'
import { offices } from '../../db/schema/org.js'
import { partners } from '../../db/schema/partners.js'
import {
  initiativeSites,
  initiatives,
  programs,
} from '../../db/schema/programs.js'
import {
  milestones,
  workItemComments,
  workItems,
  workTemplates,
} from '../../db/schema/work.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type * as dto from './work.schemas.js'

export type Executor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0]

type WorkItemStatus = (typeof workItems.$inferSelect)['status']
type ScopeKind = 'OFFICE' | 'PROGRAM' | 'INITIATIVE' | 'SITE' | 'PARTNER'

const DAY_MS = 86_400_000

/** الحالتان النهائيتان: لا موعد يتأخر بعدهما. */
const CLOSED_STATUSES: WorkItemStatus[] = ['DONE', 'CANCELLED']

const SCOPE_KEYS = [
  'officeId',
  'programId',
  'initiativeId',
  'siteId',
  'partnerId',
] as const

/**
 * رسم الانتقالات المسموحة.
 *
 * `DONE -> IN_PROGRESS` مسموح عمدًا: إعادة الفتح تحدث فعلًا حين يتبيّن أن
 * الإنجاز ناقص، ومنعها يدفع الفريق إلى إنشاء مهمة بديلة فينكسر تاريخ
 * المهمة الأصلية. الرسم يقول ما هو ممكن، و`changeTaskStatus` يقول لمن.
 */
const STATUS_TRANSITIONS: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'],
  BLOCKED: ['TODO', 'IN_PROGRESS', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: ['TODO'],
}

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  TODO: 'قيد الانتظار',
  IN_PROGRESS: 'قيد التنفيذ',
  BLOCKED: 'متعثّرة',
  IN_REVIEW: 'قيد المراجعة',
  DONE: 'منجزة',
  CANCELLED: 'ملغاة',
}

const assignee = alias(users, 'work_assignee')
const assignedPartner = alias(partners, 'work_assigned_partner')
const scopePartner = alias(partners, 'work_scope_partner')
const scopeOffice = alias(offices, 'work_scope_office')
const followUpOffice = alias(offices, 'work_follow_up_office')

const taskColumns = {
  id: workItems.id,
  titleAr: workItems.titleAr,
  descriptionAr: workItems.descriptionAr,
  status: workItems.status,
  priority: workItems.priority,

  officeId: workItems.officeId,
  programId: workItems.programId,
  initiativeId: workItems.initiativeId,
  siteId: workItems.siteId,
  partnerId: workItems.partnerId,

  officeNameAr: scopeOffice.nameAr,
  programNameAr: programs.nameAr,
  initiativeNameAr: initiatives.nameAr,
  siteNameAr: initiativeSites.nameAr,
  partnerNameAr: scopePartner.displayNameAr,

  milestoneId: workItems.milestoneId,
  milestoneTitleAr: milestones.titleAr,

  dueAt: workItems.dueAt,
  startedAt: workItems.startedAt,
  submittedForReviewAt: workItems.submittedForReviewAt,
  completedAt: workItems.completedAt,

  assigneeUserId: workItems.assigneeUserId,
  assigneeNameAr: assignee.fullNameAr,
  assignedPartnerId: workItems.assignedPartnerId,
  assignedPartnerNameAr: assignedPartner.displayNameAr,
  followUpOfficeId: workItems.followUpOfficeId,
  followUpOfficeNameAr: followUpOffice.nameAr,

  blockedReasonAr: workItems.blockedReasonAr,
  createdAt: workItems.createdAt,

  commentCount: sql<number>`(
    select count(*)::int from ${workItemComments}
     where ${workItemComments.workItemId} = ${workItems.id}
  )`.as('comment_count'),
}

/**
 * وصلات التسمية كلها اختيارية لأن أربعة من أعمدة النطاق الخمسة فارغة في
 * كل صف. تُكتب مرة هنا فلا يفترق تمثيل المهمة بين القائمة والتفصيل.
 */
function taskQuery() {
  return db
    .select(taskColumns)
    .from(workItems)
    .leftJoin(scopeOffice, eq(workItems.officeId, scopeOffice.id))
    .leftJoin(programs, eq(workItems.programId, programs.id))
    .leftJoin(initiatives, eq(workItems.initiativeId, initiatives.id))
    .leftJoin(initiativeSites, eq(workItems.siteId, initiativeSites.id))
    .leftJoin(scopePartner, eq(workItems.partnerId, scopePartner.id))
    .leftJoin(milestones, eq(workItems.milestoneId, milestones.id))
    .leftJoin(assignee, eq(workItems.assigneeUserId, assignee.id))
    .leftJoin(
      assignedPartner,
      eq(workItems.assignedPartnerId, assignedPartner.id),
    )
    .leftJoin(followUpOffice, eq(workItems.followUpOfficeId, followUpOffice.id))
}

type TaskRow = Awaited<ReturnType<typeof taskQuery>>[number]

function resolveScope(row: TaskRow): {
  kind: ScopeKind
  id: string
  labelAr: string | null
} {
  if (row.officeId) {
    return { kind: 'OFFICE', id: row.officeId, labelAr: row.officeNameAr }
  }

  if (row.programId) {
    return { kind: 'PROGRAM', id: row.programId, labelAr: row.programNameAr }
  }

  if (row.initiativeId) {
    return {
      kind: 'INITIATIVE',
      id: row.initiativeId,
      labelAr: row.initiativeNameAr,
    }
  }

  if (row.siteId) {
    return { kind: 'SITE', id: row.siteId, labelAr: row.siteNameAr }
  }

  if (row.partnerId) {
    return { kind: 'PARTNER', id: row.partnerId, labelAr: row.partnerNameAr }
  }

  // القيد يفرض نطاقًا واحدًا بالضبط؛ الوصول إلى هنا عطل لا مدخل مستخدم.
  throw new Error('Work item has no scope.')
}

function serializeTask(row: TaskRow) {
  return {
    id: row.id,
    titleAr: row.titleAr,
    descriptionAr: row.descriptionAr,
    status: row.status,
    priority: row.priority,
    scope: resolveScope(row),
    milestoneId: row.milestoneId,
    milestoneTitleAr: row.milestoneTitleAr,
    dueAt: row.dueAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    submittedForReviewAt: row.submittedForReviewAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    assigneeUserId: row.assigneeUserId,
    assigneeNameAr: row.assigneeNameAr,
    assignedPartnerId: row.assignedPartnerId,
    assignedPartnerNameAr: row.assignedPartnerNameAr,
    followUpOfficeId: row.followUpOfficeId,
    followUpOfficeNameAr: row.followUpOfficeNameAr,
    blockedReasonAr: row.blockedReasonAr,
    isOverdue:
      row.dueAt !== null &&
      row.dueAt.getTime() < Date.now() &&
      !CLOSED_STATUSES.includes(row.status),
    commentCount: row.commentCount,
    createdAt: row.createdAt.toISOString(),
  }
}

const milestoneColumns = {
  id: milestones.id,
  initiativeId: milestones.initiativeId,
  siteId: milestones.siteId,
  titleAr: milestones.titleAr,
  descriptionAr: milestones.descriptionAr,
  status: milestones.status,
  dueAt: milestones.dueAt,
  completedAt: milestones.completedAt,
  displayOrder: milestones.displayOrder,
  taskCount: sql<number>`(
    select count(*)::int from ${workItems}
     where ${workItems.milestoneId} = ${milestones.id}
  )`.as('task_count'),
  doneTaskCount: sql<number>`(
    select count(*)::int from ${workItems}
     where ${workItems.milestoneId} = ${milestones.id}
       and ${workItems.status} = 'DONE'
  )`.as('done_task_count'),
}

function milestoneQuery() {
  return db.select(milestoneColumns).from(milestones)
}

type MilestoneRow = Awaited<ReturnType<typeof milestoneQuery>>[number]

function serializeMilestone(row: MilestoneRow) {
  return {
    id: row.id,
    initiativeId: row.initiativeId,
    siteId: row.siteId,
    titleAr: row.titleAr,
    descriptionAr: row.descriptionAr,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    displayOrder: row.displayOrder,
    taskCount: row.taskCount,
    doneTaskCount: row.doneTaskCount,
  }
}

// ── القراءة ────────────────────────────────────────────────────────────

export async function listTasks(
  filters: dto.ListTasksQuery,
  actor: AuthContext,
) {
  const conditions = [
    /**
     * المكتب يطابق النطاق أو المتابعة معًا.
     *
     * مهام القوالب مُعلَّقة على المبادرة لا على مكتب، ومكتبها في
     * `followUpOfficeId`. مطابقة النطاق وحده كانت تُخفي عن كل مكتب
     * مهامَّه المولّدة، فتبدو لوحته فارغة والحملة مخطَّطة بالكامل.
     */
    filters.officeId
      ? or(
          eq(workItems.officeId, filters.officeId),
          eq(workItems.followUpOfficeId, filters.officeId),
        )
      : undefined,
    // بلا مُسنَد إليه — ما ينتظر من يلتقطه.
    filters.unassigned ? isNull(workItems.assigneeUserId) : undefined,
    filters.programId ? eq(workItems.programId, filters.programId) : undefined,
    filters.initiativeId
      ? eq(workItems.initiativeId, filters.initiativeId)
      : undefined,
    filters.siteId ? eq(workItems.siteId, filters.siteId) : undefined,
    /**
     * عمودان مختلفان للجهة: صاحبة المهمة ومن أُسندت إليه. من يسأل عن جهة
     * يريد عملها كله، وفصل المرشّحين كان سيخفي نصفه عن سؤال واحد.
     */
    filters.partnerId
      ? or(
          eq(workItems.partnerId, filters.partnerId),
          eq(workItems.assignedPartnerId, filters.partnerId),
        )
      : undefined,
    filters.assigneeUserId
      ? eq(workItems.assigneeUserId, filters.assigneeUserId)
      : undefined,
    filters.mine ? eq(workItems.assigneeUserId, actor.userId) : undefined,
    filters.status && filters.status.length > 0
      ? inArray(workItems.status, filters.status)
      : undefined,
    filters.overdue
      ? and(
          lt(workItems.dueAt, new Date()),
          notInArray(workItems.status, CLOSED_STATUSES),
        )
      : undefined,
  ].filter(Boolean)

  // ASC في Postgres يضع NULL آخرًا، فالمهام بلا موعد تنزل تحت المؤجَّلة.
  const rows = await taskQuery()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      asc(workItems.dueAt),
      desc(workItems.priority),
      asc(workItems.createdAt),
    )
    .limit(300)

  return rows.map(serializeTask)
}

/** يُستدعى بعد كل تعديل ليعود تمثيل المهمة كاملًا في نداء واحد. */
export async function loadTaskDetail(workItemId: string) {
  const [row] = await taskQuery().where(eq(workItems.id, workItemId)).limit(1)

  if (!row) throw errors.notFound('المهمة غير موجودة.')

  const comments = await db
    .select()
    .from(workItemComments)
    .where(eq(workItemComments.workItemId, workItemId))
    .orderBy(asc(workItemComments.createdAt))
    .limit(200)

  return {
    ...serializeTask(row),
    comments: comments.map((comment) => ({
      id: comment.id,
      authorNameAr: comment.authorNameAr,
      isPartnerAuthor: comment.authorPartnerId !== null,
      bodyAr: comment.bodyAr,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt.toISOString(),
    })),
  }
}

export type InitiativeWork = {
  milestones: Array<{
    id: string
    siteId: string | null
    titleAr: string
    descriptionAr: string | null
    status: string
    dueAt: string | null
    completedAt: string | null
    displayOrder: number
    taskCount: number
    doneTaskCount: number
  }>
  workItems: Array<{
    id: string
    milestoneId: string | null
    siteId: string | null
    titleAr: string
    descriptionAr: string | null
    status: string
    priority: string
    dueAt: string | null
    assigneeUserId: string | null
    assigneeNameAr: string | null
    assignedPartnerId: string | null
    assignedPartnerNameAr: string | null
    followUpOfficeNameAr: string | null
    blockedReasonAr: string | null
  }>
}

/**
 * لوحة عمل المبادرة.
 *
 * المهام المعلَّقة على أحد مواقع المبادرة تُجمع معها: النطاق في القاعدة
 * موقعٌ لا مبادرة، لكن من يفتح لوحة المبادرة يتوقع عملها كله.
 */
export async function loadInitiativeWork(
  initiativeId: string,
): Promise<InitiativeWork> {
  const [milestoneRows, taskRows] = await Promise.all([
    milestoneQuery()
      .where(eq(milestones.initiativeId, initiativeId))
      .orderBy(asc(milestones.displayOrder), asc(milestones.dueAt)),

    taskQuery()
      .where(
        or(
          eq(workItems.initiativeId, initiativeId),
          sql`exists (
            select 1 from ${initiativeSites}
             where ${initiativeSites.id} = ${workItems.siteId}
               and ${initiativeSites.initiativeId} = ${initiativeId}
          )`,
        ),
      )
      .orderBy(
        asc(workItems.dueAt),
        desc(workItems.priority),
        asc(workItems.createdAt),
      )
      .limit(500),
  ])

  return {
    milestones: milestoneRows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      titleAr: row.titleAr,
      descriptionAr: row.descriptionAr,
      status: row.status,
      dueAt: row.dueAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      displayOrder: row.displayOrder,
      taskCount: row.taskCount,
      doneTaskCount: row.doneTaskCount,
    })),
    workItems: taskRows.map((row) => ({
      id: row.id,
      milestoneId: row.milestoneId,
      siteId: row.siteId,
      titleAr: row.titleAr,
      descriptionAr: row.descriptionAr,
      status: row.status,
      priority: row.priority,
      dueAt: row.dueAt?.toISOString() ?? null,
      assigneeUserId: row.assigneeUserId,
      assigneeNameAr: row.assigneeNameAr,
      assignedPartnerId: row.assignedPartnerId,
      assignedPartnerNameAr: row.assignedPartnerNameAr,
      followUpOfficeNameAr: row.followUpOfficeNameAr,
      blockedReasonAr: row.blockedReasonAr,
    })),
  }
}

async function requireTask(workItemId: string) {
  const [row] = await db
    .select()
    .from(workItems)
    .where(eq(workItems.id, workItemId))
    .limit(1)

  if (!row) throw errors.notFound('المهمة غير موجودة.')

  return row
}

async function loadMilestone(milestoneId: string) {
  const [row] = await milestoneQuery()
    .where(eq(milestones.id, milestoneId))
    .limit(1)

  if (!row) throw errors.notFound('المرحلة غير موجودة.')

  return row
}

// ── الكتابة ────────────────────────────────────────────────────────────

/**
 * النطاق الواحد يُفحص هنا لا في القاعدة وحدها.
 *
 * القيد موجود ويحمي البيانات، لكن نصّ خطئه (`work_items_single_scope`)
 * لا يقول للمستخدم شيئًا، ويصل إليه بحالة 500 لا 422.
 */
function requireSingleScope(input: dto.CreateTaskBody) {
  const provided = SCOPE_KEYS.filter((key) => Boolean(input[key]))
  const [scope] = provided

  if (!scope || provided.length > 1) {
    throw errors.unprocessable(
      'المهمة تُعلَّق على جهة واحدة بالضبط: مكتب أو برنامج أو مبادرة أو موقع أو جهة شريكة.',
      { provided },
    )
  }

  return scope
}

/**
 * المرحلة تخص مبادرة بعينها، ولوحة المبادرة تجمع مهامها تحت مراحلها.
 * ربط مهمة بمرحلة من مبادرة أخرى يخفيها عن اللوحتين معًا، والمفتاحان
 * مستقلان في القاعدة فلا شيء يمنعه هناك.
 */
async function requireMilestoneInScope(
  milestoneId: string,
  scope: { initiativeId?: string | undefined; siteId?: string | undefined },
) {
  const [milestone] = await db
    .select({ initiativeId: milestones.initiativeId })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1)

  if (!milestone) throw errors.unprocessable('المرحلة غير موجودة.')

  let initiativeId = scope.initiativeId ?? null

  if (!initiativeId && scope.siteId) {
    const [site] = await db
      .select({ initiativeId: initiativeSites.initiativeId })
      .from(initiativeSites)
      .where(eq(initiativeSites.id, scope.siteId))
      .limit(1)

    if (!site) throw errors.unprocessable('الموقع غير موجود.')

    initiativeId = site.initiativeId
  }

  if (initiativeId !== milestone.initiativeId) {
    throw errors.unprocessable(
      'المهمة المرتبطة بمرحلة تُعلَّق على مبادرة تلك المرحلة أو على أحد مواقعها.',
    )
  }
}

export async function createTask(
  input: dto.CreateTaskBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const scope = requireSingleScope(input)

  if (input.milestoneId) {
    await requireMilestoneInScope(input.milestoneId, {
      ...(input.initiativeId ? { initiativeId: input.initiativeId } : {}),
      ...(input.siteId ? { siteId: input.siteId } : {}),
    })
  }

  const titleAr = normalizeText(input.titleAr)

  const workItemId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(workItems)
      .values({
        titleAr,
        priority: input.priority,
        createdById: actor.userId,
        ...(input.officeId ? { officeId: input.officeId } : {}),
        ...(input.programId ? { programId: input.programId } : {}),
        ...(input.initiativeId ? { initiativeId: input.initiativeId } : {}),
        ...(input.siteId ? { siteId: input.siteId } : {}),
        ...(input.partnerId ? { partnerId: input.partnerId } : {}),
        ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
        ...(input.descriptionAr ? { descriptionAr: input.descriptionAr } : {}),
        ...(input.assigneeUserId
          ? { assigneeUserId: input.assigneeUserId }
          : {}),
        ...(input.assignedPartnerId
          ? { assignedPartnerId: input.assignedPartnerId }
          : {}),
        ...(input.followUpOfficeId
          ? { followUpOfficeId: input.followUpOfficeId }
          : {}),
        ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      })
      .returning({ id: workItems.id })

    if (!created) throw new Error('Failed to create work item.')

    await recordAudit(
      {
        action: 'work.task_created',
        actorUserId: actor.userId,
        entityType: 'work_item',
        entityId: created.id,
        entityLabel: titleAr,
        summaryAr: 'إنشاء مهمة',
        metadata: { scope, priority: input.priority },
        ...trace,
      },
      tx,
    )

    return created.id
  })

  return loadTaskDetail(workItemId)
}

export async function updateTask(
  workItemId: string,
  input: dto.UpdateTaskBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireTask(workItemId)

  const changes = {
    ...(input.titleAr ? { titleAr: normalizeText(input.titleAr) } : {}),
    ...(input.descriptionAr !== undefined
      ? { descriptionAr: input.descriptionAr || null }
      : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.dueAt !== undefined
      ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
      : {}),
    ...(input.assigneeUserId !== undefined
      ? { assigneeUserId: input.assigneeUserId || null }
      : {}),
    ...(input.assignedPartnerId !== undefined
      ? { assignedPartnerId: input.assignedPartnerId || null }
      : {}),
    ...(input.followUpOfficeId !== undefined
      ? { followUpOfficeId: input.followUpOfficeId || null }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(workItems).set(changes).where(eq(workItems.id, workItemId))

      await recordAudit(
        {
          action: 'work.task_updated',
          actorUserId: actor.userId,
          entityType: 'work_item',
          entityId: workItemId,
          summaryAr: 'تعديل مهمة',
          metadata: { fields: Object.keys(changes) },
          ...trace,
        },
        tx,
      )
    })
  }

  return loadTaskDetail(workItemId)
}

/**
 * بوابة الحالة.
 *
 * الرسم والصلاحية ولزوم سبب التعثّر تُفحص هنا قبل الكتابة. القاعدة تحمي
 * اقتران الحالة بوقتها بقيود، لكن نصّ رفضها إنجليزي ويصل المستخدم بحالة
 * 500 — وهذه رسائل تُقرأ.
 */
export async function changeTaskStatus(
  workItemId: string,
  input: dto.TaskStatusBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const existing = await requireTask(workItemId)

  if (!STATUS_TRANSITIONS[existing.status].includes(input.status)) {
    throw errors.conflict(
      `لا يمكن نقل المهمة من «${STATUS_LABELS[existing.status]}» إلى «${STATUS_LABELS[input.status]}».`,
    )
  }

  /**
   * «الشريك يرسل المهمة للمراجعة، وفريق العمليات وحده يعتمد إنجازها».
   *
   * البوابة تُغلق في الاتجاهين: اعتمادٌ يستطيع كل من يرى المهمة نقضه ليس
   * اعتمادًا، فإعادة الفتح تلزمها الصلاحية التي منحت الاعتماد. والإلغاء
   * يُخرج المهمة من المتابعة كلها، وهو قرار من يدير العمل لا من ينفّذه.
   */
  if (input.status === 'DONE' && !actor.capabilities.includes('work.approve')) {
    throw errors.forbidden(
      'اعتماد إنجاز المهمة من صلاحية فريق العمليات. انقلها إلى المراجعة بدلًا من ذلك.',
    )
  }

  if (
    existing.status === 'DONE' &&
    !actor.capabilities.includes('work.approve')
  ) {
    throw errors.forbidden('إعادة فتح مهمة معتمدة من صلاحية فريق العمليات.')
  }

  if (
    input.status === 'CANCELLED' &&
    !actor.capabilities.includes('work.manage')
  ) {
    throw errors.forbidden('إلغاء المهمة من صلاحية من يدير العمل.')
  }

  const blockedReasonAr = input.blockedReasonAr
    ? normalizeText(input.blockedReasonAr)
    : null

  if (input.status === 'BLOCKED' && !blockedReasonAr) {
    throw errors.unprocessable('تعثّر المهمة يلزمه سبب مكتوب.')
  }

  const now = new Date()

  const changes = {
    status: input.status,
    // لا يُكتب البدء إلا مرة: إعادة الفتح لا تمحو متى بدأ العمل فعلًا.
    ...(input.status === 'IN_PROGRESS' && !existing.startedAt
      ? { startedAt: now }
      : {}),
    ...(input.status === 'IN_REVIEW' ? { submittedForReviewAt: now } : {}),
    ...(input.status === 'DONE'
      ? { completedAt: now, completedById: actor.userId }
      : { completedAt: null, completedById: null }),
    ...(input.status === 'BLOCKED' && blockedReasonAr
      ? { blockedReasonAr }
      : { blockedReasonAr: null }),
  }

  await db.transaction(async (tx) => {
    /**
     * الكتابة مشروطة بالحالة التي فُحصت عليها البوابات.
     *
     * الرسم البياني وبوابات الصلاحية حُكم عليها بلقطة قُرئت قبل المعاملة،
     * فنقلٌ متزامن بينهما يجعل القرار مبنيًّا على حالة لم تعد قائمة —
     * كأن تُعتمد مهمة أُلغيت للتو. الشرط يجعل الخاسر يفشل بدل أن يكتب.
     */
    const [moved] = await tx
      .update(workItems)
      .set(changes)
      .where(
        and(eq(workItems.id, workItemId), eq(workItems.status, existing.status)),
      )
      .returning({ id: workItems.id })

    if (!moved) {
      throw errors.conflict('تغيّرت حالة المهمة قبل تنفيذ النقل. أعد المحاولة.')
    }

    await recordAudit(
      {
        action: `work.task_${input.status.toLowerCase()}`,
        severity:
          input.status === 'BLOCKED'
            ? 'WARNING'
            : input.status === 'DONE'
              ? 'NOTICE'
              : 'INFO',
        actorUserId: actor.userId,
        entityType: 'work_item',
        entityId: workItemId,
        entityLabel: existing.titleAr,
        summaryAr: `نقل المهمة إلى ${STATUS_LABELS[input.status]}`,
        metadata: { from: existing.status, to: input.status },
        ...trace,
      },
      tx,
    )
  })

  return loadTaskDetail(workItemId)
}

export async function addComment(
  workItemId: string,
  input: dto.CreateCommentBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const existing = await requireTask(workItemId)

  /**
   * التعليق مفتوح لكل من يرى المهمة، أما إظهاره للشريك فقناة مخاطبة خارجية
   * لا يفتحها من يملك القراءة وحدها. من لا يدير العمل يبقى تعليقه داخليًا
   * مهما أرسل في الطلب.
   */
  const isInternal = actor.capabilities.includes('work.manage')
    ? input.isInternal
    : true

  await db.transaction(async (tx) => {
    await tx.insert(workItemComments).values({
      workItemId,
      authorUserId: actor.userId,
      // لقطة لا وصلة: التعليق يبقى مقروءًا بعد تغيّر الاسم أو حذف الحساب.
      authorNameAr: actor.fullNameAr,
      bodyAr: input.bodyAr,
      isInternal,
    })

    await recordAudit(
      {
        action: 'work.comment_added',
        actorUserId: actor.userId,
        entityType: 'work_item',
        entityId: workItemId,
        entityLabel: existing.titleAr,
        summaryAr: isInternal
          ? 'تعليق داخلي على مهمة'
          : 'تعليق ظاهر للشريك على مهمة',
        partnerVisible: !isInternal,
        ...trace,
      },
      tx,
    )
  })

  return loadTaskDetail(workItemId)
}

export async function createMilestone(
  input: dto.CreateMilestoneBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const [initiative] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(eq(initiatives.id, input.initiativeId))
    .limit(1)

  if (!initiative) throw errors.unprocessable('المبادرة غير موجودة.')

  /** موقع من مبادرة أخرى تحت مرحلة هذه المبادرة صفٌّ لا معنى له. */
  if (input.siteId) {
    const [site] = await db
      .select({ initiativeId: initiativeSites.initiativeId })
      .from(initiativeSites)
      .where(eq(initiativeSites.id, input.siteId))
      .limit(1)

    if (!site) throw errors.unprocessable('الموقع غير موجود.')

    if (site.initiativeId !== input.initiativeId) {
      throw errors.unprocessable('الموقع يتبع مبادرة أخرى.')
    }
  }

  const titleAr = normalizeText(input.titleAr)

  const milestoneId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(milestones)
      .values({
        initiativeId: input.initiativeId,
        titleAr,
        displayOrder: input.displayOrder,
        ...(input.siteId ? { siteId: input.siteId } : {}),
        ...(input.descriptionAr ? { descriptionAr: input.descriptionAr } : {}),
        ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      })
      .returning({ id: milestones.id })

    if (!created) throw new Error('Failed to create milestone.')

    await recordAudit(
      {
        action: 'work.milestone_created',
        actorUserId: actor.userId,
        entityType: 'milestone',
        entityId: created.id,
        entityLabel: titleAr,
        summaryAr: 'إضافة مرحلة',
        metadata: { initiativeId: input.initiativeId },
        ...trace,
      },
      tx,
    )

    return created.id
  })

  return serializeMilestone(await loadMilestone(milestoneId))
}

export async function updateMilestone(
  milestoneId: string,
  input: dto.UpdateMilestoneBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const existing = await loadMilestone(milestoneId)

  const changes = {
    ...(input.titleAr ? { titleAr: normalizeText(input.titleAr) } : {}),
    ...(input.descriptionAr !== undefined
      ? { descriptionAr: input.descriptionAr || null }
      : {}),
    ...(input.dueAt !== undefined
      ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
      : {}),
    ...(input.displayOrder !== undefined
      ? { displayOrder: input.displayOrder }
      : {}),
    // القيد يربط `DONE` بوجود `completedAt`، فالحقلان يتحركان معًا أو يُرفض الصف.
    ...(input.status
      ? {
          status: input.status,
          completedAt:
            input.status === 'DONE'
              ? (existing.completedAt ?? new Date())
              : null,
        }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(milestones)
        .set(changes)
        .where(eq(milestones.id, milestoneId))

      await recordAudit(
        {
          action: input.status
            ? `work.milestone_${input.status.toLowerCase()}`
            : 'work.milestone_updated',
          actorUserId: actor.userId,
          entityType: 'milestone',
          entityId: milestoneId,
          entityLabel: existing.titleAr,
          summaryAr: 'تعديل مرحلة',
          metadata: { fields: Object.keys(changes) },
          ...trace,
        },
        tx,
      )
    })
  }

  return serializeMilestone(await loadMilestone(milestoneId))
}

/**
 * ينسخ خطة البرنامج إلى مراحل ومهام حقيقية تحت المبادرة.
 *
 * ينفّذ داخل معاملة المستدعي عمدًا: إنشاء المبادرة ونسخ خطتها ذرّة واحدة،
 * ومبادرة نجحت وخطة فشلت تترك حملة بلا عمل يُتابَع.
 */
export async function instantiateProgramTemplates(
  tx: Executor,
  input: {
    initiativeId: string
    programId: string
    startsAt: Date | null
    createdById: string
  },
): Promise<number> {
  const templates = await tx
    .select()
    .from(workTemplates)
    .where(eq(workTemplates.programId, input.programId))
    .orderBy(asc(workTemplates.displayOrder), asc(workTemplates.createdAt))

  if (templates.length === 0) return 0

  const templateById = new Map(
    templates.map((template) => [template.id, template]),
  )
  const milestoneIdByTemplate = new Map<string, string>()

  /**
   * القالب يحمل إزاحة بالأيام لا تاريخًا مطلقًا، فلا يتقادم بين موسم
   * وآخر. ومبادرة بلا تاريخ بدء تُنسخ خطتها بلا مواعيد بدل مواعيد مخترعة.
   */
  const dueFrom = (offsetDays: number | null) =>
    input.startsAt && offsetDays !== null
      ? new Date(input.startsAt.getTime() + offsetDays * DAY_MS)
      : null

  /**
   * القيد يفرض أن تكون المرحلة جذرًا، ولا يمنع مهمةً أن تتبع مهمة. جدول
   * المهام لا يعرف التشجير، فنصعد إلى أقرب مرحلة بدل أن تسقط المهمة
   * المتداخلة خارج اللوحة. و`seen` يقطع حلقةً لو وُجدت في البيانات.
   */
  const milestoneOf = (template: (typeof templates)[number]) => {
    const seen = new Set<string>()
    let parentId = template.parentId

    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)

      const parent = templateById.get(parentId)

      if (!parent) return undefined
      if (parent.kind === 'MILESTONE') return milestoneIdByTemplate.get(parent.id)

      parentId = parent.parentId
    }

    return undefined
  }

  /**
   * المعرّفات تُولَّد هنا لا في القاعدة، فتُدرج المراحل والمهام بجملتين
   * اثنتين مهما كبرت الخطة بدل ذهاب وإياب لكل صف لقراءة مفتاحه.
   */
  const milestoneRows = templates
    .filter((template) => template.kind === 'MILESTONE')
    .map((template) => {
      const id = randomUUID()
      milestoneIdByTemplate.set(template.id, id)

      const dueAt = dueFrom(template.dueOffsetDays)

      return {
        id,
        initiativeId: input.initiativeId,
        titleAr: template.titleAr,
        displayOrder: template.displayOrder,
        ...(template.descriptionAr
          ? { descriptionAr: template.descriptionAr }
          : {}),
        ...(dueAt ? { dueAt } : {}),
      }
    })

  const taskRows = templates
    .filter((template) => template.kind === 'TASK')
    .map((template) => {
      const dueAt = dueFrom(template.dueOffsetDays)
      const milestoneId = milestoneOf(template)

      return {
        initiativeId: input.initiativeId,
        titleAr: template.titleAr,
        priority: template.priority,
        createdById: input.createdById,
        ...(milestoneId ? { milestoneId } : {}),
        ...(template.descriptionAr
          ? { descriptionAr: template.descriptionAr }
          : {}),
        ...(template.defaultOfficeId
          ? { followUpOfficeId: template.defaultOfficeId }
          : {}),
        ...(dueAt ? { dueAt } : {}),
      }
    })

  if (milestoneRows.length > 0) {
    await tx.insert(milestones).values(milestoneRows)
  }

  if (taskRows.length > 0) {
    await tx.insert(workItems).values(taskRows)
  }

  return milestoneRows.length + taskRows.length
}
