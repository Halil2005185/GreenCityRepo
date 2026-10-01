import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import {
  lookupRefSchema,
  optionalLookupRefSchema,
} from '../lookups/lookup-ref.schema.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/media${suffix}`

export const mediaContactStageEnum = z.enum([
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'COLLABORATING',
  'DORMANT',
  'DECLINED',
])

// ── التمثيلات ──────────────────────────────────────────────────────────

export const mediaContactSummarySchema = registry.register(
  'MediaContactSummary',
  z.object({
    id: z.uuid(),
    fullNameAr: z.string(),
    jobTitleAr: z.string().nullable(),
    outletNameAr: z.string().nullable(),
    partnerId: z.uuid().nullable(),
    partnerNameAr: z.string().nullable(),
    email: z.email().nullable(),
    phone: z.string().nullable(),
    stage: mediaContactStageEnum,
    // محاور التصنيف من تعريفات النظام نفسها التي على الشركاء.
    priority: lookupRefSchema,
    horizon: optionalLookupRefSchema,
    relationshipType: optionalLookupRefSchema,
    channels: z.array(lookupRefSchema),
    accountManagerNameAr: z.string().nullable(),
    lastContactAt: z.iso.datetime().nullable(),
    /** عدد المتابعات المستحقة غير المنجزة — شارة حمراء في القائمة. */
    openFollowUps: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
)

export const mediaInteractionSchema = registry.register(
  'MediaContactInteraction',
  z.object({
    id: z.uuid(),
    kind: lookupRefSchema,
    occurredAt: z.iso.datetime(),
    summaryAr: z.string(),
    bodyAr: z.string().nullable(),
    dueAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    /** يُحسب على ساعة الخادم: ساعة المتصفح قد تكون مضبوطة خطأً. */
    isOverdue: z.boolean(),
    recordedByNameAr: z.string().nullable(),
  }),
)

export const mediaContactDetailSchema = registry.register(
  'MediaContactDetail',
  mediaContactSummarySchema.extend({
    nameEn: z.string().nullable(),
    profileUrl: z.string().nullable(),
    accountManagerId: z.uuid().nullable(),
    internalNotesAr: z.string().nullable().openapi({
      description: 'لا تخرج إلا لمن يملك `media.notes.view`؛ غيره يقرأ null.',
    }),
    interactions: z.array(mediaInteractionSchema),
  }),
)

export const followUpSchema = registry.register(
  'MediaFollowUp',
  z.object({
    id: z.uuid(),
    contactId: z.uuid(),
    contactNameAr: z.string(),
    priority: lookupRefSchema,
    kind: lookupRefSchema,
    summaryAr: z.string(),
    dueAt: z.iso.datetime(),
    isOverdue: z.boolean(),
    recordedByNameAr: z.string().nullable(),
  }),
)

// ── القراءة ────────────────────────────────────────────────────────────

export const listContactsQuerySchema = z.object({
  stage: mediaContactStageEnum.optional(),
  priorityId: z.uuid().optional(),
  horizonId: z.uuid().optional(),
  channelId: z.uuid().optional(),
  relationshipTypeId: z.uuid().optional(),
  accountManagerId: z.uuid().optional(),
  q: z.string().min(1).max(120).optional(),
  /**
   * «من لم نكلّمه منذ ٣٠ يومًا» — السؤال الذي طلبه المكتب حين طلب عمود
   * «آخر تواصل». من لم يُسجَّل له تواصل قط يدخل في النتيجة: غيابه عن
   * السجل أشد دلالة من قِدَم تاريخه.
   */
  staleDays: z.coerce.number().int().min(1).max(3650).optional(),
  hasOpenFollowUp: z.stringbool().optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/contacts'),
  tags: ['Media'],
  summary: 'الشبكة الإعلامية',
  description:
    'سجل صنّاع المحتوى والإعلاميين — أشخاص لا جهات، ومستقل عن سجل الشركاء. الفرز الافتراضي بالأولوية ثم بأقدم تواصل، أي «من يجب أن أكلّمه اليوم».',
  security,
  request: { query: listContactsQuerySchema },
  responses: {
    200: {
      description: 'الأشخاص',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(mediaContactSummarySchema) }),
        },
      },
    },
  },
})

