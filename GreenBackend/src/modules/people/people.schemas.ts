import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const path = (suffix: string) => `${env.API_PREFIX}/admin/people${suffix}`
const security = [{ [bearerAuth.name]: [] }]

export const userStatusEnum = z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED'])

export const membershipSummarySchema = registry.register(
  'TeamMembership',
  z.object({
    id: z.uuid(),
    officeId: z.uuid(),
    officeSlug: z.string(),
    officeNameAr: z.string(),
    roleId: z.uuid(),
    roleSlug: z.string(),
    roleNameAr: z.string(),
    isPrimary: z.boolean(),
    status: z.enum(['ACTIVE', 'ENDED']),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
  }),
)

export const teamMemberSchema = registry.register(
  'TeamMember',
  z.object({
    id: z.uuid(),
    email: z.email(),
    fullNameAr: z.string(),
    status: userStatusEnum,
    emailVerifiedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    /** العضويات النشطة وحدها في القائمة؛ التفصيل يحمل المنتهية أيضًا. */
    memberships: z.array(membershipSummarySchema),
  }),
)

export const listPeopleQuerySchema = z.object({
  officeId: z.uuid().optional(),
  status: userStatusEnum.optional(),
  /** بحث جزئي غير حساس لحالة الأحرف على الاسم أو البريد. */
  q: z.string().trim().min(1).max(160).optional(),
})

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['People'],
  summary: 'دليل الفريق',
  description:
    'أعضاء الفريق وعضوياتهم النشطة. لا يشمل ممثلي الشركاء: هؤلاء يُقرأون من سجل الشركاء لأن نطاقهم جهتهم لا مكتبًا.',
  security,
  request: { query: listPeopleQuerySchema },
  responses: {
    200: {
      description: 'الأعضاء',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(teamMemberSchema) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة users.view'),
  },
})

// لا مخطط مستقل للتفصيل: الشكل نفسه، والفرق أن `memberships` تحمل
// المنتهية أيضًا. نوع ثانٍ مطابق يضاعف الصيانة ولا يضيف عقدًا.
registry.registerPath({
  method: 'get',
  path: path('/{id}'),
  tags: ['People'],
  summary: 'ملف عضو الفريق',
  description:
    'يشمل العضويات المنتهية كتاريخ. المهام المسندة تُقرأ من `/admin/work?assigneeUserId=` بدل تكرارها هنا.',
  security,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'العضو',
      content: {
        'application/json': {
          schema: z.object({ data: teamMemberSchema }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة users.view'),
    404: problemResponse('لا يوجد عضو فريق بهذا المعرّف'),
  },
})

export const addMembershipBodySchema = z.object({
  officeId: z.uuid('يجب اختيار المكتب.'),
  roleId: z.uuid('يجب اختيار الدور.'),
})

export const addMembershipResponseSchema = registry.register(
  'AddMembershipResponse',
  z.object({ data: z.object({ id: z.uuid() }) }),
)

registry.registerPath({
  method: 'post',
  path: path('/{id}/memberships'),
  tags: ['People'],
  summary: 'إضافة عضوية إضافية لعضو فريق قائم',
  description:
    'يتطلب roles.manage — المدير العام حصرًا اليوم. يضيف مكتبًا ودورًا جديدين للعضو دون إنهاء عضوياته الحالية؛ العضوية الجديدة غير رئيسية.',
  security,
  request: {
    params: z.object({ id: z.uuid() }),
    body: {
      content: { 'application/json': { schema: addMembershipBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيفت العضوية',
      content: { 'application/json': { schema: addMembershipResponseSchema } },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة roles.manage'),
    404: problemResponse('لا يوجد عضو فريق بهذا المعرّف'),
    409: problemResponse('العضو لديه عضوية نشطة في هذا المكتب بالفعل'),
    422: problemResponse('بيانات غير صالحة'),
  },
})

export const updateMembershipBodySchema = z
  .object({
    officeId: z.uuid().optional(),
    roleId: z.uuid().optional(),
  })
  .refine((data) => Boolean(data.officeId) || Boolean(data.roleId), {
    message: 'حدّد المكتب أو الدور أو كليهما.',
  })

registry.registerPath({
  method: 'patch',
  path: path('/{id}/memberships/{membershipId}'),
  tags: ['People'],
  summary: 'تعديل عضوية قائمة',
  description:
    'يتطلب roles.manage. يغيّر المكتب أو الدور أو كليهما على عضوية نشطة؛ لا يمسّ عضويات أخرى ولا `isPrimary`.',
  security,
  request: {
    params: z.object({ id: z.uuid(), membershipId: z.uuid() }),
    body: {
      content: { 'application/json': { schema: updateMembershipBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّلت العضوية',
      content: { 'application/json': { schema: addMembershipResponseSchema } },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة roles.manage'),
    404: problemResponse('لا توجد عضوية بهذا المعرّف'),
    409: problemResponse('العضو لديه عضوية نشطة في هذا المكتب بالفعل'),
    422: problemResponse('بيانات غير صالحة، أو العضوية منتهية'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/memberships/{membershipId}/end'),
  tags: ['People'],
  summary: 'إنهاء عضوية قائمة',
  description: 'يتطلب roles.manage. يُنهي عضوية نشطة (سحب صلاحيتها)؛ لا يحذف سجلها.',
  security,
  request: { params: z.object({ id: z.uuid(), membershipId: z.uuid() }) },
  responses: {
    204: { description: 'أُنهيت' },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك القدرة roles.manage'),
    404: problemResponse('لا توجد عضوية بهذا المعرّف'),
    422: problemResponse('العضوية منتهية بالفعل'),
  },
})

export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>
export type AddMembershipBody = z.infer<typeof addMembershipBodySchema>
export type UpdateMembershipBody = z.infer<typeof updateMembershipBodySchema>
