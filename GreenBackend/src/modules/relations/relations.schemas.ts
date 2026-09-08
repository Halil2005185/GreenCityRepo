import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/relations${suffix}`

/**
 * الجدولان متطابقا الشكل، فالمخطط واحد يُسجَّل باسمين في العقد. اسمان
 * مختلفان لأن الواجهة تولّد نوعًا لكل مفهوم، ونوع واحد باسم عام يجعل
 * `channelId` و`relationshipTypeId` قابلين للخلط دون شكوى من المترجم.
 */
const catalogShape = {
  id: z.uuid(),
  slug: z.string(),
  nameAr: z.string(),
  nameEn: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
}

export const mediaChannelSchema = registry.register(
  'MediaChannel',
  z.object(catalogShape),
)

export const relationshipTypeSchema = registry.register(
  'RelationshipType',
  z.object(catalogShape),
)

export const listCatalogQuerySchema = z.object({
  includeInactive: z.stringbool().default(false),
})

export const createCatalogBodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'الـslug بأحرف لاتينية صغيرة وأرقام وشرطات فقط.'),
  nameAr: z.string().min(2).max(160),
  nameEn: z.string().max(160).optional(),
  descriptionAr: z.string().max(1000).optional(),
  displayOrder: z.number().int().min(0).max(9999).default(0),
})

export const updateCatalogBodySchema = createCatalogBodySchema
  .omit({ slug: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })

export const catalogIdParamsSchema = z.object({ id: z.uuid() })

/** يوفّر تكرار أربعة تسجيلات متطابقة لكل كتالوج. */
function registerCatalogPaths(
  segment: 'media-channels' | 'relationship-types',
  schema: typeof mediaChannelSchema,
  labels: { plural: string; singular: string; description: string },
) {
  registry.registerPath({
    method: 'get',
    path: path(`/${segment}`),
    tags: ['Relations'],
    summary: labels.plural,
    description: labels.description,
    security,
    request: { query: listCatalogQuerySchema },
    responses: {
      200: {
        description: labels.plural,
        content: {
          'application/json': { schema: z.object({ data: z.array(schema) }) },
        },
      },
    },
  })

  registry.registerPath({
    method: 'post',
    path: path(`/${segment}`),
    tags: ['Relations'],
    summary: `إضافة ${labels.singular}`,
    security,
    request: {
      body: {
        content: { 'application/json': { schema: createCatalogBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'أُضيف',
        content: { 'application/json': { schema } },
      },
      409: problemResponse('الـslug مستخدم'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: path(`/${segment}/{id}`),
    tags: ['Relations'],
    summary: `تعديل ${labels.singular}`,
    description:
      'التعطيل يخفي المفردة من قوائم الاختيار ولا يمحو من صُنّف بها سابقًا.',
    security,
    request: {
      params: catalogIdParamsSchema,
      body: {
        content: { 'application/json': { schema: updateCatalogBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'عُدِّل',
        content: { 'application/json': { schema } },
      },
      404: problemResponse('المفردة غير موجودة'),
    },
  })
}

registerCatalogPaths('media-channels', mediaChannelSchema, {
  plural: 'أشكال العمل الإعلامي',
  singular: 'شكل عمل إعلامي',
  description:
    'بأي شكل يعمل الإعلامي أو الجهة: سؤال شارع، ريبورتاج، بودكاست، تصوير. مفردات يحرّرها مكتب العلاقات دون migration.',
})

registerCatalogPaths('relationship-types', relationshipTypeSchema, {
  plural: 'أنواع العلاقة',
  singular: 'نوع علاقة',
  description:
    'طبيعة العلاقة عمليًا — تعاون تطوعي، تغطية، تبادل منفعة. غير نوع الشراكة الذي يحدده الميثاق.',
})

export type ListCatalogQuery = z.infer<typeof listCatalogQuerySchema>
export type CreateCatalogBody = z.infer<typeof createCatalogBodySchema>
export type UpdateCatalogBody = z.infer<typeof updateCatalogBodySchema>