export const contactIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: path('/contacts/{id}'),
  tags: ['Media'],
  summary: 'ملف شخص من الشبكة الإعلامية',
  security,
  request: { params: contactIdParamsSchema },
  responses: {
    200: {
      description: 'الملف',
      content: { 'application/json': { schema: mediaContactDetailSchema } },
    },
    404: problemResponse('الشخص غير موجود'),
  },
})

export const listFollowUpsQuerySchema = z.object({
  /** الافتراضي المستحق اليوم وما فات؛ الرفع يُظهر ما هو قادم. */
  withinDays: z.coerce.number().int().min(0).max(365).default(0),
  mine: z.stringbool().default(false),
})

registry.registerPath({
  method: 'get',
  path: path('/follow-ups'),
  tags: ['Media'],
  summary: 'المتابعات المستحقة',
  description:
    'المتابعات التي حان موعدها ولم تُنجَز، عبر الشبكة كلها. هي ما يحوّل السجل من أرشيف إلى قائمة عمل يومية.',
  security,
  request: { query: listFollowUpsQuerySchema },
  responses: {
    200: {
      description: 'المتابعات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(followUpSchema) }),
        },
      },
    },
  },
})

// ── الكتابة ────────────────────────────────────────────────────────────

/**
 * `refine` لا `check` على مستوى الحقل: شرط «وسيلة تواصل واحدة على الأقل»
 * يقرأ ثلاثة حقول معًا، ورسالته يجب أن تصل كاملة لا موزّعة على ثلاثة.
 * القيد نفسه محروس في القاعدة (`media_contacts_reachable`)؛ هذا لتحسين
 * الرسالة لا لتعويضه.
 */
export const createContactBodySchema = z
  .object({
    fullNameAr: z.string().min(2).max(160),
    nameEn: z.string().max(160).optional(),
    jobTitleAr: z.string().max(160).optional(),

    email: z.email().max(254).optional(),
    phone: z.string().min(6).max(32).optional(),
    profileUrl: z.url().max(500).optional(),

    outletNameAr: z.string().max(200).optional(),
    partnerId: z.uuid().optional(),

    stage: mediaContactStageEnum.default('NEW'),
    // القيم من تعريفات النظام بمعرّفاتها. الأولوية الغائبة تصير `MEDIUM`.
    priorityId: z.uuid().optional(),
    horizonId: z.uuid().optional(),
    relationshipTypeId: z.uuid().optional(),
    channelIds: z.array(z.uuid()).max(20).default([]),

    accountManagerId: z.uuid().optional(),
    lastContactAt: z.iso.datetime().optional(),
    internalNotesAr: z.string().max(4000).optional(),
  })
  .refine(
    (body) => Boolean(body.email ?? body.phone ?? body.profileUrl),
    'يلزم بريد أو هاتف أو رابط حساب — سجل بلا وسيلة تواصل لا يُستعمل.',
  )

registry.registerPath({
  method: 'post',
  path: path('/contacts'),
  tags: ['Media'],
  summary: 'إضافة شخص إلى الشبكة الإعلامية',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createContactBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: mediaContactDetailSchema } },
    },
    409: problemResponse('البريد مسجّل لشخص آخر'),
    422: problemResponse('بيانات غير مكتملة'),
  },
})

/**
 * التعديل جزئي بلا `refine`: الشرط يُعاد فحصه في الخدمة على الصف بعد
 * الدمج، لأن طلبًا يمسح الهاتف وحده صالح شكلًا وقد يترك الصف بلا وسيلة.
 */
