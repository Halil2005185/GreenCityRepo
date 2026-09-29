import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import { attendanceMethod, fieldMemberRole, fieldRsvp } from './enums.js'
import { formSubmissions } from './forms.js'
import { users } from './identity.js'
import { impactEntries } from './metrics.js'
import { initiativeSites, initiatives } from './programs.js'
import { workItems } from './work.js'

/**
 * المشارك — متطوع يأتي يوم الحملة. ليس حسابًا ولا يصير حسابًا.
 *
 * PLAN.md صريح: «المتطوع ليس حسابًا» — مئة متطوع ميداني لا يحتاجون لوحة
 * تحكم. لكن الحضور والشهادات تحتاج هوية تتكرر عبر الحملات، وطلب الاستمارة
 * حدثٌ لا شخص: من تقدّم مرتين صفّان هناك وشخص واحد هنا.
 *
 * والصف يُنشأ بقرار المنسّق لا من الاستمارة نفسها: الحد الثاني في PLAN.md
 * قائم — لا شيء ينتقل تلقائيًا من إجابة إلى كيان أساسي.
 *
 * الهاتف والبريد هنا وحدهما في النظام كله، ولا يخرجان في استجابة إلا
 * للمنسّق ولقائد مجموعة المشارك.
 */
export const participants = pgTable(
  'participants',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    fullNameAr: varchar('full_name_ar', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 254 }),

    /**
     * صورتان للمطابقة لا للعرض: الاسم مطبَّعًا (أ ← ا، ة ← ه) والهاتف
     * أرقامًا. بهما يُعرف أن «أسامة 0944 123 456» هو «اسامه +963944123456»
     * حين يُضاف من استمارة ثانية، فلا يصير الشخص مشاركَين.
     */
    nameKey: varchar('name_key', { length: 160 }).notNull(),
    phoneKey: varchar('phone_key', { length: 20 }),

    sourceSubmissionId: uuidColumn('source_submission_id').references(
      () => formSubmissions.id,
      { onDelete: 'set null' },
    ),
    notesAr: text('notes_ar'),
    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    // طلب واحد يصير مشاركًا واحدًا، مهما أُعيد تحويله.
    uniqueIndex('participants_submission_unique')
      .on(table.sourceSubmissionId)
      .where(sql`${table.sourceSubmissionId} is not null`),
    /**
     * الهاتف وحده ليس هوية: في تشجير المدارس يسجَّل أخوان بهاتف أبيهما.
     * الفهرسان للبحث عند المطابقة، والقرار «هل هو الشخص نفسه» في الخدمة
     * بالاسم والهاتف معًا.
     */
    index('participants_phone_key_idx').on(table.phoneKey),
    index('participants_email_idx').on(table.email),
    index('participants_name_key_idx').on(table.nameKey),
    check(
      'participants_email_lowercase',
      sql`${table.email} is null or ${table.email} = lower(${table.email})`,
    ),
  ],
)

/**
 * المجموعة الميدانية — وحدة العمل يوم الحملة: موقع ← مجموعة أو أكثر، ولكل
 * مجموعة قائد وموعد ونقطة لقاء.
 *
 * `initiativeId` مكرَّر عمدًا مع أن الموقع يدلّ عليه: لوحة المنسّق تسأل عن
 * مجموعات المبادرة كلها في كل فتح، والتطبيق يسأل عن مبادرة المجموعة ليقرر
 * هل ما زالت تقبل تسجيلًا. والخدمة تفرض أن الموقع من المبادرة نفسها.
 *
 * القائد مستخدم لا مشارك: من يسجّل أرقام الأثر والحضور يحتاج حسابًا يُسأل
 * عنه ويُبطَل. وحذف حسابه يُبقي المجموعة بلا قائد بدل أن يمحوها بما فيها.
 */
