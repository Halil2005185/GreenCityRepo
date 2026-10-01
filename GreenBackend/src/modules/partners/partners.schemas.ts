import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import {
  lookupRefSchema,
  optionalLookupRefSchema,
} from '../lookups/lookup-ref.schema.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/partners${suffix}`

export const partnerStageEnum = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATION',
  'PENDING_APPROVAL',
  'ACTIVE',
  'ON_HOLD',
  'REJECTED',
  'ENDED',
])

export const partnershipTypeEnum = z.enum([
  'STRATEGIC',
  'EXECUTIVE',
  'TECHNICAL',
  'MEDIA',
  'EVENT',
])

// ── التمثيلات ──────────────────────────────────────────────────────────

export const partnerSummarySchema = registry.register(
  'PartnerSummary',
  z.object({
    id: z.uuid(),
    displayNameAr: z.string(),
    legalNameAr: z.string(),
    organizationKind: lookupRefSchema,
    stage: partnerStageEnum,
    isSuspended: z.boolean(),
    partnershipTypes: z.array(partnershipTypeEnum),
    accountManagerNameAr: z.string().nullable(),
    primaryContactNameAr: z.string().nullable(),
    publicNameConsent: z.boolean(),
    publicLogoConsent: z.boolean(),
    // محاور تصنيف العلاقة — من التعريفات نفسها التي على الإعلاميين.
    contactPriority: lookupRefSchema,
    engagementHorizon: optionalLookupRefSchema,
    relationshipType: optionalLookupRefSchema,
    mediaChannels: z.array(lookupRefSchema),
    lastContactAt: z.iso.datetime().nullable(),
    activatedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  }),
)

export const partnerContactSchema = registry.register(
  'PartnerContact',
  z.object({
    id: z.uuid(),
    fullNameAr: z.string(),
    jobTitleAr: z.string().nullable(),
    email: z.email().nullable(),
    phone: z.string().nullable(),
    isPrimary: z.boolean(),
    status: z.enum(['ACTIVE', 'ENDED']),
    hasAccount: z.boolean().openapi({
      description: 'صحيح حين قبل هذا الشخص دعوة البوابة وصار له حساب.',
    }),
  }),
)

export const partnershipSchema = registry.register(
  'Partnership',
  z.object({
    id: z.uuid(),
    type: partnershipTypeEnum,
    status: z.enum(['PROPOSED', 'APPROVED', 'PAUSED', 'ENDED']),
    approvedAt: z.iso.datetime().nullable(),
    approvedByNameAr: z.string().nullable(),
    notesAr: z.string().nullable(),
  }),
)

export const consentEventSchema = registry.register(
  'PartnerConsentEvent',
  z.object({
    id: z.uuid(),
    consentType: z.enum(['PUBLIC_NAME', 'PUBLIC_LOGO']),
    action: z.enum(['GRANTED', 'REVOKED']),
    source: z.enum(['ADMIN', 'PARTNER_SELF']),
    actedAt: z.iso.datetime(),
    actorNameAr: z.string().nullable(),
    noteAr: z.string().nullable(),
  }),
)

export const acknowledgementSchema = registry.register(
  'CharterAcknowledgement',
  z.object({
    id: z.uuid(),
    charterVersionId: z.uuid(),
    charterVersion: z.string(),
    acknowledgedAt: z.iso.datetime(),
    method: lookupRefSchema,
    acknowledgedByNameAr: z.string(),
    acknowledgedByTitleAr: z.string().nullable(),
    noteAr: z.string().nullable(),
  }),
)

export const interactionSchema = registry.register(
  'PartnerInteraction',
  z.object({
    id: z.uuid(),
    /** رمز `STAGE_CHANGE` سجلٌّ تركه نقل المرحلة، لا تواصل سجّله أحد. */
    kind: lookupRefSchema,
    occurredAt: z.iso.datetime(),
    summaryAr: z.string(),
    bodyAr: z.string().nullable(),
    recordedByNameAr: z.string().nullable(),
    partnerVisible: z.boolean(),
  }),
)

/**
 * شروط التفعيل الثلاثة محسوبة على الخادم وتُعاد مع التفاصيل.
 *
 * إعادتها دائمًا — لا عند الفشل فقط — تجعل صفحة الشريك تعرض قائمة تحقق
 * حيّة، فيعرف مكتب العلاقات ما ينقص قبل أن يطلب الاعتماد بدل أن يكتشفه
 * برسالة خطأ.
 */
