import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
import { roleScope } from './enums.js'

/**
 * المكاتب — بيانات لا enum.
 *
 * الهيكل نما فعلًا بين ملف GCT ومحضر 02-08: ظهر «قسما الهندسات والتنفيذ»
 * تحت مكتب العمليات. لذلك الجدول ذاتي المرجعية، وإضافة مكتب أو قسم فرعي
 * لاحقًا إدخال صف لا migration.
 */
export const offices = pgTable(
  'offices',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    parentId: uuidColumn('parent_id').references((): AnyPgColumn => offices.id, {
      onDelete: 'restrict',
    }),
    slug: varchar('slug', { length: 64 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),
    displayOrder: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('offices_slug_unique').on(table.slug),
    index('offices_parent_idx').on(table.parentId),
    check('offices_no_self_parent', sql`${table.parentId} <> ${table.id}`),
  ],
)

/**
 * الأدوار — بيانات لا enum، بحزمة قدرات.
 *
 * القدرات نفسها ثابتة في الكود (`src/modules/access/capabilities.ts`) لأن
 * الحراس تفحصها بالاسم؛ أما توزيعها على الأدوار فقرار تنظيمي متغير.
 * `isSystem` يمنع حذف الأدوار التي يعتمد عليها التشغيل.
 */
export const roles = pgTable(
  'roles',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 64 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),
    scope: roleScope('scope').notNull(),
    capabilities: text('capabilities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isSystem: boolean('is_system').default(false).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('roles_slug_unique').on(table.slug),
    index('roles_scope_idx').on(table.scope),
  ],
)

export type Office = typeof offices.$inferSelect
export type NewOffice = typeof offices.$inferInsert
export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
