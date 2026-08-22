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

export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>
