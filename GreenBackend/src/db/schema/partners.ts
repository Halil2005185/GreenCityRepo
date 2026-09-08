import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import {
  consentAction,
  consentSource,
  consentType,
  contactPriority as contactPriorityEnum,
  contactStatus,
  engagementHorizon as engagementHorizonEnum,
  interactionKind,
  membershipStatus,
  organizationKind,
  partnerStage,
  partnershipStatus,
  partnershipType,
  supportForm,
} from './enums.js'
import { users } from './identity.js'
import { roles } from './org.js'
import { initiatives } from './programs.js'
import { mediaChannels, relationshipTypes } from './relations.js'

/**
 * الجهة الشريكة — سجل CRM كامل من «محتملة» إلى «نشطة».
 *
 * الموافقة على إظهار الاسم والشعار محوران مستقلان عن الحالة: جهة نشطة
 * قد ترفض الظهور، وسحب الموافقة لا يُنهي الشراكة. القيم هنا مرآة
 * لآخر حدث في `partner_consent_events`، والحدث هو المصدر لا العكس.
 *
 * `suspendedAt` محور ثالث مستقل: تعليق مؤقت لجهة نشطة لا يعيدها إلى
 * التفاوض ولا يمحو تاريخ اعتمادها.
 */
export const partners = pgTable(
  'partners',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    /** اختياري الآن؛ يلزم حين يُبنى جدار الشركاء في الموقع العام. */
    slug: varchar('slug', { length: 80 }),

    legalNameAr: varchar('legal_name_ar', { length: 200 }).notNull(),
    displayNameAr: varchar('display_name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    organizationKind: organizationKind('organization_kind').notNull(),

    stage: partnerStage('stage').default('NEW').notNull(),
    supportForms: supportForm('support_forms')
      .array()
      .notNull()
      .default(sql`'{}'::support_form[]`),

    websiteUrl: varchar('website_url', { length: 500 }),
    summaryAr: text('summary_ar'),

    /** مسؤول العلاقة من مكتب العلاقات. */
    accountManagerId: uuidColumn('account_manager_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),

    /**
     * محاور تصنيف العلاقة — المفردات نفسها المستعملة في الشبكة الإعلامية.
     *
     * مكتب العلاقات طلبها على الجهات أيضًا: «بدي من هاد الشي ينضاف لقسم
     * الشركاء كمان». وتوحيدها مقصود: صفحة تقول عن مراسل «أولوية عالية،
     * مدى طويل» وأخرى تقول عن قناته شيئًا بمفردات أخرى تجبر القارئ على
     * ترجمة بين لغتين داخل المكتب الواحد.
     *
     * `stage` يبقى محورًا مستقلًا: مرحلة الشراكة أين وصل الملف، والأولوية
     * كم يهمّنا أن يصل.
     */
    relationshipTypeId: uuidColumn('relationship_type_id').references(
      () => relationshipTypes.id,
      { onDelete: 'set null' },
    ),
    contactPriority: contactPriorityEnum('contact_priority')
      .default('MEDIUM')
      .notNull(),
    engagementHorizon: engagementHorizonEnum('engagement_horizon'),

    /** يُحدَّث عند تسجيل متابعة، ويقبل الإدخال اليدوي لتاريخ سابق للنظام. */
    lastContactAt: tsColumn('last_contact_at'),

    /** لا يخرج من الـAPI إلا لمن يملك `partners.notes.view`. */
    internalNotesAr: text('internal_notes_ar'),

    publicNameConsent: boolean('public_name_consent').default(false).notNull(),
    publicNameConsentAt: tsColumn('public_name_consent_at'),
    publicLogoConsent: boolean('public_logo_consent').default(false).notNull(),
    publicLogoConsentAt: tsColumn('public_logo_consent_at'),

    approvedById: uuidColumn('approved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    activatedAt: tsColumn('activated_at'),

    /** يُعرض للجهة عند الرفض، بخلاف `decisionNoteAr` الداخلية. */
    rejectionReasonAr: text('rejection_reason_ar'),
    decisionNoteAr: text('decision_note_ar'),

    suspendedAt: tsColumn('suspended_at'),
    suspendedById: uuidColumn('suspended_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    suspensionReasonAr: text('suspension_reason_ar'),

    endedAt: tsColumn('ended_at'),
    endReasonAr: text('end_reason_ar'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('partners_slug_unique')
      .on(table.slug)
      .where(sql`${table.slug} is not null`),
    index('partners_stage_idx').on(table.stage),
    index('partners_manager_idx').on(table.accountManagerId),
    index('partners_display_name_idx').on(table.displayNameAr),
    // الاعتماد يترك أثره: جهة نشطة بلا معتمِد ولا تاريخ تفعيل تعني تجاوزًا للبوابة.
    check(
      'partners_activation_consistency',
      sql`${table.stage} <> 'ACTIVE'
          or (${table.activatedAt} is not null and ${table.approvedById} is not null)`,
    ),
    check(
      'partners_suspension_consistency',
      sql`(${table.suspendedAt} is null) = (${table.suspendedById} is null)`,
    ),
    check(
      'partners_consent_name_consistency',
      sql`${table.publicNameConsent} = false or ${table.publicNameConsentAt} is not null`,
    ),
    check(
      'partners_consent_logo_consistency',
      sql`${table.publicLogoConsent} = false or ${table.publicLogoConsentAt} is not null`,
    ),
  ],
)

/**
 * «يمكن أن يحمل الشريك أكثر من صفة شراكة وفق طبيعة مساهمته» — نص الميثاق.
 * لذلك علاقة متعدد-إلى-متعدد لا حقل مفرد على الجهة.
 *
 * شراكة `EVENT` يجب أن ترتبط بمبادرة محددة. عمود `initiative_id` ومفتاحه
 * يُضافان مع جدول المبادرات في المرحلة الثالثة؛ حتى ذلك الحين ترفض
 * الخدمة هذا النوع صراحةً بدل تخزين شراكة فعالية بلا فعالية.
 */
export const partnerPartnerships = pgTable(
  'partner_partnerships',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    type: partnershipType('type').notNull(),
    status: partnershipStatus('status').default('PROPOSED').notNull(),

    /**
     * إلزامي لنوع `EVENT` وممنوع لغيره — نصّ الميثاق: شريك الفعالية يدعم
     * «نشاطًا أو مبادرة محددة دون التزام طويل الأمد بباقي أنشطة المشروع».
     * كان النوع مرفوضًا في المرحلة الثانية لغياب جدول المبادرات.
     */
    initiativeId: uuidColumn('initiative_id').references(() => initiatives.id, {
      onDelete: 'restrict',
    }),

    approvedById: uuidColumn('approved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: tsColumn('approved_at'),
    startedAt: tsColumn('started_at'),
    endedAt: tsColumn('ended_at'),
    notesAr: text('notes_ar'),

    ...timestamps,
  },
  (table) => [
    // نوع واحد فعّال لكل جهة؛ المنتهية تتراكم كتاريخ.
    uniqueIndex('partner_partnerships_live_unique')
      .on(table.partnerId, table.type)
      .where(sql`${table.status} <> 'ENDED'`),
    index('partner_partnerships_partner_idx').on(table.partnerId),
    index('partner_partnerships_status_idx').on(table.status),
    /**
     * الاعتماد والتعليق وحدهما يستلزمان معتمِدًا.
     *
     * `ENDED` لا يستلزمه: سحب اقتراح لم يُعتمد قط حالة مشروعة، وإدراجه
     * ضمن الشرط كان يمنع مكتب العلاقات من سحب اقتراحه.
     */
    check(
      'partner_partnerships_approval_consistency',
      sql`${table.status} not in ('APPROVED', 'PAUSED')
          or (${table.approvedAt} is not null and ${table.approvedById} is not null)`,
    ),
    // شراكة فعالية بلا فعالية لا معنى لها، وشراكة استراتيجية مربوطة
    // بمبادرة واحدة تناقض تعريفها.
    check(
      'partner_partnerships_event_needs_initiative',
      sql`(${table.type} = 'EVENT' and ${table.initiativeId} is not null)
          or (${table.type} <> 'EVENT' and ${table.initiativeId} is null)`,
    ),
  ],
)

/**
 * مشاركة جهة في مبادرة — علاقة تشغيلية تختلف عن نوع الشراكة.
 *
 * نوع الشراكة صفة الجهة في المشروع كله («شريك تنفيذي»)، وهذا الجدول
 * يقول في أي مبادرة تعمل فعلًا وبأي دور. جهة قد تحمل صفة تنفيذية وتشارك
 * في مبادرتين من أصل عشر.
 */
export const initiativePartners = pgTable(
  'initiative_partners',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),

    roleAr: varchar('role_ar', { length: 160 }),
    notesAr: text('notes_ar'),
    addedById: uuidColumn('added_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('initiative_partners_unique').on(
      table.initiativeId,
      table.partnerId,
    ),
    index('initiative_partners_partner_idx').on(table.partnerId),
  ],
)

/**
 * جهات الاتصال داخل الجهة الشريكة.
 *
 * `linkedUserId` يُملأ حين يقبل الشخص دعوة البوابة، فيربط جهة الاتصال
 * الورقية بحساب حقيقي دون أن يفرض وجوده.
 */
export const partnerContacts = pgTable(
  'partner_contacts',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),

    fullNameAr: varchar('full_name_ar', { length: 160 }).notNull(),
    jobTitleAr: varchar('job_title_ar', { length: 160 }),
    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 32 }),

    isPrimary: boolean('is_primary').default(false).notNull(),
    status: contactStatus('status').default('ACTIVE').notNull(),
    notesAr: text('notes_ar'),

    linkedUserId: uuidColumn('linked_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    // جهة اتصال رئيسية نشطة واحدة لكل شريك — شرط من شروط التفعيل.
    uniqueIndex('partner_contacts_primary_unique')
      .on(table.partnerId)
      .where(sql`${table.isPrimary} and ${table.status} = 'ACTIVE'`),
    index('partner_contacts_partner_idx').on(table.partnerId),
    check(
      'partner_contacts_email_lowercase',
      sql`${table.email} is null or ${table.email} = lower(${table.email})`,
    ),
    // جهة اتصال بلا بريد ولا هاتف لا يمكن التواصل معها.
    check(
      'partner_contacts_reachable',
      sql`${table.email} is not null or ${table.phone} is not null`,
    ),
  ],
)

