import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const path = (suffix: string) => `${env.API_PREFIX}/admin${suffix}`
const security = [{ [bearerAuth.name]: [] }]

export const officeSchema = registry.register(
  'Office',
  z.object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    slug: z.string(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    displayOrder: z.number().int(),
    isActive: z.boolean(),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/offices'),
  tags: ['Organization'],
  summary: 'قائمة المكاتب والأقسام الفرعية',
  description:
    'مرجع تنظيمي متاح لكل أعضاء الفريق. `parentId` يبني الشجرة؛ المستوى الأعلى قيمته null.',
  security,
  responses: {
    200: {
      description: 'المكاتب',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(officeSchema) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
  },
})

export const roleSchema = registry.register(
  'Role',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    scope: z.enum(['STAFF', 'PARTNER']),
    capabilities: z.array(z.string()),
    isSystem: z.boolean(),
    displayOrder: z.number().int(),
  }),
)

export const listRolesQuerySchema = z.object({
  scope: z.enum(['STAFF', 'PARTNER']).optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/roles'),
  tags: ['Organization'],
  summary: 'قائمة الأدوار وقدراتها',
  security,
  request: { query: listRolesQuerySchema },
  responses: {
    200: {
      description: 'الأدوار',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(roleSchema) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
  },
})

export const capabilitySchema = registry.register(
  'CapabilityDefinition',
  z.object({
    key: z.string(),
    nameAr: z.string(),
    group: z.string(),
    scope: z.enum(['STAFF', 'PARTNER']),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/capabilities'),
  tags: ['Organization'],
  summary: 'كتالوج القدرات',
  description:
    'ثابت في كود الخادم لأن الحراس تفحصه بالاسم. يُعرض هنا لتبني شاشة الأدوار قوائمها منه بدل تكرار القائمة في الواجهة.',
  security,
  responses: {
    200: {
      description: 'القدرات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(capabilitySchema) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
  },
})

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>