export const activationRequirementsSchema = registry.register(
  'ActivationRequirements',
  z.object({
    satisfied: z.boolean(),
    requirements: z.array(
      z.object({
        key: z.enum(['PRIMARY_CONTACT', 'APPROVED_PARTNERSHIP', 'CHARTER_ACKNOWLEDGEMENT']),
        labelAr: z.string(),
        satisfied: z.boolean(),
      }),
    ),
  }),
)

export const partnerDetailSchema = registry.register(
  'PartnerDetail',
  partnerSummarySchema.extend({
    nameEn: z.string().nullable(),
    slug: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    summaryAr: z.string().nullable(),
    supportForms: z.array(lookupRefSchema),
    accountManagerId: z.uuid().nullable(),
    /** لا يظهر إلا لمن يملك `partners.notes.view`؛ غيره يراه null. */
    internalNotesAr: z.string().nullable(),
    rejectionReasonAr: z.string().nullable(),
    suspensionReasonAr: z.string().nullable(),
    suspendedAt: z.iso.datetime().nullable(),
    contacts: z.array(partnerContactSchema),
    partnerships: z.array(partnershipSchema),
    consentEvents: z.array(consentEventSchema),
    acknowledgements: z.array(acknowledgementSchema),
    interactions: z.array(interactionSchema),
    activation: activationRequirementsSchema,
  }),
)

// ── المسارات ───────────────────────────────────────────────────────────

export const listPartnersQuerySchema = z.object({
  stage: partnerStageEnum.optional(),
  type: partnershipTypeEnum.optional(),
  q: z.string().max(120).optional(),
  contactPriorityId: z.uuid().optional(),
  engagementHorizonId: z.uuid().optional(),
  relationshipTypeId: z.uuid().optional(),
  channelId: z.uuid().optional(),
  /** من لم يُسجَّل له تواصل قط داخل في النتيجة: غيابه أشد دلالة من قِدَمه. */
  staleDays: z.coerce.number().int().min(1).max(3650).optional(),
})

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Partners'],
  summary: 'سجل الشركاء',
  security,
  request: { query: listPartnersQuerySchema },
  responses: {
    200: {
      description: 'الشركاء',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(partnerSummarySchema) }),
        },
      },
    },
    403: problemResponse('لا تملك صلاحية عرض الشركاء'),
  },
})

export const createPartnerBodySchema = z.object({
  legalNameAr: z.string().min(2).max(200),
  displayNameAr: z.string().min(2).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  // القيم من تعريفات النظام بمعرّفاتها؛ الخدمة تتحقق أن كلًّا من تعريفه.
  organizationKindId: z.uuid(),
  websiteUrl: z.url().max(500).optional(),
  summaryAr: z.string().max(2000).optional(),
  supportFormIds: z.array(z.uuid()).max(30).default([]),
  accountManagerId: z.uuid().optional(),
  internalNotesAr: z.string().max(4000).optional(),

  // محاور تصنيف العلاقة — اختيارية كلها، فالجهة تُسجَّل أولًا وتُصنَّف بعد
  // أول مكالمة لا قبلها. الأولوية الغائبة تصير `MEDIUM`.
  contactPriorityId: z.uuid().optional(),
  engagementHorizonId: z.uuid().optional(),
  relationshipTypeId: z.uuid().optional(),
  mediaChannelIds: z.array(z.uuid()).max(20).default([]),
  lastContactAt: z.iso.datetime().optional(),
})

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Partners'],
  summary: 'تسجيل جهة محتملة',
  description: 'تبدأ في المرحلة `NEW`. الاعتماد النهائي مسار منفصل.',
  security,
  request: {
    body: { content: { 'application/json': { schema: createPartnerBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُنشئت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
    403: problemResponse('لا تملك صلاحية إدارة الشركاء'),
  },
})

export const partnerIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: path('/{id}'),
  tags: ['Partners'],
  summary: 'ملف الجهة كاملًا',
  security,
  request: { params: partnerIdParamsSchema },
  responses: {
    200: {
      description: 'الملف',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
    404: problemResponse('الجهة غير موجودة'),
  },
})

