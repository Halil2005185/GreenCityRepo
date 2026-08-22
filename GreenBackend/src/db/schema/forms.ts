import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  formConditionOp,
  formFieldType,
  formVersionStatus,
} from './enums.js'
import { users } from './identity.js'
import { offices } from './org.js'
import { timestamps, tsColumn, uuidColumn } from './columns.js'

/**
 * استمارة قابلة للنشر — «الانضمام العام» صف، ونموذج مكتب بعينه صف ثانٍ.
 *
 * الحدود الأربعة في PLAN.md جزء من العقد لا توصية: هذه الجداول لا تكتب
 * في أي كيان أساسي، والجسر الوحيد إلى `users` قرار بشري يُنشئ دعوة.
 */
export const forms = pgTable(
  'forms',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 80 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    descriptionAr: text('description_ar'),

    /** المكتب المسؤول عن فرز طلبات هذه الاستمارة. */
    officeId: uuidColumn('office_id').references(() => offices.id, {
      onDelete: 'restrict',
    }),

    /**
     * الاستقبال قرار مستقل عن النشر: استمارة منشورة قد تُغلق موسمًا ثم
     * تُفتح دون إصدار جديد. الأول حالة تشغيل، والثاني حالة محتوى.
     */
    isAccepting: boolean('is_accepting').default(false).notNull(),

    createdById: uuidColumn('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('forms_slug_unique').on(table.slug),
    index('forms_office_idx').on(table.officeId),
  ],
)

/**
 * إصدار من الاستمارة. المنشور **مجمَّد**: أسئلته لا تُعدَّل ولا تُحذف.
 *
 * السبب أن طلبًا قُدّم في آذار يجب أن يبقى مقروءًا مقابل الأسئلة كما
 * سُئلت يومها. تعديل منشور يجعل إجابة «نعم» على سؤال محذوف بلا معنى،
 * ويحوّل أرشيف الطلبات إلى بيانات لا تُفسَّر. النمط نفسه في
 * `charter_versions`.
 */
export const formVersions = pgTable(
  'form_versions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    formId: uuidColumn('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),
    status: formVersionStatus('status').default('DRAFT').notNull(),

    publishedAt: tsColumn('published_at'),
    publishedById: uuidColumn('published_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('form_versions_number_unique').on(table.formId, table.version),
    // مسوّدة واحدة قيد التحرير لكل استمارة؛ المنشورة تتراكم كتاريخ.
    uniqueIndex('form_versions_single_draft')
      .on(table.formId)
      .where(sql`${table.status} = 'DRAFT'`),
    // إصدار منشور واحد لكل استمارة؛ السابق يُؤرشَف عند نشر التالي.
    uniqueIndex('form_versions_single_published')
      .on(table.formId)
      .where(sql`${table.status} = 'PUBLISHED'`),
    index('form_versions_form_idx').on(table.formId),
    /**
     * المسوّدة وحدها بلا تاريخ نشر. المؤرشف كان منشورًا يومًا فيحتفظ
     * بتاريخه — وربط التاريخ بحالة `PUBLISHED` وحدها كان يمنع الأرشفة
     * أصلًا، فلا يمكن نشر إصدار ثانٍ.
     */
    check(
      'form_versions_published_consistency',
      sql`(${table.status} = 'DRAFT' and ${table.publishedAt} is null)
          or (${table.status} in ('PUBLISHED', 'ARCHIVED') and ${table.publishedAt} is not null)`,
    ),
  ],
)

/**
 * سؤال. تابع لإصدار لا لاستمارة — وهذا ما يجعل التجميد ممكنًا أصلًا.
 *
 * `key` معرّف الإجابة داخل `answers`، ويبقى ثابتًا عبر الإصدارات ليتيح
 * مقارنة إجابات إصدارين على السؤال نفسه.
 */
export const formFields = pgTable(
  'form_fields',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    versionId: uuidColumn('version_id')
      .notNull()
      .references(() => formVersions.id, { onDelete: 'cascade' }),

    key: varchar('key', { length: 60 }).notNull(),
    labelAr: varchar('label_ar', { length: 300 }).notNull(),
    hintAr: varchar('hint_ar', { length: 300 }),

    type: formFieldType('type').notNull(),
    isRequired: boolean('is_required').default(false).notNull(),
    displayOrder: integer('display_order').notNull(),

    /**
     * خيارات `SINGLE_SELECT` و`MULTI_SELECT`: `[{ value, labelAr }]`.
     * المراجع (`*_REF`) تقرأ خياراتها من كتالوجها فتبقى فارغة هنا.
     */
    options: jsonb('options')
      .$type<Array<{ value: string; labelAr: string }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),

    /**
     * الشرط الواحد: `{ fieldKey, op, value }` على حقل **يسبقه** ترتيبًا.
     * لا شجرة ولا محرك تعبيرات — الحد الرابع في PLAN.md.
     */
    conditionFieldKey: varchar('condition_field_key', { length: 60 }),
    conditionOp: formConditionOp('condition_op'),
    conditionValue: jsonb('condition_value'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('form_fields_key_unique').on(table.versionId, table.key),
    uniqueIndex('form_fields_order_unique').on(
      table.versionId,
      table.displayOrder,
    ),
    index('form_fields_version_idx').on(table.versionId),
    /**
     * الشرط كامل أو غائب. `notEmpty` وحدها بلا قيمة، والباقي يلزمها —
     * فشرط نصف مكتوب يخفي حقلًا إلى الأبد أو يُظهره دائمًا بلا سبب ظاهر.
     */
    check(
      'form_fields_condition_consistency',
      sql`(${table.conditionFieldKey} is null and ${table.conditionOp} is null and ${table.conditionValue} is null)
          or (${table.conditionFieldKey} is not null and ${table.conditionOp} = 'notEmpty' and ${table.conditionValue} is null)
          or (${table.conditionFieldKey} is not null and ${table.conditionOp} in ('eq', 'in') and ${table.conditionValue} is not null)`,
    ),
    // الخيارات مطلوبة للقوائم وحدها، وممنوعة على غيرها كي لا تُقرأ خطأً.
    check(
      'form_fields_options_consistency',
      sql`(${table.type} in ('SINGLE_SELECT', 'MULTI_SELECT') and jsonb_array_length(${table.options}) > 0)
          or (${table.type} not in ('SINGLE_SELECT', 'MULTI_SELECT') and jsonb_array_length(${table.options}) = 0)`,
    ),
  ],
)
