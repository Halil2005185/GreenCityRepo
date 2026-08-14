import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { emailField } from '../auth/auth.schemas.js'

const path = (suffix: string) => `${env.API_PREFIX}/admin/invitations${suffix}`
const security = [{ [bearerAuth.name]: [] }]

export const createInvitationBodySchema = z.object({
  email: emailField,
  fullNameAr: z.string().min(3).max(160).optional(),
  roleId: z.uuid('يجب اختيار دور.'),
  /** إلزامي حين يكون نطاق الدور `STAFF`. */
  officeId: z.uuid().optional(),
  /** إلزامي حين يكون نطاق الدور `PARTNER`، والجهة يجب أن تكون نشطة. */
  partnerId: z.uuid().optional(),
})

export const invitationSchema = registry.register(
  'Invitation',
  z.object({
    id: z.uuid(),
    email: z.email(),
    fullNameAr: z.string().nullable(),
    kind: z.enum(['STAFF', 'PARTNER']),
    status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']),
    roleId: z.uuid(),
    roleNameAr: z.string(),
    officeId: z.uuid().nullable(),
    officeNameAr: z.string().nullable(),
    partnerId: z.uuid().nullable(),
    partnerNameAr: z.string().nullable(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    acceptedAt: z.iso.datetime().nullable(),
  }),
)

export const createInvitationResponseSchema = registry.register(
  'CreateInvitationResponse',
  z.object({
    invitation: invitationSchema,
    inviteUrl: z.url().openapi({
      description:
        'الرابط يعود مرة واحدة عند الإنشاء ولا يمكن استرجاعه لاحقًا، لأن القاعدة تحفظ تجزئته لا نصه. يُنسخ ويُرسل يدويًا حتى تُوصَل وحدة البريد.',
    }),
  }),
)

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Invitations'],
  summary: 'إرسال دعوة',
  description:
    'نوع الحساب يُشتق من نطاق الدور لا من الطلب. دور بنطاق فريق يلزمه مكتب.',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createInvitationBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُنشئت الدعوة',
      content: {
        'application/json': { schema: createInvitationResponseSchema },
      },
    },
    403: problemResponse('لا تملك صلاحية إدارة الدعوات'),
    409: problemResponse('يوجد حساب بهذا البريد'),
    422: problemResponse('بيانات غير صالحة'),
  },
})

export const listInvitationsQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']).optional(),
})

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Invitations'],
  summary: 'قائمة الدعوات',
  security,
  request: { query: listInvitationsQuerySchema },
  responses: {
    200: {
      description: 'الدعوات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(invitationSchema) }),
        },
      },
    },
    403: problemResponse('لا تملك صلاحية إدارة الدعوات'),
  },
})

export const invitationIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'post',
  path: path('/{id}/revoke'),
  tags: ['Invitations'],
  summary: 'إلغاء دعوة معلّقة',
  security,
  request: { params: invitationIdParamsSchema },
  responses: {
    204: { description: 'أُلغيت' },
    403: problemResponse('لا تملك صلاحية إدارة الدعوات'),
    404: problemResponse('الدعوة غير موجودة أو ليست معلّقة'),
  },
})

export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>
