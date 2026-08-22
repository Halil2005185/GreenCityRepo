import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const path = (suffix: string) => `${env.API_PREFIX}/admin/forms${suffix}`
const security = [{ [bearerAuth.name]: [] }]

export const fieldTypeEnum = z.enum([
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'EMAIL',
  'PHONE',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'AREA_REF',
  'OFFICE_REF',
  'PROGRAM_REF',
])

export const SELECT_TYPES = ['SINGLE_SELECT', 'MULTI_SELECT'] as const

/** مفتاح الإجابة داخل `answers` — يبقى ثابتًا عبر الإصدارات. */
const fieldKey = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'المفتاح يبدأ بحرف لاتيني صغير ويحوي حروفًا صغيرة وأرقامًا وشرطة سفلية فقط.',
  )

const optionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  labelAr: z.string().trim().min(1).max(160),
})

/**
 * الشرط الواحد — الحد الرابع في PLAN.md.
 *
 * `notEmpty` بلا قيمة، و`eq` بقيمة مفردة، و`in` بمصفوفة. الشكل مفروض هنا
 * وفي قيد على الجدول معًا: الأول يعطي رسالة مفهومة، والثاني يمنع أي مسار
 * كتابة لا يمر من هنا.
 */
export const conditionSchema = z.discriminatedUnion('op', [
  z.object({ fieldKey, op: z.literal('notEmpty') }),
  z.object({ fieldKey, op: z.literal('eq'), value: z.string().max(160) }),
  z.object({
    fieldKey,
    op: z.literal('in'),
    value: z.array(z.string().max(160)).min(1).max(50),
  }),
])

export const formFieldSchema = registry.register(
  'FormField',
  z.object({
    id: z.uuid(),
    key: z.string(),
    labelAr: z.string(),
    hintAr: z.string().nullable(),
    type: fieldTypeEnum,
    isRequired: z.boolean(),
    displayOrder: z.number().int(),
    options: z.array(optionSchema),
    condition: conditionSchema.nullable(),
  }),
)

export const formVersionSchema = registry.register(
  'FormVersion',
  z.object({
    id: z.uuid(),
    version: z.number().int(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    publishedAt: z.iso.datetime().nullable(),
    fields: z.array(formFieldSchema),
  }),
)

export const formSummarySchema = registry.register(
  'FormSummary',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    nameAr: z.string(),
    descriptionAr: z.string().nullable(),
    officeId: z.uuid().nullable(),
    officeNameAr: z.string().nullable(),
    isAccepting: z.boolean(),
    /** رقم أحدث إصدار منشور، أو null إن لم يُنشر شيء بعد. */
    publishedVersion: z.number().int().nullable(),
    draftFieldCount: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
)

export const formDetailSchema = registry.register(
  'FormDetail',
  formSummarySchema.extend({
    draft: formVersionSchema.nullable(),
    published: formVersionSchema.nullable(),
  }),
)

// ── الطلبات ────────────────────────────────────────────────────────────

export const createFormBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/, 'المعرّف حروف لاتينية صغيرة وأرقام وشرطات.'),
  nameAr: z.string().trim().min(2).max(160),
  descriptionAr: z.string().trim().max(1000).optional(),
  officeId: z.uuid().optional(),
})

export const updateFormBodySchema = z
  .object({
    nameAr: z.string().trim().min(2).max(160).optional(),
    descriptionAr: z.string().trim().max(1000).nullable().optional(),
    officeId: z.uuid().nullable().optional(),
    isAccepting: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'لا يوجد ما يُحدَّث.',
  })

export const fieldBodySchema = z
  .object({
    key: fieldKey,
    labelAr: z.string().trim().min(1).max(300),
    hintAr: z.string().trim().max(300).nullable().optional(),
    type: fieldTypeEnum,
    isRequired: z.boolean().default(false),
    options: z.array(optionSchema).max(100).default([]),
    condition: conditionSchema.nullable().optional(),
  })
  .refine(
    (body) =>
      SELECT_TYPES.includes(body.type as (typeof SELECT_TYPES)[number])
        ? body.options.length > 0
        : body.options.length === 0,
    {
      message: 'الخيارات مطلوبة للقوائم وحدها. المراجع تقرأ خياراتها من كتالوجها.',
      path: ['options'],
    },
  )

export const reorderBodySchema = z.object({
  /** ترتيب كامل لا جزئي: كل مفاتيح المسوّدة بالترتيب المطلوب. */
  keys: z.array(fieldKey).min(1).max(200),
})

// ── المسارات ───────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Forms'],
  summary: 'قائمة الاستمارات',
  security,
  responses: {
    200: {
      description: 'الاستمارات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(formSummarySchema) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.view'),
  },
})

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Forms'],
  summary: 'إنشاء استمارة',
  description: 'تُنشأ معها مسوّدة الإصدار الأول فورًا — لا استمارة بلا مسوّدة.',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createFormBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُنشئت',
      content: {
        'application/json': { schema: z.object({ data: formDetailSchema }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.manage'),
    409: problemResponse('المعرّف مستعمل'),
  },
})