export const fieldGroups = pgTable(
  'field_groups',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),
    siteId: uuidColumn('site_id')
      .notNull()
      .references(() => initiativeSites.id, { onDelete: 'cascade' }),

    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    leadUserId: uuidColumn('lead_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    meetsAt: tsColumn('meets_at'),
    meetingPointAr: varchar('meeting_point_ar', { length: 300 }),
    /** ما يحضره المتطوع وما ينتبه له — يُقرأ في الميدان، فهو نص لا حقول. */
    instructionsAr: text('instructions_ar'),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    // اسمان متطابقان في موقع واحد لا يميّزهما القائد ولا المتطوع.
    uniqueIndex('field_groups_site_name_unique').on(table.siteId, table.nameAr),
    index('field_groups_initiative_idx').on(table.initiativeId),
    index('field_groups_lead_idx').on(table.leadUserId),
  ],
)

/**
 * عضوية مشارك في مجموعة: التوزيع قبل اليوم، وتأكيد الحضور المسبق.
 *
 * غير الحضور: هذا «من يُنتظر»، وذاك «من جاء». من جاء بلا تسجيل يصير عضوًا
 * ساعة يُسجَّل حضوره، فتبقى قائمة المجموعة تضم كل من عمل فيها.
 */
export const fieldGroupMembers = pgTable(
  'field_group_members',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    groupId: uuidColumn('group_id')
      .notNull()
      .references(() => fieldGroups.id, { onDelete: 'cascade' }),
    participantId: uuidColumn('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),

    role: fieldMemberRole('role').default('MEMBER').notNull(),
    rsvp: fieldRsvp('rsvp').default('UNKNOWN').notNull(),
    rsvpAt: tsColumn('rsvp_at'),

    addedById: uuidColumn('added_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('field_group_members_unique').on(
      table.groupId,
      table.participantId,
    ),
    index('field_group_members_participant_idx').on(table.participantId),
  ],
)

/**
 * الحضور — من جاء فعلًا، في أي يوم.
 *
 * `attendedOn` يوم بتوقيت دمشق لا طابع زمني: الحملة أيام، ومجموعة واحدة
 * تعمل ثلاثة أيام في موقعها بثلاثة حضور لكل عضو. والطابع (`checkedInAt`)
 * وقت النقرة على هاتف القائد، وقد يصل الخادم بعدها بساعات.
 *
 * التراجع بطابع لا بحذف: «سُجّل ثم أُلغي» معلومة، وحذف الصف يمحوها.
 */
