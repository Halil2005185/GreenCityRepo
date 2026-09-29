import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  index,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import {
  invitationStatus,
  membershipStatus,
  overrideEffect,
  userKind,
} from './enums.js'
import { users } from './identity.js'
import { offices, roles } from './org.js'
import { partners } from './partners.js'

/**
 * عضوية موظف في مكتب بدور محدد.
 *
 * تعدد العضويات مقصود: مسؤول القسم التقني «يوفر البنية الرقمية والدعم لجميع
 * الأقسام» حسب محضر 02-08، وقد يحمل عضوية في أكثر من مكتب. `isPrimary`
 * يحدد المكتب الافتراضي في الواجهة.
 *
 * عضو بلا منصب قيادي مدعوم: يُسند إليه دور بقدرات محدودة ضمن مكتبه — آية
 * عجوم ولينا الصالح حضرتا الاجتماع دون منصب في جدول الأدوار.
 *
 * ربط ممثلي الشركاء يأتي في المرحلة الثانية مع جدول `partners`؛ هذا الجدول
 * للموظفين وحدهم، ولذلك `officeId` إلزامي.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    userId: uuidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    officeId: uuidColumn('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'restrict' }),
    roleId: uuidColumn('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').default(false).notNull(),
    status: membershipStatus('status').default('ACTIVE').notNull(),
    startedAt: tsColumn('started_at').defaultNow().notNull(),
    endedAt: tsColumn('ended_at'),
    ...timestamps,
  },
  (table) => [
    // عضوية نشطة واحدة لكل مستخدم في المكتب الواحد؛ المنتهية تتراكم كتاريخ.
    uniqueIndex('memberships_active_unique')
      .on(table.userId, table.officeId)
      .where(sql`${table.status} = 'ACTIVE'`),
    // مكتب رئيسي واحد فقط لكل مستخدم.
    uniqueIndex('memberships_primary_unique')
      .on(table.userId)
      .where(sql`${table.isPrimary} and ${table.status} = 'ACTIVE'`),
    index('memberships_user_idx').on(table.userId),
    index('memberships_office_idx').on(table.officeId),
    check(
      'memberships_ended_consistency',
      sql`(${table.status} = 'ACTIVE' and ${table.endedAt} is null)
          or (${table.status} = 'ENDED' and ${table.endedAt} is not null)`,
    ),
  ],
)

/**
 * الدعوة هي المدخل الوحيد لإنشاء حساب. لا تسجيل عام في أي من المسارين.
 *
 * الرمز مُجزَّأ بـ SHA-256؛ النص الصريح يُرسل بالبريد ولا يُحفظ. من يقرأ
 * القاعدة لا يستطيع انتحال دعوة.
 *
 * حقول القرار (`roleId`, `officeId`) تُثبَّت وقت الإرسال لا وقت القبول،
 * حتى لا يغيّر تعديلٌ لاحق على الأدوار ما وافق عليه المدير العام.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    kind: userKind('kind').notNull(),
    fullNameAr: varchar('full_name_ar', { length: 160 }),

    roleId: uuidColumn('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    officeId: uuidColumn('office_id').references(() => offices.id, {
      onDelete: 'restrict',
    }),
    /** الجهة التي سيمثلها المدعوّ. إلزامي لدعوات الشركاء، ممنوع لغيرها. */
    partnerId: uuidColumn('partner_id').references(() => partners.id, {
      onDelete: 'cascade',
    }),

    tokenHash: char('token_hash', { length: 64 }).notNull(),
    status: invitationStatus('status').default('PENDING').notNull(),
    expiresAt: tsColumn('expires_at').notNull(),

    invitedById: uuidColumn('invited_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedAt: tsColumn('accepted_at'),
    acceptedUserId: uuidColumn('accepted_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: tsColumn('revoked_at'),
    revokedById: uuidColumn('revoked_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('invitations_token_hash_unique').on(table.tokenHash),
    // دعوة معلّقة واحدة لكل بريد: إعادة الإرسال تُبطل السابقة.
    uniqueIndex('invitations_pending_email_unique')
      .on(table.email)
      .where(sql`${table.status} = 'PENDING'`),
    index('invitations_status_idx').on(table.status),
    index('invitations_expires_idx').on(table.expiresAt),
    check(
      'invitations_email_lowercase',
      sql`${table.email} = lower(${table.email})`,
    ),
    // دعوة موظف بلا مكتب لا معنى لها، وممثل شريك بلا جهة لا يُعزل نطاقه.
    check(
      'invitations_target_matches_kind',
      sql`(${table.kind} = 'STAFF'
             and ${table.officeId} is not null
             and ${table.partnerId} is null)
          or (${table.kind} = 'PARTNER'
             and ${table.partnerId} is not null
             and ${table.officeId} is null)`,
    ),
    check(
      'invitations_accepted_consistency',
      sql`(${table.status} <> 'ACCEPTED')
          or (${table.acceptedAt} is not null and ${table.acceptedUserId} is not null)`,
    ),
  ],
)

/**
 * عضوية ثانية اختيارية تُثبَّت وقت الدعوة إلى جانب `invitations.officeId`/
 * `roleId` الرئيسيين — قسم «صلاحيات الأعضاء» في نافذة الدعوة. القبول
 * يحوّل هذا الصف إلى عضوية غير رئيسية (`isPrimary: false`) بجانب
 * العضوية الرئيسية، لا بدلًا منها.
 *
 * صف واحد فقط لكل دعوة اليوم (الواجهة تعرض قسمًا إضافيًا واحدًا)، لكن
 * الجدول يحتمل أكثر دون تعديل بنيته لاحقًا.
 */
export const invitationOfficeRoles = pgTable(
  'invitation_office_roles',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    invitationId: uuidColumn('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    officeId: uuidColumn('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'restrict' }),
    roleId: uuidColumn('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    ...createdAtOnly,
  },
  (table) => [
    // لا يتكرر المكتب نفسه في العضوية الإضافية لدعوة واحدة.
    uniqueIndex('invitation_office_roles_unique').on(
      table.invitationId,
      table.officeId,
    ),
    index('invitation_office_roles_invitation_idx').on(table.invitationId),
  ],
)

/**
 * استثناءات فردية على حزمة الدور، لكل عضوية على حدة: مساعد مدير الفريق
 * يُنزع منه بعض ما يحمله دوره، أو عضو يُعطى قدرة واحدة دون دور أوسع.
 *
 * الاستثناء تعديل على منصب في فريق بعينه، لا على الشخص: يسقط مع العضوية
 * (`cascade`)، ويُمسح حين يتغيّر دورها أو مكتبها.
 */
export const membershipCapabilityOverrides = pgTable(
  'membership_capability_overrides',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    membershipId: uuidColumn('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    capability: varchar('capability', { length: 64 }).notNull(),
    effect: overrideEffect('effect').notNull(),
    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...createdAtOnly,
  },
  (table) => [
    // قدرة واحدة إما ممنوحة أو منزوعة في العضوية الواحدة، لا الاثنان.
    uniqueIndex('membership_capability_overrides_unique').on(
      table.membershipId,
      table.capability,
    ),
  ],
)

export type Membership = typeof memberships.$inferSelect
export type NewMembership = typeof memberships.$inferInsert
export type Invitation = typeof invitations.$inferSelect
export type NewInvitation = typeof invitations.$inferInsert
export type InvitationOfficeRole = typeof invitationOfficeRoles.$inferSelect
export type NewInvitationOfficeRole = typeof invitationOfficeRoles.$inferInsert
export type MembershipCapabilityOverride =
  typeof membershipCapabilityOverrides.$inferSelect
