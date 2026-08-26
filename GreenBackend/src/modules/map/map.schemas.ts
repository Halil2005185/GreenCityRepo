import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/map${suffix}`

export const mapAreaSchema = registry.register(
  'MapArea',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    nameAr: z.string(),
    centerLat: z.number().nullable(),
    centerLng: z.number().nullable(),
    boundary: z.unknown().nullable().openapi({
      description: 'هندسة GeoJSON للمحافظة — تُلوَّن عند مرور الماوس وتُنقر للتقريب.',
    }),
    campaignCount: z.number().int(),
    greenPointCount: z.number().int(),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/areas'),
  tags: ['Map'],
  summary: 'المحافظات بحدودها وعدّاداتها',
  description:
    'ثقيل ونادر التغيّر، لذلك مسار مستقل عن النقاط: تحديث نقطة واحدة لا يعيد إرسال الحدود كلها. المصدر geoBoundaries عن UN OCHA برخصة CC BY 3.0 IGO.',
  security,
  responses: {
    200: {
      description: 'المحافظات',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(mapAreaSchema),
            attribution: z.string(),
          }),
        },
      },
    },
  },
})

export const mapPointSchema = registry.register(
  'MapPoint',
  z.object({
    siteId: z.uuid(),
    initiativeId: z.uuid(),
    kind: z.enum(['CAMPAIGN', 'GREEN_POINT']),
    initiativeNameAr: z.string(),
    siteNameAr: z.string(),
    contributorNameAr: z.string().nullable(),
    status: z.string(),
    initiativeStatus: z.string(),
    areaNameAr: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  }),
)

export const listPointsQuerySchema = z.object({
  kind: z.enum(['CAMPAIGN', 'GREEN_POINT']).optional(),
  areaId: z.uuid().optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/points'),
  tags: ['Map'],
  summary: 'نقاط الخريطة',
  description:
    'الحملات والنقاط الخضراء على الخريطة نفسها. الوحدة موقع تنفيذ لا مبادرة: للحملة مواقع عدة وللنقطة الخضراء موقع واحد.',
  security,
  request: { query: listPointsQuerySchema },
  responses: {
    200: {
      description: 'النقاط',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(mapPointSchema) }),
        },
      },
    },
  },
})

export const createGreenPointBodySchema = z.object({
  nameAr: z.string().min(3).max(200).openapi({ example: 'تشجير مدخل الحي' }),
  contributorNameAr: z.string().min(2).max(200),
  contributorKind: z
    .enum(['INDIVIDUAL', 'COMPANY', 'INSTITUTION', 'SCHOOL', 'VOLUNTEER_TEAM', 'OTHER'])
    .optional(),
  areaId: z.uuid().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  occurredAt: z.iso.datetime().optional(),
  storyAr: z.string().max(20000).optional(),
  coverImageUrl: z.url().max(500).optional(),

  /**
   * المؤشر يأتي من الكتالوج لا من الكود.
   *
   * الواجهة تختار الافتراضي المناسب وترسل معرّفه، فلا يُشفَّر اسم مؤشر
   * في الخادم — وهي القاعدة الحاكمة في PLAN.md.
   */
  metricId: z.uuid().optional(),
  metricValue: z.number().min(0).max(999_999_999).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/green-points'),
  tags: ['Map'],
  summary: 'توثيق نقطة خضراء',
  description:
    'يُنشئ مبادرة من نوع `GREEN_POINT` بموقعها الواحد في معاملة واحدة، ويسجّل قيد الأثر موثّقًا حين يُرسَل مؤشر وقيمة — فتوثيق الفريق هو التحقق نفسه.',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createGreenPointBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'وُثّقت',
      content: { 'application/json': { schema: mapPointSchema } },
    },
    422: problemResponse('بيانات غير صالحة أو لا يوجد برنامج تشجير'),
  },
})

export const greenPointParamsSchema = z.object({ siteId: z.uuid() })

registry.registerPath({
  method: 'delete',
  path: path('/green-points/{siteId}'),
  tags: ['Map'],
  summary: 'حذف نقطة خضراء',
  description:
    'محوٌ لا أرشفة: النقطة توثيق فعلٍ مضى، والتوثيق الخاطئ يُمحى كي لا يبقى رقمه في المجموع الوطني وعلامته على الخريطة. يُمحى معها موقعها وقيود أثرها، ويبقى ما مُحي في سجل التدقيق. الحملة لا تُحذف من هنا؛ تُلغى من مسارها.',
  security,
  request: { params: greenPointParamsSchema },
  responses: {
    204: { description: 'حُذفت' },
    404: problemResponse('النقطة غير موجودة'),
    422: problemResponse('الموقع يتبع حملة لا نقطة خضراء'),
  },
})

export type ListPointsQuery = z.infer<typeof listPointsQuerySchema>
export type CreateGreenPointBody = z.infer<typeof createGreenPointBodySchema>
export type GreenPointParams = z.infer<typeof greenPointParamsSchema>
