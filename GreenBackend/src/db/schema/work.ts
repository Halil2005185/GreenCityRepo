import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import {
  milestoneStatus,
  templateKind,
  workItemPriority,
  workItemStatus,
} from './enums.js'
import { users } from './identity.js'
import { offices } from './org.js'
import { partners } from './partners.js'
import { initiativeSites, initiatives, programs } from './programs.js'

/** مرحلة ضمن مبادرة، وقد تخص موقعًا بعينه. */
export const milestones = pgTable(
  'milestones',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),
    siteId: uuidColumn('site_id').references(() => initiativeSites.id, {
      onDelete: 'cascade',
    }),

    titleAr: varchar('title_ar', { length: 200 }).notNull(),
    descriptionAr: text('description_ar'),
    status: milestoneStatus('status').default('PENDING').notNull(),

    dueAt: tsColumn('due_at'),
    completedAt: tsColumn('completed_at'),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    index('milestones_initiative_idx').on(table.initiativeId),
    index('milestones_site_idx').on(table.siteId),
    check(
      'milestones_completion_consistency',
      sql`(${table.status} = 'DONE') = (${table.completedAt} is not null)`,
    ),
  ],
)

/**
 * المهمة — تُعلَّق على مكتب أو برنامج أو مبادرة أو موقع أو جهة شريكة.
 *
 * خمسة أعمدة اختيارية بمفاتيح حقيقية، وقيد يفرض واحدًا بالضبط. السبب أن
 * جدول مهام محضر 02-08 نفسه يحوي مهامًا مكتبية بلا مبادرة («تجهيز الملف
 * الإعلامي الأولي»)، فحصر المهام تحت المبادرات كان سيترك نصف عمل الفريق
 * خارج النظام.
 *
 * `followUpOfficeId` مأخوذ من عمود «المتابعة» في المحضر: المكتب الذي
 * يتابع الإنجاز قد يختلف عن المكتب صاحب المهمة.
 *
 * فرق `assigneeUserId` عن `assignedPartnerId`: الأول من ينفّذ داخليًا،
 * والثاني جهة خارجية. اجتماعهما ممكن — مهمة يتشارك فيها موظف وشريك.
 */
export const workItems = pgTable(
  'work_items',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),

    officeId: uuidColumn('office_id').references(() => offices.id, {
      onDelete: 'cascade',
    }),
    programId: uuidColumn('program_id').references(() => programs.id, {
      onDelete: 'cascade',
    }),
    initiativeId: uuidColumn('initiative_id').references(() => initiatives.id, {
      onDelete: 'cascade',
    }),
    siteId: uuidColumn('site_id').references(() => initiativeSites.id, {
      onDelete: 'cascade',
    }),
    partnerId: uuidColumn('partner_id').references(() => partners.id, {
      onDelete: 'cascade',
    }),

    milestoneId: uuidColumn('milestone_id').references(() => milestones.id, {
      onDelete: 'set null',
    }),

    titleAr: varchar('title_ar', { length: 300 }).notNull(),
    descriptionAr: text('description_ar'),
    status: workItemStatus('status').default('TODO').notNull(),
    priority: workItemPriority('priority').default('NORMAL').notNull(),

    assigneeUserId: uuidColumn('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedPartnerId: uuidColumn('assigned_partner_id').references(
      () => partners.id,
      { onDelete: 'set null' },
    ),
    followUpOfficeId: uuidColumn('follow_up_office_id').references(
      () => offices.id,
      { onDelete: 'set null' },
    ),

    dueAt: tsColumn('due_at'),
    startedAt: tsColumn('started_at'),
    /** يدخلها الشريك بنفسه؛ اعتماد الإنجاز يبقى للعمليات. */
    submittedForReviewAt: tsColumn('submitted_for_review_at'),
    completedAt: tsColumn('completed_at'),
    completedById: uuidColumn('completed_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    blockedReasonAr: text('blocked_reason_ar'),

    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    check(
      'work_items_single_scope',
      sql`num_nonnulls(${table.officeId}, ${table.programId},
                       ${table.initiativeId}, ${table.siteId},
                       ${table.partnerId}) = 1`,
    ),
    check(
      'work_items_completion_consistency',
      sql`(${table.status} = 'DONE') = (${table.completedAt} is not null)`,
    ),
    check(
      'work_items_blocked_reason',
      sql`${table.status} <> 'BLOCKED' or ${table.blockedReasonAr} is not null`,
    ),
    index('work_items_office_idx').on(table.officeId, table.status),
    index('work_items_initiative_idx').on(table.initiativeId, table.status),
    index('work_items_site_idx').on(table.siteId),
    index('work_items_assignee_idx').on(table.assigneeUserId, table.status),
    index('work_items_partner_idx').on(table.assignedPartnerId, table.status),
    index('work_items_due_idx').on(table.dueAt),
  ],
)

