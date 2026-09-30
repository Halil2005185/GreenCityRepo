import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import { fieldAnnouncementAudience, outboxStatus } from './enums.js'
import { fieldGroups, participants } from './field.js'
import { users } from './identity.js'
import { initiatives } from './programs.js'

/**
 * إعلان المنسّق لميدان المبادرة: «تغيّر الموعد إلى التاسعة»، «اللقاء عند
 * البوابة الشرقية لا الغربية».
 *
 * الإعلان محتوى في التطبيق قبل أن يكون إشعارًا: يظهر في ورقة القائد وبطاقة
 * المتطوع لكل من يفتحهما، والإشعار وسيلة إيصال لمن فعّله. من رفض الإذن أو
 * لم يثبّت التطبيق على iOS يقرأ الإعلان حين يفتح بطاقته.
 *
 * `groupId` فارغ = كل مجموعات المبادرة.
 */
export const fieldAnnouncements = pgTable(
  'field_announcements',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),
    groupId: uuidColumn('group_id').references(() => fieldGroups.id, {
      onDelete: 'cascade',
    }),

    audience: fieldAnnouncementAudience('audience').default('ALL').notNull(),
    titleAr: varchar('title_ar', { length: 120 }).notNull(),
    bodyAr: varchar('body_ar', { length: 600 }).notNull(),

    /** كم جهازًا استُهدف بالإشعار ساعة الإعلان. ما وصل يُعدّ من الطابور. */
    targetedDevices: integer('targeted_devices').default(0).notNull(),

    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...createdAtOnly,
  },
  (table) => [
    index('field_announcements_initiative_idx').on(
      table.initiativeId,
      table.createdAt,
    ),
    index('field_announcements_group_idx').on(table.groupId),
  ],
)

/**
 * اشتراك جهاز في الإشعارات — ما يعطيه المتصفح حين يأذن صاحبه.
 *
 * صاحبه عضو فريق أو مشارك، واحد منهما. واشتراك المشارك نطاقه مبادرة رابطه
 * كبطاقته: إعلان حملة أخرى لا يصل هاتفًا فُتح عليه رابط هذه.
 *
 * `endpoint` فريد: الجهاز الواحد اشتراك واحد، ومن دخل بعد غيره على الهاتف
 * نفسه يأخذ الاشتراك ولا يبقى لمن سبقه.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),

    userId: uuidColumn('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    participantId: uuidColumn('participant_id').references(
      () => participants.id,
      { onDelete: 'cascade' },
    ),
    initiativeId: uuidColumn('initiative_id').references(() => initiatives.id, {
      onDelete: 'cascade',
    }),

    endpoint: text('endpoint').notNull(),
    p256dh: varchar('p256dh', { length: 200 }).notNull(),
    auth: varchar('auth', { length: 100 }).notNull(),
    userAgent: varchar('user_agent', { length: 300 }),

    lastSuccessAt: tsColumn('last_success_at'),
    lastFailureAt: tsColumn('last_failure_at'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
    index('push_subscriptions_user_idx').on(table.userId),
    index('push_subscriptions_participant_idx').on(
      table.participantId,
      table.initiativeId,
    ),
    check(
      'push_subscriptions_single_owner',
      sql`num_nonnulls(${table.userId}, ${table.participantId}) = 1`,
    ),
    check(
      'push_subscriptions_participant_scope',
      sql`(${table.participantId} is null) = (${table.initiativeId} is null)`,
    ),
    // خدمات الإشعار كلها على HTTPS؛ غيره ليس اشتراكًا.
    check(
      'push_subscriptions_endpoint_https',
      sql`${table.endpoint} like 'https://%'`,
    ),
  ],
)

/**
 * طابور الإشعارات — كصندوق البريد الصادر، ولسببه: يُدرج في معاملة الإعلان
 * نفسها ويرسله العامل، فبطء خدمة الإشعار لا يشغل طلب المنسّق، وانهيار بين
 * الإعلان والإرسال لا يُضيّع إشعارًا.
 *
 * الاشتراك يُحذف حين تقول خدمته إنه زال (404 أو 410)، والمهمة تبقى بلا
 * صاحب: «استُهدف ولم يصل» خبرٌ يُعدّ في اللوحة.
 */
export const pushJobs = pgTable(
  'push_jobs',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    subscriptionId: uuidColumn('subscription_id').references(
      () => pushSubscriptions.id,
      { onDelete: 'set null' },
    ),
    announcementId: uuidColumn('announcement_id').references(
      () => fieldAnnouncements.id,
      { onDelete: 'cascade' },
    ),

    payload: jsonb('payload')
      .$type<{ title: string; body: string; url: string; tag: string }>()
      .notNull(),

    status: outboxStatus('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: tsColumn('available_at').defaultNow().notNull(),
    /** بعده لا يُرسَل: «تغيّر الموعد» يصل بعد الموعد ضجيجٌ لا خبر. */
    expiresAt: tsColumn('expires_at').notNull(),

    lastError: text('last_error'),
    sentAt: tsColumn('sent_at'),

    ...timestamps,
  },
  (table) => [
    index('push_jobs_claim_idx').on(table.status, table.availableAt),
    index('push_jobs_announcement_idx').on(table.announcementId, table.status),
    check(
      'push_jobs_sent_consistency',
      sql`(${table.status} = 'SENT') = (${table.sentAt} is not null)`,
    ),
  ],
)

export type FieldAnnouncement = typeof fieldAnnouncements.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type PushJob = typeof pushJobs.$inferSelect
