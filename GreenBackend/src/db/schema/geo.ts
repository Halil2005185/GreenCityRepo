import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps, uuidColumn } from './columns.js'
import { areaLevel } from './enums.js'

/**
 * التسلسل الجغرافي كاملًا في جدول واحد ذاتي المرجعية.
 *
 * البديل — جدول للمحافظات وآخر للمدن وثالث للمناطق — يجعل كل عمق جديد
 * migration وجدولًا وكودًا، بينما المشروع يحتاج المحافظة اليوم والحي غدًا
 * (مبادرة معالجة تربة تُحدَّد على مستوى قطعة، لا مدينة).
 *
 * `path` مسار مادّي من الـslugs مفصولة بشرطة مائلة، يُبنى في الخدمة عند
 * الإدراج. سببه أن استعلام «كل ما تحت دمشق» بلا مسار يحتاج تعاودًا في كل
 * قراءة، ومعه يصير `path like 'sy-di/%'` — فهرس واحد يخدمه.
 */
export const areas = pgTable(
  'areas',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    parentId: uuidColumn('parent_id').references((): AnyPgColumn => areas.id, {
      onDelete: 'restrict',
    }),

    slug: varchar('slug', { length: 80 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    level: areaLevel('level').notNull(),

    /** عمق الصف: 0 للمحافظة. يُشتق من الأب ويُحفظ لتفادي التعاود. */
    depth: integer('depth').default(0).notNull(),
    path: text('path').notNull(),

    /** مركز تقريبي للتقريب على الخريطة حين لا يوجد موقع محدد. */
    centerLat: numeric('center_lat', { precision: 9, scale: 6 }),
    centerLng: numeric('center_lng', { precision: 9, scale: 6 }),

    /**
     * حدود المنطقة كـGeoJSON، تُستعمل لتلوين المنطقة عند مرور الماوس
     * وللتقريب عند النقر. النقطة وحدها لا تُلوَّن ولا تُنقر كمساحة.
     *
     * `jsonb` لا نوع جغرافي: لا نحتاج استعلامات مكانية (احتواء، تقاطع،
     * مسافة) بعد، وإدخال PostGIS لأجل الرسم وحده كلفة بلا مقابل.
     * الانتقال إليه لاحقًا تحويل عمود لا إعادة تصميم.
     */
    boundary: jsonb('boundary').$type<Record<string, unknown>>(),

    isActive: boolean('is_active').default(true).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    // الـslug فريد بين الأشقاء لا عالميًا: «المزة» قد تتكرر في محافظتين.
    uniqueIndex('areas_sibling_slug_unique').on(table.parentId, table.slug),
    uniqueIndex('areas_path_unique').on(table.path),
    index('areas_parent_idx').on(table.parentId),
    index('areas_level_idx').on(table.level),
    check('areas_no_self_parent', sql`${table.parentId} <> ${table.id}`),
    // محافظة بلا أب، وما دونها لا بد له من أب.
    check(
      'areas_root_is_governorate',
      sql`(${table.parentId} is null and ${table.level} = 'GOVERNORATE')
          or (${table.parentId} is not null and ${table.level} <> 'GOVERNORATE')`,
    ),
    check(
      'areas_coordinates_paired',
      sql`(${table.centerLat} is null) = (${table.centerLng} is null)`,
    ),
  ],
)

export type Area = typeof areas.$inferSelect
export type NewArea = typeof areas.$inferInsert
