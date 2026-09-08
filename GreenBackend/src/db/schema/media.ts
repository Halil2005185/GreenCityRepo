import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps, tsColumn, uuidColumn } from './columns.js'
import {
  contactPriority,
  engagementHorizon,
  interactionKind,
  mediaContactStage,
} from './enums.js'
import { users } from './identity.js'
import { partners } from './partners.js'
import { mediaChannels, relationshipTypes } from './relations.js'

/**
 * صانع المحتوى أو الإعلامي — سجل أشخاص مستقل عن سجل الشركاء.
 *
 * طلب مكتب العلاقات كان صريحًا: «مابدي يكون ضمن قائمة الشركاء». والسبب
 * بنيوي لا ذوقي: `partners` جهة تعبر بوابة اعتماد — إقرار ميثاق، نوع
 * شراكة معتمد، جهة اتصال رئيسية، وتوقيع المدير العام. مراسل نتصل به
 * لتغطية فعالية لا يعبر شيئًا من ذلك، وحشره هناك إما يفرغ البوابة من
 * معناها أو يترك مئات الصفوف عالقة في `NEW` إلى الأبد.
 *
 * الربط بالشريك يبقى ممكنًا عبر `partnerId` حين يعمل الشخص لدى جهة
 * مسجّلة — علاقة لا دمج.
 */
export const mediaContacts = pgTable(
  'media_contacts',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),

    fullNameAr: varchar('full_name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    /** المسمى الوظيفي كما يعرّف الشخص نفسه: «مراسل»، «صانع محتوى». */
    jobTitleAr: varchar('job_title_ar', { length: 160 }),

    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 32 }),
    /** حساب أو صفحة يُتابَع عليها المحتوى، حين لا يكون هناك موقع. */
    profileUrl: varchar('profile_url', { length: 500 }),

    /**
     * الجهة التي يعمل لديها. نصّ حر لأن أغلب من نتعامل معهم مستقلون أو
     * يعملون لدى قنوات لن تُسجَّل شريكةً أبدًا؛ و`partnerId` يُملأ وحده
     * حين تكون الجهة في السجل فعلًا.
     */
    outletNameAr: varchar('outlet_name_ar', { length: 200 }),
    partnerId: uuidColumn('partner_id').references(() => partners.id, {
      onDelete: 'set null',
    }),

    stage: mediaContactStage('stage').default('NEW').notNull(),
    priority: contactPriority('priority').default('MEDIUM').notNull(),
    horizon: engagementHorizon('horizon'),
    relationshipTypeId: uuidColumn('relationship_type_id').references(
      () => relationshipTypes.id,
      { onDelete: 'set null' },
    ),

    /** مسؤول العلاقة من المكتب — من يُسأل عن هذا الشخص. */
    accountManagerId: uuidColumn('account_manager_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),

    /**
     * آخر تواصل. عمود محفوظ لا محسوب في كل قراءة: عليه يقوم فرز «من لم
     * نكلّمه منذ شهر»، وحسابه من جدول المتابعات في كل استعلام قائمة
     * يجعل الفرز أغلى بلا مقابل.
     *
     * تحدّثه الخدمة عند تسجيل متابعة، ويقبل الإدخال اليدوي لأن أول ما
     * سيُدخله المكتب تاريخ مكالمة جرت قبل وجود النظام.
     */
    lastContactAt: tsColumn('last_contact_at'),

    /** لا يخرج من الـAPI إلا لمن يملك `media.notes.view`. */
    internalNotesAr: text('internal_notes_ar'),

    ...timestamps,
  },
  (table) => [
    index('media_contacts_stage_idx').on(table.stage),
    index('media_contacts_priority_idx').on(table.priority),
    index('media_contacts_manager_idx').on(table.accountManagerId),
    index('media_contacts_partner_idx').on(table.partnerId),
    index('media_contacts_last_contact_idx').on(table.lastContactAt),
    index('media_contacts_name_idx').on(table.fullNameAr),
    // البريد ليس مفتاحًا: كثيرون لا يعطونه، والفهرس الجزئي يمنع التكرار
    // دون أن يمنع صفوفًا بلا بريد.
    uniqueIndex('media_contacts_email_unique')
      .on(table.email)
      .where(sql`${table.email} is not null`),
    check(
      'media_contacts_email_lowercase',
      sql`${table.email} is null or ${table.email} = lower(${table.email})`,
    ),
    /**
     * شخص بلا بريد ولا هاتف ولا حساب ليس جهة اتصال بل اسم في دفتر.
     * السجل كله وُجد للتواصل، فصفٌّ لا يُتواصل معه خطأ إدخال لا حالة.
     */
    check(
      'media_contacts_reachable',
      sql`${table.email} is not null
          or ${table.phone} is not null
          or ${table.profileUrl} is not null`,
    ),
  ],
)

/**
 * أشكال العمل الإعلامي لهذا الشخص — متعدد لا مفرد.
 *
 * مصوّر يصنع «سؤال شارع» ويحرّر ريبورتاجات شخص واحد بشكلين، وحصره في
 * عمود واحد يجبر المكتب على اختيار أيهما «الأصح» — وهو سؤال بلا جواب.
 */
export const mediaContactChannels = pgTable(
  'media_contact_channels',
  {
    contactId: uuidColumn('contact_id')
      .notNull()
      .references(() => mediaContacts.id, { onDelete: 'cascade' }),
    channelId: uuidColumn('channel_id')
      .notNull()
      .references(() => mediaChannels.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.channelId] }),
    index('media_contact_channels_channel_idx').on(table.channelId),
  ],
)

/**
 * سجل المتابعة — مرآة `partner_interactions` مع محور واحد إضافي.
 *
 * `dueAt` و`completedAt` يحوّلان السجل من أرشيف إلى قائمة عمل: «راجعه
 * بعد أسبوع» تصير صفًّا مستحقًّا يظهر في الشاشة، لا نية في رأس أحدهم.
 * الفكرة من قسم إدارة العملاء في تمحور، حيث المتابعة المستحقة هي ما
 * يجعل السجل حيًّا.
 */
export const mediaContactInteractions = pgTable(
  'media_contact_interactions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    contactId: uuidColumn('contact_id')
      .notNull()
      .references(() => mediaContacts.id, { onDelete: 'cascade' }),

    kind: interactionKind('kind').notNull(),
    occurredAt: tsColumn('occurred_at').notNull(),
    summaryAr: varchar('summary_ar', { length: 300 }).notNull(),
    bodyAr: text('body_ar'),

    dueAt: tsColumn('due_at'),
    completedAt: tsColumn('completed_at'),

    recordedById: uuidColumn('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    index('media_contact_interactions_contact_idx').on(
      table.contactId,
      table.occurredAt,
    ),
    // فهرس جزئي على المستحق وحده: قائمة المتابعات تسأل عن الصفوف المفتوحة
    // فقط، وهي أقلية دائمة مهما نما الأرشيف.
    index('media_contact_interactions_open_idx')
      .on(table.dueAt)
      .where(sql`${table.dueAt} is not null and ${table.completedAt} is null`),
    // إنجاز متابعة لم يُطلب موعدها لا معنى له.
    check(
      'media_contact_interactions_completion_needs_due',
      sql`${table.completedAt} is null or ${table.dueAt} is not null`,
    ),
  ],
)

export type MediaContact = typeof mediaContacts.$inferSelect
export type NewMediaContact = typeof mediaContacts.$inferInsert
export type MediaContactInteraction =
  typeof mediaContactInteractions.$inferSelect