/**
 * تعليق على مهمة. `authorPartnerId` يميّز تعليق الشريك عن تعليق الفريق،
 * و`isInternal` يخفي نقاش الفريق عن بوابة الشريك.
 */
export const workItemComments = pgTable(
  'work_item_comments',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    workItemId: uuidColumn('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),

    authorUserId: uuidColumn('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorPartnerId: uuidColumn('author_partner_id').references(
      () => partners.id,
      { onDelete: 'set null' },
    ),
    authorNameAr: varchar('author_name_ar', { length: 160 }).notNull(),

    bodyAr: text('body_ar').notNull(),
    /** الافتراضي داخلي: ما لا يُعلَن ظاهرًا للشريك يبقى بين الفريق. */
    isInternal: boolean('is_internal').default(true).notNull(),

    /** معرّف المُرسِل: ملاحظة كُتبت بلا شبكة وأُعيد إرسالها لا تتكرر. */
    clientId: uuidColumn('client_id'),

    ...createdAtOnly,
  },
  (table) => [
    index('work_item_comments_item_idx').on(table.workItemId, table.createdAt),
    uniqueIndex('work_item_comments_client_unique')
      .on(table.clientId)
      .where(sql`${table.clientId} is not null`),
  ],
)

/**
 * قوالب المراحل والمهام لكل برنامج، تُنسخ عند إنشاء مبادرة جديدة.
 *
 * هذا ما يجعل إطلاق المبادرة الثانية دقائق لا أسبوعًا: خطة تشغيل التشجير
 * تُكتب مرة، ثم كل حملة تشجير تبدأ بها جاهزة.
 *
 * `dueOffsetDays` إزاحة بالأيام عن تاريخ بدء المبادرة، فالقالب لا يحمل
 * تواريخ مطلقة تتقادم.
 */
export const workTemplates = pgTable(
  'work_templates',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    programId: uuidColumn('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    parentId: uuidColumn('parent_id').references(
      (): AnyPgColumn => workTemplates.id,
      { onDelete: 'cascade' },
    ),

    kind: templateKind('kind').notNull(),
    titleAr: varchar('title_ar', { length: 300 }).notNull(),
    descriptionAr: text('description_ar'),

    dueOffsetDays: integer('due_offset_days'),
    defaultOfficeId: uuidColumn('default_office_id').references(
      () => offices.id,
      { onDelete: 'set null' },
    ),
    priority: workItemPriority('priority').default('NORMAL').notNull(),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    index('work_templates_program_idx').on(table.programId, table.displayOrder),
    check('work_templates_no_self_parent', sql`${table.parentId} <> ${table.id}`),
    // المرحلة جذر دائمًا؛ المهمة قد تتبع مرحلة أو تقف وحدها.
    check(
      'work_templates_milestone_is_root',
      sql`${table.kind} <> 'MILESTONE' or ${table.parentId} is null`,
    ),
  ],
)

export type Milestone = typeof milestones.$inferSelect
export type NewMilestone = typeof milestones.$inferInsert
export type WorkItem = typeof workItems.$inferSelect
export type NewWorkItem = typeof workItems.$inferInsert
export type WorkItemComment = typeof workItemComments.$inferSelect
export type WorkTemplate = typeof workTemplates.$inferSelect
export type NewWorkTemplate = typeof workTemplates.$inferInsert
