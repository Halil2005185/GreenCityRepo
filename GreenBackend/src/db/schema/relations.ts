import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps, uuidColumn } from './columns.js'

/**
 * مرجعيات مكتب العلاقات — صفوف لا enums.
 *
 * أنواع الشراكة الخمس نصّ الميثاق فبقيت في الكود، أما «بأي شكل إعلامي
 * يعمل هذا الشخص» و«ما طبيعة علاقتنا به» فمفردات يكتبها المكتب من
 * تجربته وتنمو مع كل تواصل جديد. حصرها في enum يجعل كل مفردة migration،
 * وهو ما يمنعه «نموذج البيانات الديناميكي» في PLAN.md.
 */

/**
 * شكل العمل الإعلامي: سؤال شارع، ريبورتاج، بودكاست، تصوير…
 *
 * هو المحور الذي طلبه المكتب للتصنيف: «كرمال يتصنف كل حدا بشغلته بكون
 * أسهل علينا وقت التواصل». يُسند إلى الأشخاص والجهات معًا، فقناة تلفزيونية
 * شريكة تحمل الشكل نفسه الذي يحمله مراسل مستقل.
 */
export const mediaChannels = pgTable(
  'media_channels',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 80 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),

    displayOrder: integer('display_order').default(0).notNull(),
    /**
     * التعطيل لا الحذف: شكل توقّفنا عن استعماله يبقى مربوطًا بمن صُنّف
     * به، فيُخفى من قوائم الاختيار ولا يمحو تصنيفًا سابقًا.
     */
    isActive: boolean('is_active').default(true).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('media_channels_slug_unique').on(table.slug),
    index('media_channels_order_idx').on(table.displayOrder),
  ],
)

/**
 * طبيعة العلاقة: تعاون تطوعي، تغطية إعلامية، تبادل منفعة…
 *
 * غير `partnership_type`: ذاك صفة الجهة في الميثاق («شريك تنفيذي»)،
 * وهذا كيف تجري العلاقة عمليًا. جهة قد تكون «شريكًا إعلاميًا» بعلاقة
 * «تبادل منفعة»، والوصفان صحيحان معًا.
 */
export const relationshipTypes = pgTable(
  'relationship_types',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 80 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),

    displayOrder: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('relationship_types_slug_unique').on(table.slug),
    index('relationship_types_order_idx').on(table.displayOrder),
  ],
)

export type MediaChannel = typeof mediaChannels.$inferSelect
export type NewMediaChannel = typeof mediaChannels.$inferInsert
export type RelationshipType = typeof relationshipTypes.$inferSelect
export type NewRelationshipType = typeof relationshipTypes.$inferInsert