export const updatePartnerBodySchema = createPartnerBodySchema
  .partial()
  .omit({ supportFormIds: true, mediaChannelIds: true })
  .extend({
    supportFormIds: z.array(z.uuid()).max(30).optional(),
    mediaChannelIds: z.array(z.uuid()).max(20).optional(),
    // `nullable` على الاختيارية وحدها: مسح نوع العلاقة قرار مشروع، بخلاف
    // الأولوية التي لها دائمًا قيمة.
    engagementHorizonId: z.uuid().nullable().optional(),
    relationshipTypeId: z.uuid().nullable().optional(),
    lastContactAt: z.iso.datetime().nullable().optional(),
  })

registry.registerPath({
  method: 'patch',
  path: path('/{id}'),
  tags: ['Partners'],
  summary: 'تعديل ملف الجهة',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: { content: { 'application/json': { schema: updatePartnerBodySchema } } },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

export const changeStageBodySchema = z.object({
  stage: z.enum([
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'NEGOTIATION',
    'PENDING_APPROVAL',
    'ON_HOLD',
  ]),
  noteAr: z.string().max(1000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/stage'),
  tags: ['Partners'],
  summary: 'نقل الجهة في خط المتابعة',
  description:
    'لا يشمل `ACTIVE` و`REJECTED` و`ENDED`: تلك قرارات لها مساراتها وشروطها.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: { content: { 'application/json': { schema: changeStageBodySchema } } },
  },
  responses: {
    200: {
      description: 'نُقلت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

export const createContactBodySchema = z
  .object({
    fullNameAr: z.string().min(3).max(160),
    jobTitleAr: z.string().max(160).optional(),
    email: z.email().max(254).optional(),
    phone: z.string().max(32).optional(),
    isPrimary: z.boolean().default(false),
    notesAr: z.string().max(2000).optional(),
  })
  .refine((value) => Boolean(value.email ?? value.phone), {
    message: 'يلزم بريد إلكتروني أو رقم هاتف على الأقل.',
    path: ['email'],
  })

registry.registerPath({
  method: 'post',
  path: path('/{id}/contacts'),
  tags: ['Partners'],
  summary: 'إضافة جهة اتصال',
  description:
    'تعيين جهة اتصال رئيسية جديدة ينزع الصفة عن السابقة في المعاملة نفسها.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: { content: { 'application/json': { schema: createContactBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُضيفت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

export const createPartnershipBodySchema = z.object({
  type: partnershipTypeEnum,
  notesAr: z.string().max(2000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/partnerships'),
  tags: ['Partners'],
  summary: 'اقتراح نوع شراكة',
  description:
    'يُنشأ بحالة `PROPOSED`. اعتماده يحتاج `partners.approve` — أي المدير العام.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: {
      content: { 'application/json': { schema: createPartnershipBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
    409: problemResponse('النوع مسجّل بالفعل لهذه الجهة'),
    422: problemResponse('شراكة الفعالية تحتاج مبادرة — تُفعَّل في المرحلة الثالثة'),
  },
})

export const partnershipIdParamsSchema = z.object({
  id: z.uuid(),
  partnershipId: z.uuid(),
})

export const updatePartnershipBodySchema = z.object({
  status: z.enum(['APPROVED', 'PAUSED', 'ENDED']),
  notesAr: z.string().max(2000).optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/{id}/partnerships/{partnershipId}'),
  tags: ['Partners'],
  summary: 'اعتماد نوع الشراكة أو تعليقه أو إنهاؤه',
  security,
  request: {
    params: partnershipIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updatePartnershipBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'حُدِّث',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
    403: problemResponse('الاعتماد يحتاج صلاحية المدير العام'),
  },
})

export const consentBodySchema = z.object({
  consentType: z.enum(['PUBLIC_NAME', 'PUBLIC_LOGO']),
  action: z.enum(['GRANTED', 'REVOKED']),
  actorNameAr: z.string().max(160).optional(),
  noteAr: z.string().max(1000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/consent'),
  tags: ['Partners'],
  summary: 'تسجيل منح موافقة الإظهار أو سحبها',
  description:
    'يُضاف حدث ويُحدَّث العمود المرآة في معاملة واحدة. الموافقة مستقلة عن حالة الشراكة ولا تمنع التفعيل.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: { content: { 'application/json': { schema: consentBodySchema } } },
  },
  responses: {
    200: {
      description: 'سُجِّلت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

export const acknowledgementBodySchema = z.object({
  charterVersionId: z.uuid().optional(),
  acknowledgedAt: z.iso.datetime().optional(),
  methodId: z.uuid(),
  acknowledgedByContactId: z.uuid().optional(),
  acknowledgedByNameAr: z.string().min(3).max(160),
  acknowledgedByTitleAr: z.string().max(160).optional(),
  noteAr: z.string().max(1000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/charter-acknowledgements'),
  tags: ['Partners'],
  summary: 'تسجيل إقرار بالميثاق',
  description:
    'سجل إضافي فقط. `acknowledgedAt` منفصل عن وقت التسجيل لأن الإقرار قد يكون تمّ في اجتماع أو على ورق قبل إدخاله.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: {
      content: { 'application/json': { schema: acknowledgementBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'سُجِّل',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
    422: problemResponse('لا يوجد إصدار منشور من الميثاق'),
  },
})

export const interactionBodySchema = z.object({
  kindId: z.uuid().openapi({
    description: 'من `INTERACTION_KIND`. `STAGE_CHANGE` يكتبه النظام وحده فيُرفض هنا.',
  }),
  occurredAt: z.iso.datetime().optional(),
  summaryAr: z.string().min(3).max(300),
  bodyAr: z.string().max(4000).optional(),
  partnerVisible: z.boolean().default(false),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/interactions'),
  tags: ['Partners'],
  summary: 'تسجيل تواصل أو ملاحظة',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: { content: { 'application/json': { schema: interactionBodySchema } } },
  },
  responses: {
    201: {
      description: 'سُجِّل',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/activate'),
  tags: ['Partners'],
  summary: 'الاعتماد النهائي للشراكة',
  description:
    'المدير العام وحده. يتحقق من الشروط الثلاثة: جهة اتصال رئيسية نشطة، ونوع شراكة معتمد واحد على الأقل، وإقرار بالإصدار الساري من الميثاق. موافقة الإظهار ليست شرطًا.',
  security,
  request: { params: partnerIdParamsSchema },
  responses: {
    200: {
      description: 'فُعِّلت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
    403: problemResponse('الاعتماد للمدير العام وحده'),
    422: problemResponse('شروط التفعيل غير مكتملة — التفاصيل تعدّد الناقص'),
  },
})

export const rejectPartnerBodySchema = z.object({
  rejectionReasonAr: z.string().min(3).max(1000),
  decisionNoteAr: z.string().max(2000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/reject'),
  tags: ['Partners'],
  summary: 'رفض الشراكة',
  description: '`rejectionReasonAr` يُبلَّغ للجهة، و`decisionNoteAr` داخلي.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: {
      content: { 'application/json': { schema: rejectPartnerBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'رُفضت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

export const suspendPartnerBodySchema = z.object({
  suspensionReasonAr: z.string().min(3).max(1000),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/suspend'),
  tags: ['Partners'],
  summary: 'تعليق جهة نشطة مؤقتًا',
  description: 'محور مستقل عن المرحلة: التعليق لا يعيد الجهة إلى التفاوض.',
  security,
  request: {
    params: partnerIdParamsSchema,
    body: {
      content: { 'application/json': { schema: suspendPartnerBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُلِّقت',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/restore'),
  tags: ['Partners'],
  summary: 'رفع التعليق',
  security,
  request: { params: partnerIdParamsSchema },
  responses: {
    200: {
      description: 'رُفع',
      content: { 'application/json': { schema: partnerDetailSchema } },
    },
  },
})

export type ListPartnersQuery = z.infer<typeof listPartnersQuerySchema>
export type CreatePartnerBody = z.infer<typeof createPartnerBodySchema>
export type UpdatePartnerBody = z.infer<typeof updatePartnerBodySchema>
export type ChangeStageBody = z.infer<typeof changeStageBodySchema>
export type CreateContactBody = z.infer<typeof createContactBodySchema>
export type CreatePartnershipBody = z.infer<typeof createPartnershipBodySchema>
export type UpdatePartnershipBody = z.infer<typeof updatePartnershipBodySchema>
export type ConsentBody = z.infer<typeof consentBodySchema>
export type AcknowledgementBody = z.infer<typeof acknowledgementBodySchema>
export type InteractionBody = z.infer<typeof interactionBodySchema>
export type RejectPartnerBody = z.infer<typeof rejectPartnerBodySchema>
export type SuspendPartnerBody = z.infer<typeof suspendPartnerBodySchema>