/**
 * سجل الموافقة على الإظهار — إضافي فقط.
 *
 * السحب حدث جديد لا تعديل للسابق: الجهة قد تمنح ثم تسحب ثم تمنح، ويجب
 * أن يبقى التسلسل كاملًا لأنه إثبات قانوني لما كان معلنًا ومتى.
 */
export const partnerConsentEvents = pgTable(
  'partner_consent_events',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),

    consentType: consentType('consent_type').notNull(),
    action: consentAction('action').notNull(),
    source: consentSource('source').notNull(),

    actedAt: tsColumn('acted_at').notNull(),
    actorUserId: uuidColumn('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** اسم من منح أو سحب من طرف الجهة، لقطة نصية تبقى بعد تغيّره. */
    actorNameAr: varchar('actor_name_ar', { length: 160 }),
    noteAr: text('note_ar'),

    ...createdAtOnly,
  },
  (table) => [
    index('partner_consent_events_partner_idx').on(
      table.partnerId,
      table.actedAt,
    ),
  ],
)

/** سجل المتابعة: مكالمة، اجتماع، ملاحظة، أو تغيّر مرحلة مسجَّل تلقائيًا. */
export const partnerInteractions = pgTable(
  'partner_interactions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),

    kind: interactionKind('kind').notNull(),
    occurredAt: tsColumn('occurred_at').notNull(),
    summaryAr: varchar('summary_ar', { length: 300 }).notNull(),
    bodyAr: text('body_ar'),

    recordedById: uuidColumn('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** يُعرض للشريك في «سجل نشاطه». الافتراضي داخلي. */
    partnerVisible: boolean('partner_visible').default(false).notNull(),

    ...timestamps,
  },
  (table) => [
    index('partner_interactions_partner_idx').on(
      table.partnerId,
      table.occurredAt,
    ),
  ],
)

