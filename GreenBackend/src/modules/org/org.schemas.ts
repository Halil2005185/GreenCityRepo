import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { STAFF_CAPABILITIES } from '../access/capabilities.js'

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
    officeId: z.uuid().nullable().openapi({
      description: 'الفريق الذي ينتمي إليه المنصب؛ `null` دور عام يصلح لأي فريق.',
    }),
    capabilities: z.array(z.string()),
    isSystem: z.boolean(),
    isLocked: z.boolean().openapi({
      description: 'حزمته الكتالوج كله (المدير العام): لا تُحرَّر ولا تُخصَّص عضوياته.',
    }),
    customizedAt: z.iso.datetime().nullable().openapi({
      description: 'آخر تحرير من شاشة الأدوار. ما دام `null` تعيده المزامنة إلى البذرة.',
    }),
    activeMembers: z.number().int(),
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
    officeScoped: z.boolean().optional().openapi({
      description: 'تسري في مكتب العضوية وأقسامه فقط، لا في المنظمة كلها.',
    }),
    tier: z.enum(['ADMIN']).optional().openapi({
      description: 'قدرة إدارية لا يمنحها ولا ينزعها إلا حامل roles.manage.',
    }),
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

const staffCapabilities = z
  .array(z.enum(STAFF_CAPABILITIES as [string, ...string[]]))
  .max(100)

export const createRoleBodySchema = z.object({
  nameAr: z.string().trim().min(2, 'اسم الدور قصير جدًا.').max(160),
  descriptionAr: z.string().trim().max(1000).nullable().optional(),
  officeId: z.uuid().nullable().optional(),
  capabilities: staffCapabilities,
})

export const updateRoleBodySchema = createRoleBodySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا شيء للتعديل.',
  })

const roleIdResponse = registry.register(
  'RoleIdResponse',
  z.object({ data: z.object({ id: z.uuid() }) }),
)

const roleEditDescription =
  'يتطلب roles.manage. كل قدرة في الحزمة — قبل التعديل وبعده — يجب أن يحملها المنفّذ، وتغيير أي قدرة إدارية (tier ADMIN) محصور بمن يحمل القدرات الإدارية كلها. أدوار الشريك ودور المدير العام لا تُحرَّر.'

registry.registerPath({
  method: 'post',
  path: path('/roles'),
  tags: ['Organization'],
  summary: 'إنشاء دور فريق',
  description: `${roleEditDescription} الدور الجديد غير نظامي، ويمكن حذفه ما لم يُسنَد.`,
  security,
  request: {
    body: { content: { 'application/json': { schema: createRoleBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُنشئ الدور',
      content: { 'application/json': { schema: roleIdResponse } },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك roles.manage أو قدرة في الحزمة'),
    422: problemResponse('بيانات غير صالحة'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/roles/{id}'),
  tags: ['Organization'],
  summary: 'تحرير دور فريق',
  description: `${roleEditDescription} التحرير يغيّر صلاحيات كل من يحمل الدور، ويجعل المزامنة تتركه كما هو.`,
  security,
  request: {
    params: z.object({ id: z.uuid() }),
    body: { content: { 'application/json': { schema: updateRoleBodySchema } } },
  },
  responses: {
    200: {
      description: 'حُرِّر الدور',
      content: { 'application/json': { schema: roleIdResponse } },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك roles.manage أو قدرة في الحزمة'),
    404: problemResponse('لا يوجد دور بهذا المعرّف'),
    422: problemResponse('بيانات غير صالحة، أو دور شريك، أو دور المدير العام'),
  },
})

registry.registerPath({
  method: 'delete',
  path: path('/roles/{id}'),
  tags: ['Organization'],
  summary: 'حذف دور لم يُسنَد',
  description: `${roleEditDescription} أدوار النظام لا تُحذف، والدور المُسنَد في أي عضوية أو دعوة لا يُحذف.`,
  security,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: 'حُذف' },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك roles.manage أو قدرة في الحزمة'),
    404: problemResponse('لا يوجد دور بهذا المعرّف'),
    409: problemResponse('الدور مُسنَد'),
    422: problemResponse('دور نظام أو دور شريك أو دور المدير العام'),
  },
})

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>
