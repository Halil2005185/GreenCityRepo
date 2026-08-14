import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import { acknowledgementMethod } from './enums.js'
import { users } from './identity.js'
import { partnerContacts, partners } from './partners.js'

/**
 * إصدارات ميثاق المدن الخضراء.
 *
 * المبادئ والالتزامات مصفوفات نصية لا جداول: تُقرأ وتُعرض ككتلة واحدة،
 * ولا يُشار إلى مبدأ منفرد من أي مكان آخر. تعدّد الإصدارات هو ما يهم،
 * لأن الإقرار يجب أن يشير إلى ما وقّعت عليه الجهة بالضبط.
 */
export const charterVersions = pgTable(
  'charter_versions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    version: varchar('version', { length: 20 }).notNull(),
    titleAr: varchar('title_ar', { length: 200 }).notNull(),
    summaryAr: text('summary_ar'),
    bodyAr: text('body_ar').notNull(),

    principlesAr: text('principles_ar')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    commitmentsAr: text('commitments_ar')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    effectiveFrom: tsColumn('effective_from'),
    publishedAt: tsColumn('published_at'),
    publishedById: uuidColumn('published_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('charter_versions_version_unique').on(table.version),
    // إصدار منشور واحد يمثل «الحالي»: الأحدث نشرًا. الفهرس يخدم هذا الترتيب.
    index('charter_versions_published_idx').on(table.publishedAt),
    check(
      'charter_versions_published_consistency',
      sql`(${table.publishedAt} is null) = (${table.publishedById} is null)`,
    ),
  ],
)

/**
 * إقرار جهة بإصدار محدد من الميثاق — سجل إضافي فقط لا يُعدَّل ولا يُحذف.
 *
 * `acknowledgedAt` منفصل عن `createdAt` عمدًا: الإقرار قد يكون حدث في
 * اجتماع أو على ورق قبل تسجيله في النظام، فيُحفظ تاريخه الحقيقي مع
 * تاريخ التسجيل.
 *
 * أسماء المُقِرّ ومنصبه لقطة نصية لا مرجع وحده: تغيّر جهة الاتصال أو
 * خروجها من الجهة يجب ألا يمحو من أقرّ فعلًا.
 */
export const charterAcknowledgements = pgTable(
  'charter_acknowledgements',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    partnerId: uuidColumn('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    charterVersionId: uuidColumn('charter_version_id')
      .notNull()
      .references(() => charterVersions.id, { onDelete: 'restrict' }),

    acknowledgedAt: tsColumn('acknowledged_at').notNull(),
    method: acknowledgementMethod('method').notNull(),

    acknowledgedByContactId: uuidColumn(
      'acknowledged_by_contact_id',
    ).references(() => partnerContacts.id, { onDelete: 'set null' }),
    acknowledgedByNameAr: varchar('acknowledged_by_name_ar', {
      length: 160,
    }).notNull(),
    acknowledgedByTitleAr: varchar('acknowledged_by_title_ar', { length: 160 }),

    recordedById: uuidColumn('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    noteAr: text('note_ar'),

    ...createdAtOnly,
  },
  (table) => [
    index('charter_acknowledgements_partner_idx').on(
      table.partnerId,
      table.acknowledgedAt,
    ),
    index('charter_acknowledgements_version_idx').on(table.charterVersionId),
  ],
)

export type CharterVersion = typeof charterVersions.$inferSelect
export type NewCharterVersion = typeof charterVersions.$inferInsert
export type CharterAcknowledgement =
  typeof charterAcknowledgements.$inferSelect
export type NewCharterAcknowledgement =
  typeof charterAcknowledgements.$inferInsert
