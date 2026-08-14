import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/areas${suffix}`

export const areaLevelEnum = z.enum([
  'GOVERNORATE',
  'CITY',
  'DISTRICT',
  'NEIGHBORHOOD',
])

export const areaSchema = registry.register(
  'Area',
  z.object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    slug: z.string(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    level: areaLevelEnum,
    depth: z.number().int(),
    path: z.string().openapi({
      description:
        'مسار مادّي من الـslugs مفصولة بشرطة مائلة، يجعل استعلام «كل ما تحت دمشق» فهرسًا واحدًا بدل تعاود.',
    }),
    centerLat: z.number().nullable(),
    centerLng: z.number().nullable(),
    isActive: z.boolean(),
  }),
)

export const listAreasQuerySchema = z.object({
  level: areaLevelEnum.optional(),
  parentId: z.uuid().optional(),
  /** يعيد كل ما تحت المسار المعطى مهما كان عمقه. */
  under: z.string().max(400).optional(),
  q: z.string().max(120).optional(),
})

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Geography'],
  summary: 'المناطق الجغرافية',
  description:
    'جدول واحد ذاتي المرجعية لكل المستويات: محافظة، مدينة، منطقة، حي.',
  security,
  request: { query: listAreasQuerySchema },
  responses: {
    200: {
      description: 'المناطق',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(areaSchema) }),
        },
      },
    },
  },
})

export const createAreaBodySchema = z.object({
  parentId: z.uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'الـslug بأحرف لاتينية صغيرة وأرقام وشرطات فقط.'),
  nameAr: z.string().min(2).max(160),
  nameEn: z.string().max(160).optional(),
  level: areaLevelEnum,
  centerLat: z.number().min(-90).max(90).optional(),
  centerLng: z.number().min(-180).max(180).optional(),
})

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Geography'],
  summary: 'إضافة منطقة',
  description:
    'المحافظة بلا أب، وما دونها يلزمه أب. المسار والعمق يُشتقّان من الأب.',
  security,
  request: {
    body: { content: { 'application/json': { schema: createAreaBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُضيفت',
      content: { 'application/json': { schema: areaSchema } },
    },
    409: problemResponse('الـslug مستخدم بين الأشقاء'),
    422: problemResponse('مستوى أو أب غير صالح'),
  },
})

export type ListAreasQuery = z.infer<typeof listAreasQuerySchema>
export type CreateAreaBody = z.infer<typeof createAreaBodySchema>
