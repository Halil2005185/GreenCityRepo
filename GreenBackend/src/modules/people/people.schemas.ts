import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { STAFF_CAPABILITIES } from '../access/capabilities.js'

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
    403: problemResponse('لا يملك users.view ولا team.manage'),
  },
})

const staffCapabilityEnum = z.enum(STAFF_CAPABILITIES as [string, ...string[]])

export const capabilityOverrideSchema = registry.register(
  'CapabilityOverride',
  z.object({
    capability: z.string(),
    effect: z.enum(['GRANT', 'REVOKE']),
  }),
)

export const membershipDetailSchema = registry.register(
  'TeamMembershipDetail',
  membershipSummarySchema.extend({
    roleCapabilities: z.array(z.string()).openapi({
      description: 'حزمة الدور كما هي، قبل الاستثناءات.',
    }),
    overrides: z.array(capabilityOverrideSchema),
    effective: z.array(z.string()).openapi({
      description: 'حزمة الدور مع الممنوح وناقص المنزوع — ما يملكه فعلًا في هذا الفريق.',
    }),
    canManage: z.boolean().openapi({
      description:
        'من منظور المستخدم الحالي: يستطيع تعديل هذه العضوية أو إنهاءها. نفس قرار مسارات الكتابة.',
    }),
    canCustomize: z.boolean().openapi({
      description: 'يستطيع تخصيص صلاحياتها؛ عضوية المدير العام لا تُخصَّص.',
    }),
  }),
)

export const teamMemberDetailSchema = registry.register(
  'TeamMemberDetail',
  teamMemberSchema.extend({ memberships: z.array(membershipDetailSchema) }),
)

registry.registerPath({
  method: 'get',
  path: path('/{id}'),
  tags: ['People'],
  summary: 'ملف عضو الفريق',
  description:
    'يشمل العضويات المنتهية كتاريخ، ولكل عضوية حزمة دورها واستثناءاتها وقدراتها الفعلية. مدير الفريق بلا users.view يرى أعضاء فرقه وحدهم. المهام المسندة تُقرأ من `/admin/work?assigneeUserId=` بدل تكرارها هنا.',
  security,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'العضو',
      content: {
        'application/json': {
          schema: z.object({ data: teamMemberDetailSchema }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك users.view ولا team.manage'),
    404: problemResponse('لا يوجد عضو فريق بهذا المعرّف ضمن نطاقك'),
  },
})

export const candidatesQuerySchema = z.object({
  q: z.string().trim().min(2, 'اكتب حرفين على الأقل.').max(160),
})

export const candidateSchema = registry.register(
  'TeamCandidate',
  z.object({ id: z.uuid(), fullNameAr: z.string(), email: z.email() }),
)

registry.registerPath({
  method: 'get',
  path: path('/candidates'),
  tags: ['People'],
  summary: 'بحث عن زميل لضمّه إلى فريق',
  description:
    'الاسم والبريد وحدهما لأعضاء الفريق النشطين، عشرون نتيجة على الأكثر. لمدير الفريق الذي لا يرى الدليل كله.',
  security,
  request: { query: candidatesQuerySchema },
  responses: {
    200: {
      description: 'المرشحون',
      content: {
        'application/json': { schema: z.object({ data: z.array(candidateSchema) }) },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse('لا يملك users.view ولا team.manage'),
  },
})

export const setMembershipCapabilitiesBodySchema = z
  .object({
    grants: z.array(staffCapabilityEnum).max(100),
    revokes: z.array(staffCapabilityEnum).max(100),
  })
  .refine(
    (data) => !data.grants.some((capability) => data.revokes.includes(capability)),
    { message: 'لا تُمنح قدرة وتُنزع في الوقت نفسه.', path: ['revokes'] },
  )

registry.registerPath({
  method: 'put',
  path: path('/{id}/memberships/{membershipId}/capabilities'),
  tags: ['People'],
  summary: 'تخصيص صلاحيات عضوية',
  description:
    'يستبدل الاستثناءات الفردية كلها بما يُرسَل. `grants` قدرات تُضاف فوق حزمة الدور، و`revokes` قدرات تُنزع منها؛ ما لا أثر له يُهمل. يتطلب إدارة فريق العضوية، وكل قدرة يتغيّر وضعها يجب أن يستطيع المنفّذ تفويضها. لا يُنفَّذ على الحساب نفسه ولا على عضوية المدير العام.',
  security,
  request: {
    params: z.object({ id: z.uuid(), membershipId: z.uuid() }),
    body: {
      content: {
        'application/json': { schema: setMembershipCapabilitiesBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: 'القدرات الفعلية بعد الحفظ',
      content: {
        'application/json': {
          schema: z.object({ data: z.object({ effective: z.array(z.string()) }) }),
        },
      },
    },
    401: problemResponse('غير مصادق'),
    403: problemResponse(
      'لا يدير فريق العضوية، أو يغيّر قدرة لا يملك تفويضها، أو الحساب حسابه',
    ),
    404: problemResponse('لا توجد عضوية بهذا المعرّف'),
    422: problemResponse('بيانات غير صالحة، أو العضوية منتهية، أو عضوية المدير العام'),
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
    'يتطلب إدارة الفريق المقصود (`team.manage` فيه أو `team.all`)، ودورًا يستطيع المنفّذ تفويض قدراته فيه، ولا يُنفَّذ على الحساب نفسه. يضيف مكتبًا ودورًا جديدين للعضو دون إنهاء عضوياته الحالية؛ العضوية الجديدة غير رئيسية.',
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
    403: problemResponse(
      'لا يدير الفريق، أو الدور أو العضوية تتجاوز ما يستطيع تفويضه، أو الحساب حسابه',
    ),
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
    'يتطلب إدارة فريق العضوية — والفريق الجديد إن نُقلت — ولا يُنفَّذ على الحساب نفسه. قدرات العضوية الفعلية والدور الجديد كلاهما مما يستطيع المنفّذ تفويضه. يغيّر المكتب أو الدور أو كليهما على عضوية نشطة، وتسقط معه استثناءاتها الفردية؛ لا يمسّ عضويات أخرى ولا `isPrimary`.',
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
    403: problemResponse(
      'لا يدير الفريق، أو الدور أو العضوية تتجاوز ما يستطيع تفويضه، أو الحساب حسابه',
    ),
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
  description:
    'يتطلب إدارة فريق العضوية، ولا يُنفَّذ على الحساب نفسه ولا على عضوية قدراتها الفعلية أوسع مما يستطيع المنفّذ تفويضه. يُنهي عضوية نشطة (سحب صلاحيتها)؛ لا يحذف سجلها.',
  security,
  request: { params: z.object({ id: z.uuid(), membershipId: z.uuid() }) },
  responses: {
    204: { description: 'أُنهيت' },
    401: problemResponse('غير مصادق'),
    403: problemResponse(
      'لا يدير الفريق، أو الدور أو العضوية تتجاوز ما يستطيع تفويضه، أو الحساب حسابه',
    ),
    404: problemResponse('لا توجد عضوية بهذا المعرّف'),
    422: problemResponse('العضوية منتهية بالفعل'),
  },
})

export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>
export type CandidatesQuery = z.infer<typeof candidatesQuerySchema>
export type AddMembershipBody = z.infer<typeof addMembershipBodySchema>
export type UpdateMembershipBody = z.infer<typeof updateMembershipBodySchema>
export type SetMembershipCapabilitiesBody = z.infer<
  typeof setMembershipCapabilitiesBodySchema
>
