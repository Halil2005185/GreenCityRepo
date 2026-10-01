import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps, uuidColumn } from './columns.js'

/**
 * تعريفات النظام — مفردات التصنيف التي تُختار من قوائم منسدلة: نوع الجهة،
 * أشكال الدعم، أولوية التواصل، شكل العمل الإعلامي…
 *
 * جدولان عامّان بدل جدول لكل مفردة. كانت مرجعيتا العلاقات (أشكال العمل
 * الإعلامي وأنواع العلاقة) جدولين بالشكل نفسه تمامًا، وكانت بقية المفردات
 * enums في الكود فكل كلمة جديدة migration. الحالات خارج هذا كله: الكود
 * يتفرّع عليها فتبقى enums، وهو الحد الثالث في PLAN.md.
 *
 * التعريف لا يُنشأ من اللوحة. وجوده عقد مع عمود في جدول ما، فيُسجَّل في
 * `lookups.registry.ts` مع أعمدته؛ والقاعدة تملك اسمه وقيمه بعد إنشائه.
 * الرمز `code` هو ما يربط الشاشة بالتعريف — `ORGANIZATION_KIND` — لا اسم
 * الشاشة ولا مكان القائمة فيها، فشاشتان بالرمز نفسه تقرآن القيم نفسها.
 */
export const lookupLists = pgTable(
  'lookup_lists',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    /** ثابت بعد الإنشاء: الشاشات والأعمدة تشير إليه. */
    code: varchar('code', { length: 64 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    descriptionAr: text('description_ar'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('lookup_lists_code_unique').on(table.code),
    check('lookup_lists_code_format', sql`${table.code} ~ '^[A-Z][A-Z0-9_]*$'`),
  ],
)

/**
 * قيمة في تعريف. الجداول تشير إليها بمعرّفها لا برمزها، بمفتاح أجنبي
 * `restrict`: القاعدة نفسها ترفض حذف قيمة صُنّف بها سجل، ولو أخطأ الكود.
 *
 * الرمز ثابت مثل رمز التعريف. القيم المنقولة من enums احتفظت بقيمة الـenum
 * رمزًا لها (`COMPANY`، `STAGE_CHANGE`)، وعليه قام ترحيل البيانات، ومنه
 * يجد الكود القيم القليلة التي يكتبها بنفسه.
 */
export const lookupValues = pgTable(
  'lookup_values',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    listId: uuidColumn('list_id')
      .notNull()
      .references(() => lookupLists.id, { onDelete: 'restrict' }),

    code: varchar('code', { length: 64 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),

    displayOrder: integer('display_order').default(0).notNull(),
    /**
     * التعطيل لا الحذف: قيمة توقّف استعمالها تبقى على ما صُنّف بها، وتختفي
     * من قوائم الاختيار وحدها. الحذف لقيمة لم يُصنَّف بها شيء قط.
     */
    isActive: boolean('is_active').default(true).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('lookup_values_code_unique').on(table.listId, table.code),
    index('lookup_values_order_idx').on(table.listId, table.displayOrder),
    check('lookup_values_code_format', sql`${table.code} ~ '^[A-Z][A-Z0-9_]*$'`),
  ],
)

export type LookupList = typeof lookupLists.$inferSelect
export type LookupValue = typeof lookupValues.$inferSelect
export type NewLookupValue = typeof lookupValues.$inferInsert
