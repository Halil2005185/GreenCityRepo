import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  char,
  check,
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  createdAtOnly,
  timestamps,
  tsColumn,
  uuidColumn,
} from './columns.js'
import {
  sessionRevokeReason,
  tokenPurpose,
  userKind,
  userStatus,
} from './enums.js'

/**
 * لا يوجد تسجيل عام. صف المستخدم يُنشأ فقط عند قبول دعوة، لذلك
 * `passwordHash` إلزامي — لا توجد حسابات بلا كلمة مرور.
 *
 * `tokenVersion` هو مفتاح الإبطال الفوري: رفعه يُسقط كل رموز الوصول
 * الحالية دون انتظار انتهاء مدتها ودون قراءة الجلسات.
 */
export const users = pgTable(
  'users',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullNameAr: varchar('full_name_ar', { length: 160 }).notNull(),
    fullNameEn: varchar('full_name_en', { length: 160 }),
    phone: varchar('phone', { length: 32 }),
    kind: userKind('kind').notNull(),
    status: userStatus('status').default('ACTIVE').notNull(),
    jobTitleAr: varchar('job_title_ar', { length: 160 }),

    emailVerifiedAt: tsColumn('email_verified_at'),
    passwordChangedAt: tsColumn('password_changed_at').defaultNow().notNull(),
    tokenVersion: integer('token_version').default(0).notNull(),

    failedLoginCount: integer('failed_login_count').default(0).notNull(),
    lockedUntil: tsColumn('locked_until'),
    lastLoginAt: tsColumn('last_login_at'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    index('users_kind_status_idx').on(table.kind, table.status),
    // التطبيع في الكود وحده يكفي حتى يخطئ أحدهم؛ القاعدة تحرسه أيضًا.
    check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
  ],
)

/**
 * جلسة = رمز تحديث واحد. التدوير يُبطل الصف الحالي وينشئ صفًا جديدًا
 * بنفس `familyId`.
 *
 * كشف إعادة الاستعمال: تقديم رمز مُدوَّر سابقًا يعني أن نسخة منه سُرقت،
 * فتُبطل العائلة كاملة لا الصف وحده.
 *
 * يُخزَّن SHA-256 للرمز لا الرمز نفسه: تسريب القاعدة لا يمنح جلسات.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    userId: uuidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuidColumn('family_id').notNull(),
    refreshTokenHash: char('refresh_token_hash', { length: 64 }).notNull(),

    userAgent: varchar('user_agent', { length: 400 }),
    ipAddress: varchar('ip_address', { length: 64 }),

    expiresAt: tsColumn('expires_at').notNull(),
    lastUsedAt: tsColumn('last_used_at'),
    revokedAt: tsColumn('revoked_at'),
    revokeReason: sessionRevokeReason('revoke_reason'),
    replacedById: uuidColumn('replaced_by_id').references(
      (): AnyPgColumn => sessions.id,
      { onDelete: 'set null' },
    ),

    ...createdAtOnly,
  },
  (table) => [
    uniqueIndex('sessions_refresh_token_hash_unique').on(table.refreshTokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_family_idx').on(table.familyId),
    // يخدم مهمة تنظيف الجلسات المنتهية.
    index('sessions_expires_idx').on(table.expiresAt),
    check(
      'sessions_revoked_consistency',
      sql`(${table.revokedAt} is null) = (${table.revokeReason} is null)`,
    ),
  ],
)

/**
 * رموز استعادة كلمة المرور وتأكيد البريد. تُخزَّن مُجزّأة، وتُستهلك مرة واحدة.
 * لا تُحذف بعد الاستهلاك حتى يبقى أثرها في التدقيق؛ التنظيف مهمة دورية.
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    userId: uuidColumn('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose('purpose').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: tsColumn('expires_at').notNull(),
    consumedAt: tsColumn('consumed_at'),
    requestedIp: varchar('requested_ip', { length: 64 }),
    ...createdAtOnly,
  },
  (table) => [
    uniqueIndex('verification_tokens_hash_unique').on(table.tokenHash),
    // رمز فعّال واحد لكل مستخدم وغرض: طلب جديد يُبطل ما قبله.
    uniqueIndex('verification_tokens_active_unique')
      .on(table.userId, table.purpose)
      .where(sql`${table.consumedAt} is null`),
    index('verification_tokens_expires_idx').on(table.expiresAt),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert
