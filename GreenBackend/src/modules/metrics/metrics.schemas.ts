import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/metrics${suffix}`

export const metricAggregationEnum = z.enum(['SUM', 'MAX', 'LATEST'])

export const metricSchema = registry.register(
  'Metric',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    unitAr: z.string(),
    aggregation: metricAggregationEnum,
    decimals: z.number().int(),
    isActive: z.boolean(),
    displayOrder: z.number().int(),
  }),
)

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Metrics'],
  summary: 'كتالوج المؤشرات',
  description:
    'لا يوجد عمود باسم مؤشر في أي جدول. إضافة «م² تربة معالجة» أو «تصميم مُسلَّم» إدخال صف واحد، دون migration ولا شاشة جديدة.',
  security,
  responses: {
    200: {
      description: 'المؤشرات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(metricSchema) }),
        },
      },
    },
  },
})

export const createMetricBodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'الـslug بأحرف لاتينية صغيرة وأرقام وشرطات فقط.'),
  nameAr: z.string().min(2).max(160),
  nameEn: z.string().max(160).optional(),
  descriptionAr: z.string().max(1000).optional(),
  unitAr: z.string().min(1).max(40).openapi({ example: 'شجرة' }),
  aggregation: metricAggregationEnum.default('SUM'),
  decimals: z.number().int().min(0).max(6).default(0),
  displayOrder: z.number().int().min(0).max(9999).default(0),
})

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Metrics'],
  summary: 'إضافة مؤشر',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createMetricBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: metricSchema } },
    },
    409: problemResponse('الـslug مستخدم'),
  },
})

export const metricIdParamsSchema = z.object({ id: z.uuid() })

export const updateMetricBodySchema = createMetricBodySchema
  .omit({ slug: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })

registry.registerPath({
  method: 'patch',
  path: path('/{id}'),
  tags: ['Metrics'],
  summary: 'تعديل مؤشر',
  description:
    'تعطيل المؤشر يخفيه عن الاختيار ولا يمحو قيوده — الأرقام المسجّلة تبقى.',
  security,
  request: {
    params: metricIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updateMetricBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: { 'application/json': { schema: metricSchema } },
    },
    404: problemResponse('المؤشر غير موجود'),
  },
})

export type CreateMetricBody = z.infer<typeof createMetricBodySchema>
export type UpdateMetricBody = z.infer<typeof updateMetricBodySchema>
