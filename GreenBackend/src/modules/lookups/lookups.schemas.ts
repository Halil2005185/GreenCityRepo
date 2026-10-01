import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { LOOKUP_CODES } from './lookups.registry.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/lookups${suffix}`

/**
 * رموز التعريفات تُسجَّل في العقد نوعًا، فتصل إلى `types.gen.ts` اتحادًا
 * حرفيًا: `<LookupSelect code="ORGANIZATON_KIND" />` بخطأ إملائي يكسر
 * الترجمة في الواجهة لا التشغيل.
 */
export const lookupCodeSchema = registry.register(
  'LookupCode',
  z.enum(LOOKUP_CODES),
)

const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/

export const lookupValueSchema = registry.register(
  'LookupValue',
  z.object({
    id: z.uuid(),
    code: z.string(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    displayOrder: z.number().int(),
    isActive: z.boolean(),
    isLocked: z.boolean().openapi({
      description: 'يشير إليها الكود برمزها: لا تُعطَّل ولا تُحذف، وتُعاد تسميتها.',
    }),
    isSystem: z.boolean().openapi({
      description:
        'يكتبها النظام وحده: لا تظهر في قوائم الاختيار ولا يقبلها الخادم من المستخدم.',
    }),
    usageCount: z.number().int().nullable().openapi({
      description:
        'عدد السجلات المصنّفة بها، حين يُطلب `includeUsage`. الحذف لما عدده صفر وحده.',
    }),
  }),
)

const listShape = {
  code: lookupCodeSchema,
  nameAr: z.string(),
  descriptionAr: z.string().nullable(),
  groupAr: z.string(),
  canEdit: z.boolean().openapi({
    description:
      'هل يحرّر المستخدم الحالي قيم التعريف. الواجهة تُظهر زر «+» عليه، والخادم يفحصه مستقلًا.',
  }),
}

export const lookupListSummarySchema = registry.register(
  'LookupListSummary',
  z.object({
    ...listShape,
    valueCount: z.number().int(),
    activeCount: z.number().int(),
  }),
)

export const lookupListSchema = registry.register(
  'LookupList',
  z.object({ ...listShape, values: z.array(lookupValueSchema) }),
)

export const lookupCodeParamsSchema = z.object({
  code: z.string().max(64),
})

export const lookupValueParamsSchema = z.object({
  code: z.string().max(64),
  id: z.uuid(),
})

export const getLookupQuerySchema = z.object({
  includeInactive: z.stringbool().default(false),
  includeUsage: z.stringbool().default(false),
})

export const updateLookupListBodySchema = z.object({
  nameAr: z.string().min(2).max(160).optional(),
  descriptionAr: z.string().max(1000).nullable().optional(),
})

export const createLookupValueBodySchema = z.object({
  nameAr: z.string().min(1).max(160),
  /**
   * اختياري: نافذة «+» في القائمة لا تسأل عنه، فيولّده الخادم. شاشة
   * الإعدادات تقترحه من الاسم ويعدّله المستخدم قبل الحفظ؛ ولا يتغير بعدها.
   */
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(CODE_PATTERN, 'الرمز بأحرف لاتينية كبيرة وأرقام وشرطة سفلية، ويبدأ بحرف.')
    .optional(),
  nameEn: z.string().max(160).optional(),
  descriptionAr: z.string().max(1000).optional(),
})

export const updateLookupValueBodySchema = z.object({
  nameAr: z.string().min(1).max(160).optional(),
  nameEn: z.string().max(160).nullable().optional(),
  descriptionAr: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
})

export const reorderLookupValuesBodySchema = z.object({
  /** ترتيب كامل لا جزئي: كل قيم التعريف بالترتيب المطلوب، كأسئلة الاستمارة. */
  ids: z.array(z.uuid()).min(1).max(500),
})

// ── المسارات ───────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Lookups'],
  summary: 'تعريفات النظام',
  description: 'كل التعريفات مع عدد قيمها. القراءة لكل الفريق.',
  security,
  responses: {
    200: {
      description: 'التعريفات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(lookupListSummarySchema) }),
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: path('/{code}'),
  tags: ['Lookups'],
  summary: 'تعريف وقيمه',
  description:
    'ما تقرؤه كل قائمة منسدلة برمزها. المعطّلة خارجها إلا بـ`includeInactive`، وعدد الاستعمال لا يُحسب إلا بـ`includeUsage`.',
  security,
  request: { params: lookupCodeParamsSchema, query: getLookupQuerySchema },
  responses: {
    200: {
      description: 'التعريف',
      content: { 'application/json': { schema: lookupListSchema } },
    },
    404: problemResponse('التعريف غير موجود'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/{code}'),
  tags: ['Lookups'],
  summary: 'تعديل اسم التعريف ووصفه',
  description: 'الرمز لا يتغير: الشاشات والأعمدة تشير إليه.',
  security,
  request: {
    params: lookupCodeParamsSchema,
    body: {
      content: { 'application/json': { schema: updateLookupListBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: { 'application/json': { schema: lookupListSchema } },
    },
    403: problemResponse('يحتاج `lookups.manage`'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{code}/values'),
  tags: ['Lookups'],
  summary: 'إضافة قيمة',
  description:
    'يستعمله زر «+» في القائمة المنسدلة وشاشة الإعدادات معًا. تُضاف القيمة في آخر الترتيب.',
  security,
  request: {
    params: lookupCodeParamsSchema,
    body: {
      content: { 'application/json': { schema: createLookupValueBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيفت',
      content: { 'application/json': { schema: lookupValueSchema } },
    },
    403: problemResponse('لا تملك تحرير هذا التعريف'),
    409: problemResponse('الاسم أو الرمز مستخدم في التعريف'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/{code}/values/{id}'),
  tags: ['Lookups'],
  summary: 'تعديل قيمة أو تعطيلها',
  description:
    'التعطيل يخفي القيمة من القوائم ولا يمسّ ما صُنّف بها. القيم المقفلة لا تُعطَّل.',
  security,
  request: {
    params: lookupValueParamsSchema,
    body: {
      content: { 'application/json': { schema: updateLookupValueBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّلت',
      content: { 'application/json': { schema: lookupValueSchema } },
    },
    409: problemResponse('القيمة مقفلة أو الاسم مستخدم'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{code}/values/reorder'),
  tags: ['Lookups'],
  summary: 'ترتيب القيم',
  security,
  request: {
    params: lookupCodeParamsSchema,
    body: {
      content: {
        'application/json': { schema: reorderLookupValuesBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: 'رُتِّبت',
      content: { 'application/json': { schema: lookupListSchema } },
    },
    422: problemResponse('الترتيب لا يشمل كل قيم التعريف'),
  },
})

registry.registerPath({
  method: 'delete',
  path: path('/{code}/values/{id}'),
  tags: ['Lookups'],
  summary: 'حذف قيمة لم تُستعمل',
  description:
    'لقيمة لم يُصنَّف بها سجل قط. المستعملة تُعطَّل بدل حذفها، والمفتاح الأجنبي يرفض حذفها ولو أخطأ العدّ.',
  security,
  request: { params: lookupValueParamsSchema },
  responses: {
    204: { description: 'حُذفت' },
    409: problemResponse('القيمة مستعملة أو مقفلة'),
  },
})

export type GetLookupQuery = z.infer<typeof getLookupQuerySchema>
export type UpdateLookupListBody = z.infer<typeof updateLookupListBodySchema>
export type CreateLookupValueBody = z.infer<typeof createLookupValueBodySchema>
export type UpdateLookupValueBody = z.infer<typeof updateLookupValueBodySchema>
export type ReorderLookupValuesBody = z.infer<
  typeof reorderLookupValuesBodySchema
>
