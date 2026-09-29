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
import { formSubmissions, forms } from './forms.js'
import { users } from './identity.js'
import { impactEntries } from './metrics.js'
import { partners } from './partners.js'
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

    /**
     * فريق جهة شريكة: شركة تأتي بموظفيها، أو جمعية بمتطوعيها. به تظهر
     * المجموعة في بوابة الجهة بأعدادها. وانتهاء الشراكة لا يمحو المجموعة
     * ولا حضورها: تبقى بلا جهة.
     */
    partnerId: uuidColumn('partner_id').references(() => partners.id, {
      onDelete: 'set null',
    }),

    /**
     * وسيلة تواصل واحدة تُعرض لأعضاء المجموعة في بطاقاتهم، يختارها المنسّق:
     * هاتف القائد إن رضي، أو رقم المنسّق. ليست هاتف القائد من حسابه — ذاك
     * لم يُعطَ ليُنشر على مئة متطوع.
     */
    contactPhone: varchar('contact_phone', { length: 32 }),

    meetsAt: tsColumn('meets_at'),
    meetingPointAr: varchar('meeting_point_ar', { length: 300 }),
    /** ما يحضره المتطوع وما ينتبه له — يُقرأ في الميدان، فهو نص لا حقول. */
    instructionsAr: text('instructions_ar'),
    displayOrder: integer('display_order').default(0).notNull(),

    /**
     * ساعات العمل في يوم المجموعة. منها تُحسب ساعات المتطوع في سجله
     * وشهادته: يوم حضور في المجموعة يساوي هذه الساعات. الحضور يُسجَّل عند
     * الوصول وحده ولا وقت انصراف له، فالساعات ما قرره المنسّق ليوم العمل
     * لا ما قاسته ساعة.
     */
    hoursPerDay: numeric('hours_per_day', { precision: 3, scale: 1 }),

    /**
     * سرّ رمز الحضور الذاتي: منه يحسب هاتف القائد رمزًا يتبدّل كل دقيقة،
     * بلا شبكة، ويتحقق الخادم منه حين يكتبه المتطوع. يُولَّد عند أول فتح
     * لورقة المجموعة، ولا يخرج إلا إلى قائدها ومساعديه.
     */
    checkinSecret: varchar('checkin_secret', { length: 64 }),

    ...timestamps,
  },
  (table) => [
    // اسمان متطابقان في موقع واحد لا يميّزهما القائد ولا المتطوع.
    uniqueIndex('field_groups_site_name_unique').on(table.siteId, table.nameAr),
    index('field_groups_initiative_idx').on(table.initiativeId),
    index('field_groups_lead_idx').on(table.leadUserId),
    index('field_groups_partner_idx').on(table.partnerId),
    check(
      'field_groups_hours_range',
      sql`${table.hoursPerDay} is null
          or (${table.hoursPerDay} > 0 and ${table.hoursPerDay} <= 24)`,
    ),
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
 * الرابط الشخصي — اعتماد المتطوع الوحيد. لا حساب ولا كلمة مرور.
 *
 * يُحفظ مجزّأً كرموز الجلسات: من قرأ القاعدة لا يفتح بطاقة أحد. ونطاقه
 * مبادرة واحدة، فمن شارك رابطه أعطى بطاقته في تلك الحملة لا أكثر.
 *
 * رابط قائم واحد للمشارك في المبادرة: توليد جديد يُبطل ما قبله، فلا يبقى
 * رابط قديم في محادثة منسيّة يفتح البطاقة بعد أن ظُنّ أنه استُبدل.
 */
export const participantLinks = pgTable(
  'participant_links',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    participantId: uuidColumn('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),

    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: tsColumn('expires_at').notNull(),

    firstUsedAt: tsColumn('first_used_at'),
    lastUsedAt: tsColumn('last_used_at'),
    /** أُرسل بالبريد من النظام. النسخ إلى واتساب لا يُعرف هنا. */
    emailedAt: tsColumn('emailed_at'),

    revokedAt: tsColumn('revoked_at'),
    revokedById: uuidColumn('revoked_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('participant_links_token_unique').on(table.tokenHash),
    uniqueIndex('participant_links_active_unique')
      .on(table.participantId, table.initiativeId)
      .where(sql`${table.revokedAt} is null`),
    index('participant_links_initiative_idx').on(table.initiativeId),
    check(
      'participant_links_hash_is_sha256',
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
)

/**
 * إعدادات ميدان المبادرة. جدول لا أعمدة على `initiatives`: الميدان قدرة
 * أخرى (`field.manage`) وعقد آخر، ومن يدير المبادرة لا يلزمه أن يراه.
 *
 * استمارة التقييم تُختار من الاستمارات المنشورة — لا محرك تقييم جديد.
 */
export const fieldSettings = pgTable('field_settings', {
  initiativeId: uuidColumn('initiative_id')
    .primaryKey()
    .references(() => initiatives.id, { onDelete: 'cascade' }),
  feedbackFormId: uuidColumn('feedback_form_id').references(() => forms.id, {
    onDelete: 'set null',
  }),

  /**
   * الشهادة قرار المبادرة لا افتراض النظام: ورقة تحمل اسم المشروع وتوقيع
   * مسؤول فيه، فلا تصدر حتى يفعّلها المنسّق ويسمّي من يوقّعها.
   */
  certificatesEnabled: boolean('certificates_enabled').default(false).notNull(),
  certificateSignerNameAr: varchar('certificate_signer_name_ar', {
    length: 160,
  }),
  certificateSignerTitleAr: varchar('certificate_signer_title_ar', {
    length: 160,
  }),

  updatedById: uuidColumn('updated_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
})

/**
 * شهادة مشاركة — رمزها وحده. ما تقوله الشهادة (الأيام والساعات) يُحسب من
 * الحضور ساعة تُقرأ، لا يُنسخ هنا: حضور تُرجع عنه بعد الإصدار يُرى في صفحة
 * التحقق، فلا تبقى ورقة تشهد بما لم يعد في السجل.
 *
 * شهادة واحدة للمشارك في المبادرة، ورمزها ثابت: من طبعها ثم حضر يومًا آخر
 * يطبعها من جديد بالرمز نفسه.
 */
export const participantCertificates = pgTable(
  'participant_certificates',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    participantId: uuidColumn('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),

    /** عشرة محارف بلا ما يلتبس (0 وO، 1 وI): تُقرأ من ورقة وتُكتب باليد. */
    code: varchar('code', { length: 16 }).notNull(),
    issuedAt: tsColumn('issued_at').defaultNow().notNull(),

    ...createdAtOnly,
  },
  (table) => [
    uniqueIndex('participant_certificates_code_unique').on(table.code),
    uniqueIndex('participant_certificates_holder_unique').on(
      table.participantId,
      table.initiativeId,
    ),
    check(
      'participant_certificates_code_format',
      sql`${table.code} ~ '^[2-9A-HJ-NP-Z]{10}$'`,
    ),
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
    /**
     * من سجّله حين يكون مشاركًا لا عضو فريق: مساعد القائد، أو المتطوع نفسه
     * برمز الحضور. واحد من العمودين على الأكثر.
     */
    checkedInByParticipantId: uuidColumn(
      'checked_in_by_participant_id',
    ).references(() => participants.id, { onDelete: 'set null' }),
    method: attendanceMethod('method').notNull(),

    /** معرّف المُرسِل: نقرة أُعيد إرسالها بعد انقطاع لا تصير حضورين. */
    clientId: uuidColumn('client_id'),

    undoneAt: tsColumn('undone_at'),
    undoneById: uuidColumn('undone_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    undoneByParticipantId: uuidColumn('undone_by_participant_id').references(
      () => participants.id,
      { onDelete: 'set null' },
    ),

    ...createdAtOnly,
  },
  (table) => [
    check(
      'attendance_single_recorder',
      sql`num_nonnulls(${table.checkedInById},
                       ${table.checkedInByParticipantId}) <= 1`,
    ),
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
export type ParticipantLink = typeof participantLinks.$inferSelect
export type ParticipantCertificate = typeof participantCertificates.$inferSelect
export type Attendance = typeof attendance.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type NewAttachment = typeof attachments.$inferInsert
