import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps, tsColumn, uuidColumn } from './columns.js'
import { users } from './identity.js'
import { initiativeSites, initiatives } from './programs.js'

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

export type FieldGroup = typeof fieldGroups.$inferSelect
export type NewFieldGroup = typeof fieldGroups.$inferInsert
