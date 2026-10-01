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
 * مرجعيتا مكتب العلاقات قبل «تعريفات النظام» — لا يقرؤهما الكود ولا يكتبهما.
 *
 * نُقلت صفوفهما إلى `lookup_values` تحت التعريفين `MEDIA_CHANNEL` و
 * `RELATIONSHIP_TYPE` **بمعرّفاتها نفسها**، فما أشار إليها بقي يشير إلى
 * الصف نفسه وتغيّر هدف المفتاح الأجنبي وحده. يبقى الجدولان إصدارًا واحدًا
 * شاهدَين على الترحيل مع أعمدة الـenums القديمة، ثم يُحذفان معها.
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
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('media_channels_slug_unique').on(table.slug),
    index('media_channels_order_idx').on(table.displayOrder),
  ],
)

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
