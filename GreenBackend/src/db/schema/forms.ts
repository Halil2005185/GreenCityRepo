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
  fieldContactRole,
  formConditionOp,
  formFieldType,
  formVersionStatus,
  submissionStatus,
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
     * حدود الاختيار للقوائم المتعددة، وحد الأحرف للنصوص.
     *
     * `isRequired` يقول «أجب»، وهذه تقول «كم». سؤال «اختر من واحد إلى
     * خمسة مجالات» لا يُعبَّر عنه بالإلزام وحده، وسؤال بحد خمسمئة حرف
     * يحتاج رقمًا لا نية.
     */
    minSelections: integer('min_selections'),
    maxSelections: integer('max_selections'),
    maxLength: integer('max_length'),

    /**
     * أي حقل يحمل اسم المتقدّم وبريده وهاتفه — يُنسَخ منه إلى عمود على
     * الطلب. صريح لا اصطلاحي: الاعتماد على مفتاح اسمه `email` يكسر أول
     * استمارة تسمّيه `mail`، فيصير الطلب بلا بريد يُراسَل عليه صامتًا.
     */
    contactRole: fieldContactRole('contact_role'),

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
    /**
     * حدود الاختيار على الاختيار المتعدد وحده، وحد الأحرف على النصوص
     * وحدها. حدٌّ على نوع لا يحمله يعني رقمًا لا يقرأه أحد ولا يتحقق منه
     * شيء — وهو أسوأ من غيابه لأنه يوهم بضمانة.
     */
    check(
      'form_fields_selection_limits',
      sql`(${table.type} = 'MULTI_SELECT'
             and coalesce(${table.minSelections}, 1) >= 1
             and coalesce(${table.maxSelections}, 1) >= coalesce(${table.minSelections}, 1))
          or (${table.type} <> 'MULTI_SELECT'
             and ${table.minSelections} is null
             and ${table.maxSelections} is null)`,
    ),
    check(
      'form_fields_max_length_scope',
      sql`(${table.type} in ('TEXT', 'LONG_TEXT') and coalesce(${table.maxLength}, 1) >= 1)
          or (${table.type} not in ('TEXT', 'LONG_TEXT') and ${table.maxLength} is null)`,
    ),
    // حقل واحد لكل دور تواصل في الإصدار: بريدان يعنيان أيهما نراسل.
    uniqueIndex('form_fields_contact_role_unique')
      .on(table.versionId, table.contactRole)
      .where(sql`${table.contactRole} is not null`),
    // الدور يطابق النوع، وإلا نُسخ نص حر إلى عمود بريد.
    check(
      'form_fields_contact_role_type',
      sql`${table.contactRole} is null
          or (${table.contactRole} = 'NAME' and ${table.type} = 'TEXT')
          or (${table.contactRole} = 'EMAIL' and ${table.type} = 'EMAIL')
          or (${table.contactRole} = 'PHONE' and ${table.type} = 'PHONE')`,
    ),
  ],
)

/**
 * طلب مقدَّم على إصدار مجمَّد.
 *
 * `answers` خام لا يُعدَّل — هو ما كتبه المتقدّم مقابل الأسئلة كما سُئلت.
 * وبجانبه أعمدة حقيقية مستخرجة ومحسوبة، لأن الفرز والفهرسة ومنع التكرار
 * لا تُبنى على jsonb، والوثيقة تطلب «ملف متطوع قابل للفرز» لا أرشيف
 * إجابات. صفٌّ واحد بعمودين نوعين خير من ستة جداول قبل أن يصل أول طلب.
 */
export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    /** الإصدار لا الاستمارة: الطلب يُقرأ مقابل أسئلته هو. */
    formVersionId: uuidColumn('form_version_id')
      .notNull()
      .references(() => formVersions.id, { onDelete: 'restrict' }),

    answers: jsonb('answers')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    status: submissionStatus('status').default('NEW').notNull(),

    applicantNameAr: varchar('applicant_name_ar', { length: 160 }),
    applicantEmail: varchar('applicant_email', { length: 254 }),
    applicantPhone: varchar('applicant_phone', { length: 32 }),

    /**
     * تجزئة العنوان لا العنوان.
     *
     * يكفي لكشف التكرار والإساءة من مصدر واحد، ولا يبني سجلًا يربط شخصًا
     * بمكانه. الطلب يأتي من متطوع لا من مستخدم النظام، فلا مبرر لحفظ
     * أكثر مما يلزم للحماية.
     */
    sourceIpHash: varchar('source_ip_hash', { length: 64 }),

    submittedAt: tsColumn('submitted_at').defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    index('form_submissions_version_idx').on(table.formVersionId),
    index('form_submissions_status_idx').on(table.status),
    index('form_submissions_email_idx').on(table.applicantEmail),
    index('form_submissions_submitted_idx').on(table.submittedAt),
  ],
)