export const updateContactBodySchema = z.object({
  fullNameAr: z.string().min(2).max(160).optional(),
  nameEn: z.string().max(160).nullable().optional(),
  jobTitleAr: z.string().max(160).nullable().optional(),

  email: z.email().max(254).nullable().optional(),
  phone: z.string().min(6).max(32).nullable().optional(),
  profileUrl: z.url().max(500).nullable().optional(),

  outletNameAr: z.string().max(200).nullable().optional(),
  partnerId: z.uuid().nullable().optional(),

  priorityId: z.uuid().optional(),
  horizonId: z.uuid().nullable().optional(),
  relationshipTypeId: z.uuid().nullable().optional(),
  channelIds: z.array(z.uuid()).max(20).optional(),

  accountManagerId: z.uuid().nullable().optional(),
  lastContactAt: z.iso.datetime().nullable().optional(),
  internalNotesAr: z.string().max(4000).nullable().optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/contacts/{id}'),
  tags: ['Media'],
  summary: 'تعديل ملف شخص',
  description: 'المرحلة لها مسارها الخاص فتترك أثرًا في السجل.',
  security,
  request: {
    params: contactIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updateContactBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: { 'application/json': { schema: mediaContactDetailSchema } },
    },
    404: problemResponse('الشخص غير موجود'),
    409: problemResponse('البريد مسجّل لشخص آخر'),
  },
})

export const changeStageBodySchema = z.object({
  stage: mediaContactStageEnum,
  noteAr: z.string().max(1000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/contacts/{id}/stage'),
  tags: ['Media'],
  summary: 'نقل مرحلة التواصل',
  description: 'كل نقلة تُسجَّل في سجل المتابعة، فيبقى «لماذا صار خاملًا» مقروءًا.',
  security,
  request: {
    params: contactIdParamsSchema,
    body: {
      content: { 'application/json': { schema: changeStageBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'نُقلت',
      content: { 'application/json': { schema: mediaContactDetailSchema } },
    },
    404: problemResponse('الشخص غير موجود'),
  },
})

export const interactionBodySchema = z.object({
  kindId: z.uuid().openapi({
    description:
      'من `INTERACTION_KIND`. `STAGE_CHANGE` يكتبه النظام وحده عند نقل المرحلة فيُرفض هنا.',
  }),
  occurredAt: z.iso.datetime().optional(),
  summaryAr: z.string().min(2).max(300),
  bodyAr: z.string().max(4000).optional(),
  /** موعد المتابعة التالية — ما يجعل هذا السجل قائمة عمل لا أرشيفًا. */
  dueAt: z.iso.datetime().optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/contacts/{id}/interactions'),
  tags: ['Media'],
  summary: 'تسجيل تواصل',
  description:
    'يحدّث «آخر تواصل» تلقائيًا حين يكون أحدث من المسجّل، فلا يُدخَل التاريخ مرتين.',
  security,
  request: {
    params: contactIdParamsSchema,
    body: {
      content: { 'application/json': { schema: interactionBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'سُجِّل',
      content: { 'application/json': { schema: mediaContactDetailSchema } },
    },
    404: problemResponse('الشخص غير موجود'),
  },
})

export const interactionIdParamsSchema = z.object({
  id: z.uuid(),
  interactionId: z.uuid(),
})

export const completeInteractionBodySchema = z.object({
  completed: z.boolean(),
})

registry.registerPath({
  method: 'patch',
  path: path('/contacts/{id}/interactions/{interactionId}'),
  tags: ['Media'],
  summary: 'إنجاز متابعة أو إعادة فتحها',
  security,
  request: {
    params: interactionIdParamsSchema,
    body: {
      content: {
        'application/json': { schema: completeInteractionBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: 'حُدِّثت',
      content: { 'application/json': { schema: mediaContactDetailSchema } },
    },
    404: problemResponse('المتابعة غير موجودة'),
    422: problemResponse('السجل بلا موعد متابعة'),
  },
})

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>
export type ListFollowUpsQuery = z.infer<typeof listFollowUpsQuerySchema>
export type CreateContactBody = z.infer<typeof createContactBodySchema>
export type UpdateContactBody = z.infer<typeof updateContactBodySchema>
export type ChangeStageBody = z.infer<typeof changeStageBodySchema>
export type InteractionBody = z.infer<typeof interactionBodySchema>
export type CompleteInteractionBody = z.infer<
  typeof completeInteractionBodySchema
>
