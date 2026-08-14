import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const adminPath = (suffix: string) =>
  `${env.API_PREFIX}/admin/charter/versions${suffix}`

export const charterVersionSchema = registry.register(
  'CharterVersion',
  z.object({
    id: z.uuid(),
    version: z.string(),
    titleAr: z.string(),
    summaryAr: z.string().nullable(),
    bodyAr: z.string(),
    principlesAr: z.array(z.string()),
    commitmentsAr: z.array(z.string()),
    effectiveFrom: z.iso.datetime().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    isCurrent: z.boolean().openapi({
      description:
        'الإصدار المنشور الأحدث سريانًا. الإقرارات تُقارن به عند تفعيل الشريك.',
    }),
    createdAt: z.iso.datetime(),
  }),
)

registry.registerPath({
  method: 'get',
  path: `${env.API_PREFIX}/charter/current`,
  tags: ['Charter'],
  summary: 'الإصدار الساري من الميثاق',
  description:
    'متاح لكل مصادَق — أعضاء الفريق وممثلي الشركاء. الشريك يحتاجه ليقرأ ما أقرّ به.',
  security,
  responses: {
    200: {
      description: 'الإصدار الحالي',
      content: { 'application/json': { schema: charterVersionSchema } },
    },
    404: problemResponse('لا يوجد إصدار منشور بعد'),
  },
})

registry.registerPath({
  method: 'get',
  path: adminPath(''),
  tags: ['Charter'],
  summary: 'كل إصدارات الميثاق',
  security,
  responses: {
    200: {
      description: 'الإصدارات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(charterVersionSchema) }),
        },
      },
    },
    403: problemResponse('لا تملك صلاحية إدارة الميثاق'),
  },
})

export const createCharterVersionBodySchema = z.object({
  version: z
    .string()
    .min(1)
    .max(20)
    .openapi({ example: '1.0' }),
  titleAr: z.string().min(3).max(200),
  summaryAr: z.string().max(2000).optional(),
  bodyAr: z.string().min(20),
  principlesAr: z.array(z.string().min(3).max(300)).max(50).default([]),
  commitmentsAr: z.array(z.string().min(3).max(300)).max(50).default([]),
})

registry.registerPath({
  method: 'post',
  path: adminPath(''),
  tags: ['Charter'],
  summary: 'إنشاء إصدار جديد (مسودة)',
  description: 'المسودة لا تُستعمل في الإقرارات حتى تُنشر.',
  security,
  request: {
    body: {
      content: {
        'application/json': { schema: createCharterVersionBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: 'أُنشئت المسودة',
      content: { 'application/json': { schema: charterVersionSchema } },
    },
    409: problemResponse('رقم الإصدار مستخدم'),
  },
})

export const charterIdParamsSchema = z.object({ id: z.uuid() })

export const publishCharterBodySchema = z.object({
  effectiveFrom: z.iso.datetime().optional(),
})

registry.registerPath({
  method: 'post',
  path: adminPath('/{id}/publish'),
  tags: ['Charter'],
  summary: 'نشر إصدار',
  description:
    'النشر لا رجعة فيه: الإقرارات تشير إلى الإصدار، فتعديل منشور يغيّر ما وقّعت عليه جهات فعلًا. الإصدار الجديد يحل محل السابق دون أن يمحوه.',
  security,
  request: {
    params: charterIdParamsSchema,
    body: {
      content: { 'application/json': { schema: publishCharterBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'نُشر',
      content: { 'application/json': { schema: charterVersionSchema } },
    },
    409: problemResponse('الإصدار منشور بالفعل'),
  },
})

export type CreateCharterVersionBody = z.infer<
  typeof createCharterVersionBodySchema
>
export type PublishCharterBody = z.infer<typeof publishCharterBodySchema>