export const attendance = pgTable(
  'attendance',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    groupId: uuidColumn('group_id')
      .notNull()
      .references(() => fieldGroups.id, { onDelete: 'cascade' }),
    participantId: uuidColumn('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),

    attendedOn: date('attended_on', { mode: 'string' }).notNull(),
    checkedInAt: tsColumn('checked_in_at').notNull(),
    checkedInById: uuidColumn('checked_in_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    method: attendanceMethod('method').notNull(),

    /** معرّف المُرسِل: نقرة أُعيد إرسالها بعد انقطاع لا تصير حضورين. */
    clientId: uuidColumn('client_id'),

    undoneAt: tsColumn('undone_at'),
    undoneById: uuidColumn('undone_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...createdAtOnly,
  },
  (table) => [
    uniqueIndex('attendance_client_unique')
      .on(table.clientId)
      .where(sql`${table.clientId} is not null`),
    // حضور قائم واحد للشخص في المجموعة في اليوم؛ الملغى يتراكم كتاريخ.
    uniqueIndex('attendance_active_unique')
      .on(table.groupId, table.participantId, table.attendedOn)
      .where(sql`${table.undoneAt} is null`),
    index('attendance_group_day_idx').on(table.groupId, table.attendedOn),
    index('attendance_participant_idx').on(table.participantId),
  ],
)

/**
 * المرفق — صورة أو دليل مربوط بما يثبته.
 *
 * أربعة أعمدة اختيارية بمفاتيح حقيقية وقيد يفرض واحدًا بالضبط، كما في
 * `metric_targets`: زوج `entity_type`+`entity_id` العام لا تتحقق منه
 * القاعدة، فيبقى مرفق معلّق على موقع محذوف يظهر في معرض بلا صاحب.
 *
 * وهو عام لا خاص بالميدان: اللوحة تستعمله حين يُبنى رفع الأدلة فيها.
 *
 * علَما الخصوصية مستقلان: `peopleConsent` يقوله من التقط الصورة في
 * الميدان، و`publicUseAllowed` لا يرفعه إلا المنسّق بعد المراجعة. صورة
 * بلا الثاني داخلية إلى الأبد — برنامج تشجير المدارس يعني أطفالًا فيها.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),

    initiativeId: uuidColumn('initiative_id').references(() => initiatives.id, {
      onDelete: 'cascade',
    }),
    siteId: uuidColumn('site_id').references(() => initiativeSites.id, {
      onDelete: 'cascade',
    }),
    workItemId: uuidColumn('work_item_id').references(() => workItems.id, {
      onDelete: 'cascade',
    }),
    impactEntryId: uuidColumn('impact_entry_id').references(
      () => impactEntries.id,
      { onDelete: 'cascade' },
    ),

    /** المجموعة التي التقطته، لتقرير «ماذا وثّقت كل مجموعة». */
    groupId: uuidColumn('group_id').references(() => fieldGroups.id, {
      onDelete: 'set null',
    }),

    url: varchar('url', { length: 500 }).notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),

    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }),
    takenAt: tsColumn('taken_at'),
    captionAr: varchar('caption_ar', { length: 300 }),

    hasPeople: boolean('has_people').default(false).notNull(),
    peopleConsent: boolean('people_consent').default(false).notNull(),
    publicUseAllowed: boolean('public_use_allowed').default(false).notNull(),
    publicUseAllowedAt: tsColumn('public_use_allowed_at'),
    publicUseAllowedById: uuidColumn('public_use_allowed_by_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),

    uploadedByUserId: uuidColumn('uploaded_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    uploadedByParticipantId: uuidColumn('uploaded_by_participant_id').references(
      () => participants.id,
      { onDelete: 'set null' },
    ),

    clientId: uuidColumn('client_id'),

    ...createdAtOnly,
  },
  (table) => [
    check(
      'attachments_single_scope',
      sql`num_nonnulls(${table.initiativeId}, ${table.siteId},
                       ${table.workItemId}, ${table.impactEntryId}) = 1`,
    ),
    check(
      'attachments_coordinates_paired',
      sql`(${table.lat} is null) = (${table.lng} is null)`,
    ),
    check('attachments_size_positive', sql`${table.sizeBytes} > 0`),
    /**
     * القاعدة تحرس ما لا يجوز أن يخطئ فيه كود: صورة فيها أشخاص لا تُنشر
     * بلا موافقتهم، مهما كان المسار الذي رفع علم النشر.
     */
    check(
      'attachments_public_needs_consent',
      sql`not ${table.publicUseAllowed}
          or not ${table.hasPeople}
          or ${table.peopleConsent}`,
    ),
    check(
      'attachments_public_consistency',
      sql`${table.publicUseAllowed} = (${table.publicUseAllowedAt} is not null)`,
    ),
    uniqueIndex('attachments_client_unique')
      .on(table.clientId)
      .where(sql`${table.clientId} is not null`),
    uniqueIndex('attachments_url_unique').on(table.url),
    index('attachments_site_idx').on(table.siteId, table.createdAt),
    index('attachments_work_item_idx').on(table.workItemId),
    index('attachments_initiative_idx').on(table.initiativeId),
    index('attachments_group_idx').on(table.groupId),
  ],
)

export type Participant = typeof participants.$inferSelect
export type NewParticipant = typeof participants.$inferInsert
export type FieldGroup = typeof fieldGroups.$inferSelect
export type NewFieldGroup = typeof fieldGroups.$inferInsert
export type FieldGroupMember = typeof fieldGroupMembers.$inferSelect
export type Attendance = typeof attendance.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type NewAttachment = typeof attachments.$inferInsert