/**
 * عضوية ممثل الشريك في جهته.
 *
 * جدول مستقل عن `memberships` لأن الطرف الآخر مختلف كليًا (جهة لا مكتب)
 * وحراسه مختلفة. والفهرس الجزئي يحصر المستخدم بجهة نشطة واحدة: تمثيل
 * جهتين يجعل نطاق العزل ملتبسًا، وأي التباس في العزل ثغرة.
 */
export const partnerMemberships = pgTable(
  'partner_memberships',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    userId: uuidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    roleId: uuidColumn('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    status: membershipStatus('status').default('ACTIVE').notNull(),
    startedAt: tsColumn('started_at').defaultNow().notNull(),
    endedAt: tsColumn('ended_at'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('partner_memberships_active_user_unique')
      .on(table.userId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('partner_memberships_partner_idx').on(table.partnerId),
    check(
      'partner_memberships_ended_consistency',
      sql`(${table.status} = 'ACTIVE' and ${table.endedAt} is null)
          or (${table.status} = 'ENDED' and ${table.endedAt} is not null)`,
    ),
  ],
)

/**
 * أشكال العمل الإعلامي التي تعمل بها الجهة.
 *
 * جدول ربط خاص بالشركاء لا جدول متعدد الأشكال مشترك مع الأشخاص: المفتاح
 * الأجنبي هنا حقيقي يحرسه المحرّك، وعمود `owner_type` نصّي كان سيحوّل
 * الحراسة إلى شرط في الكود ينساه أول من يكتب استعلامًا مباشرًا.
 */
export const partnerMediaChannels = pgTable(
  'partner_media_channels',
  {
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    channelId: uuidColumn('channel_id')
      .notNull()
      .references(() => mediaChannels.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.partnerId, table.channelId] }),
    index('partner_media_channels_channel_idx').on(table.channelId),
  ],
)

export type Partner = typeof partners.$inferSelect
export type NewPartner = typeof partners.$inferInsert
export type PartnerPartnership = typeof partnerPartnerships.$inferSelect
export type PartnerContact = typeof partnerContacts.$inferSelect
export type PartnerConsentEvent = typeof partnerConsentEvents.$inferSelect
export type PartnerInteraction = typeof partnerInteractions.$inferSelect
export type PartnerMembership = typeof partnerMemberships.$inferSelect