registry.registerPath({
  method: 'get',
  path: path('/{id}'),
  tags: ['Forms'],
  summary: 'استمارة بمسوّدتها وإصدارها المنشور',
  security,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'الاستمارة',
      content: {
        'application/json': { schema: z.object({ data: formDetailSchema }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.view'),
    404: problemResponse('الاستمارة غير موجودة'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/{id}'),
  tags: ['Forms'],
  summary: 'تعديل بيانات الاستمارة',
  description:
    '`isAccepting` يفتح الاستقبال ويغلقه، ويحتاج إصدارًا منشورًا وقدرة forms.publish.',
  security,
  request: {
    params: z.object({ id: z.uuid() }),
    body: {
      content: { 'application/json': { schema: updateFormBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'حُدِّثت',
      content: {
        'application/json': { schema: z.object({ data: formDetailSchema }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة اللازمة'),
    404: problemResponse('الاستمارة غير موجودة'),
    409: problemResponse('لا إصدار منشور يمكن فتح الاستقبال عليه'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/publish'),
  tags: ['Forms'],
  summary: 'نشر المسوّدة',
  description:
    'يجمّد المسوّدة ويؤرشف المنشور السابق، ثم يفتح المسوّدة التالية بنسخة من الأسئلة. المنشور لا يُعدَّل بعدها.',
  security,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'نُشرت',
      content: {
        'application/json': { schema: z.object({ data: formDetailSchema }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.publish'),
    404: problemResponse('الاستمارة غير موجودة'),
    409: problemResponse('لا مسوّدة، أو المسوّدة بلا أسئلة'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/fields'),
  tags: ['Forms'],
  summary: 'إضافة سؤال إلى المسوّدة',
  description:
    'المنشور مجمَّد؛ الأسئلة تُضاف إلى المسوّدة وحدها. شرط الظهور يجب أن يشير إلى سؤال يسبقه ترتيبًا.',
  security,
  request: {
    params: z.object({ id: z.uuid() }),
    body: { content: { 'application/json': { schema: fieldBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: {
        'application/json': { schema: z.object({ data: formFieldSchema }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.manage'),
    404: problemResponse('الاستمارة غير موجودة'),
    409: problemResponse('المفتاح مستعمل، أو الشرط يشير إلى سؤال لاحق'),
    422: problemResponse('بيانات غير صالحة — خيارات ناقصة على قائمة، أو خيارات على نوع لا يحملها'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/{id}/fields/{fieldId}'),
  tags: ['Forms'],
  summary: 'تعديل سؤال في المسوّدة',
  security,
  request: {
    params: z.object({ id: z.uuid(), fieldId: z.uuid() }),
    body: { content: { 'application/json': { schema: fieldBodySchema } } },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: {
        'application/json': { schema: z.object({ data: formFieldSchema }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.manage'),
    404: problemResponse('السؤال غير موجود في المسوّدة'),
    409: problemResponse('المفتاح مستعمل، أو الشرط يشير إلى سؤال لاحق'),
    422: problemResponse('بيانات غير صالحة — خيارات ناقصة على قائمة، أو خيارات على نوع لا يحملها'),
  },
})

registry.registerPath({
  method: 'delete',
  path: path('/{id}/fields/{fieldId}'),
  tags: ['Forms'],
  summary: 'حذف سؤال من المسوّدة',
  security,
  request: { params: z.object({ id: z.uuid(), fieldId: z.uuid() }) },
  responses: {
    204: { description: 'حُذف' },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.manage'),
    404: problemResponse('السؤال غير موجود في المسوّدة'),
    409: problemResponse('سؤال آخر يشترط عليه'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/fields/reorder'),
  tags: ['Forms'],
  summary: 'إعادة ترتيب أسئلة المسوّدة',
  description:
    'ترتيب كامل بمفاتيح المسوّدة كلها. يُرفض إن كسر الترتيب الجديد شرطًا يشير إلى سؤال صار لاحقًا.',
  security,
  request: {
    params: z.object({ id: z.uuid() }),
    body: { content: { 'application/json': { schema: reorderBodySchema } } },
  },
  responses: {
    200: {
      description: 'رُتِّبت',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(formFieldSchema) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة forms.manage'),
    404: problemResponse('الاستمارة غير موجودة'),
    409: problemResponse('الترتيب ناقص أو يكسر شرطًا'),
  },
})

export type CreateFormBody = z.infer<typeof createFormBodySchema>
export type UpdateFormBody = z.infer<typeof updateFormBodySchema>
export type FieldBody = z.infer<typeof fieldBodySchema>
export type ReorderBody = z.infer<typeof reorderBodySchema>
export type FieldCondition = z.infer<typeof conditionSchema>
