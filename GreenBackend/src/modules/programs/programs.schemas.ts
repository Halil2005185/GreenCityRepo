import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/programs${suffix}`

export const targetRollupEnum = z.enum(['STRICT', 'ADVISORY', 'NONE'])

export const programSchema = registry.register(
  'Program',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    defaultTargetRollup: targetRollupEnum,
    isActive: z.boolean(),
    displayOrder: z.number().int(),
    initiativeCount: z.number().int(),
    templateCount: z.number().int().openapi({
      description:
        'عدد قوالب المراحل والمهام التي تُنسخ تلقائيًا عند إنشاء مبادرة تحت هذا البرنامج.',
    }),
  }),
)

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Programs'],
  summary: 'البرامج',
  description:
    'البرامج صفوف لا قيم مكتوبة في الكود. إضافة برنامج خامس إدخال بيانات.',
  security,
  responses: {
    200: {
      description: 'البرامج',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(programSchema) }),
        },
      },
    },
  },
})

export const createProgramBodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'الـslug بأحرف لاتينية صغيرة وأرقام وشرطات فقط.'),
  nameAr: z.string().min(2).max(160),
  nameEn: z.string().max(160).optional(),
  descriptionAr: z.string().max(2000).optional(),
  defaultTargetRollup: targetRollupEnum.default('ADVISORY'),
  displayOrder: z.number().int().min(0).max(9999).default(0),
})

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Programs'],
  summary: 'إضافة برنامج',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createProgramBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: programSchema } },
    },
    409: problemResponse('الـslug مستخدم'),
  },
})

export const programIdParamsSchema = z.object({ id: z.uuid() })

export const updateProgramBodySchema = createProgramBodySchema
  .omit({ slug: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })

registry.registerPath({
  method: 'patch',
  path: path('/{id}'),
  tags: ['Programs'],
  summary: 'تعديل برنامج',
  security,
  request: {
    params: programIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updateProgramBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: { 'application/json': { schema: programSchema } },
    },
    404: problemResponse('البرنامج غير موجود'),
  },
})

export type CreateProgramBody = z.infer<typeof createProgramBodySchema>
export type UpdateProgramBody = z.infer<typeof updateProgramBodySchema>
