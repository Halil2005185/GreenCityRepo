import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { lookupRefSchema } from '../lookups/lookup-ref.schema.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/partner/me${suffix}`

/**
 * تمثيل الجهة كما يراه ممثلها — لا يحمل `internalNotesAr` ولا
 * `decisionNoteAr` ولا أي معرّف لجهة أخرى.
 *
 * مخطط منفصل عن `PartnerDetail` عمدًا لا مشتق منه: الاشتقاق بالحذف
 * يعني أن أي حقل حساس يُضاف للإدارة لاحقًا يتسرب افتراضيًا حتى ينتبه
 * أحد لحذفه.
 */
export const partnerSelfSchema = registry.register(
  'PartnerSelf',
  z.object({
    id: z.uuid(),
    displayNameAr: z.string(),
    legalNameAr: z.string(),
    nameEn: z.string().nullable(),
    organizationKind: lookupRefSchema,
    stage: z.string(),
    isSuspended: z.boolean(),
    suspensionReasonAr: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    summaryAr: z.string().nullable(),
    supportForms: z.array(lookupRefSchema),
    publicNameConsent: z.boolean(),
    publicLogoConsent: z.boolean(),
    activatedAt: z.iso.datetime().nullable(),
    partnerships: z.array(
      z.object({
        type: z.string(),
        status: z.string(),
        approvedAt: z.iso.datetime().nullable(),
      }),
    ),
    contacts: z.array(
      z.object({
        id: z.uuid(),
        fullNameAr: z.string(),
        jobTitleAr: z.string().nullable(),
        email: z.email().nullable(),
        phone: z.string().nullable(),
        isPrimary: z.boolean(),
      }),
    ),
    acknowledgements: z.array(
      z.object({
        charterVersion: z.string(),
        acknowledgedAt: z.iso.datetime(),
        acknowledgedByNameAr: z.string(),
      }),
    ),
  }),
)

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Partner Portal'],
  summary: 'ملف جهتي',
  description:
    'النطاق يُشتق من الجلسة لا من الطلب: لا يوجد معرّف جهة في المسار، فلا يمكن طلب جهة أخرى أصلًا.',
  security,
  responses: {
    200: {
      description: 'الملف',
      content: { 'application/json': { schema: partnerSelfSchema } },
    },
    403: problemResponse('الحساب لا يمثل جهة'),
  },
})

/**
 * الحقول المسموح للشريك بتعديلها.
 *
 * قائمة بيضاء صريحة: `stage` و`supportForms` و`accountManagerId` وكل ما
 * يخص الاعتماد خارجها، فلا يستطيع الشريك ترقية نفسه إلى نشط.
 */
export const updateSelfBodySchema = z.object({
  displayNameAr: z.string().min(2).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  websiteUrl: z.url().max(500).optional(),
  summaryAr: z.string().max(2000).optional(),
})

registry.registerPath({
  method: 'patch',
  path: path(''),
  tags: ['Partner Portal'],
  summary: 'تحديث بيانات جهتي',
  description: 'حقول محددة فقط. الاسم القانوني والحالة والاعتماد ليست منها.',
  security,
  request: {
    body: { content: { 'application/json': { schema: updateSelfBodySchema } } },
  },
  responses: {
    200: {
      description: 'حُدِّث',
      content: { 'application/json': { schema: partnerSelfSchema } },
    },
    403: problemResponse('الحساب لا يمثل جهة نشطة'),
  },
})

export const displayConsentBodySchema = z.object({
  publicNameConsent: z.boolean().optional(),
  publicLogoConsent: z.boolean().optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/display-consent'),
  tags: ['Partner Portal'],
  summary: 'منح موافقة الإظهار أو سحبها ذاتيًا',
  description:
    'الشريك يتحكم بظهور اسمه وشعاره دون وساطة. كل تغيير يُسجَّل حدثًا مصدره `PARTNER_SELF`.',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: displayConsentBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'سُجِّلت',
      content: { 'application/json': { schema: partnerSelfSchema } },
    },
  },
})

export const partnerFieldTeamSchema = registry.register(
  'PartnerFieldTeam',
  z
    .object({
      groupId: z.uuid(),
      groupNameAr: z.string(),
      initiativeNameAr: z.string(),
      initiativeStatus: z.string(),
      siteNameAr: z.string(),
      areaNameAr: z.string().nullable(),
      meetsAt: z.iso.datetime().nullable(),
      memberCount: z.number().int(),
      comingCount: z.number().int().openapi({
        description: 'من أكّدوا حضورهم من بطاقاتهم.',
      }),
      attendedCount: z.number().int().openapi({
        description: 'من حضر من الفريق يومًا واحدًا على الأقل.',
      }),
      attendanceDays: z.number().int().openapi({
        description: 'مجموع أيام الحضور: شخص حضر يومين يُعدّ يومين.',
      }),
      lastAttendedOn: z.iso.date().nullable(),
    })
    .openapi({
      description:
        'فريق ميداني منسوب إلى الجهة، بأعداده وحدها. لا أسماء ولا وسائل تواصل: المتطوعون أعطوا بياناتهم للمشروع لا للجهة.',
    }),
)

registry.registerPath({
  method: 'get',
  path: path('/field-teams'),
  tags: ['Partner Portal'],
  summary: 'فرق جهتي في الميدان',
  description:
    'المجموعات الميدانية المنسوبة إلى الجهة في المبادرات التي بدأ تنفيذها، بأعداد الحضور. النطاق من الجلسة.',
  security,
  responses: {
    200: {
      description: 'الفرق، الأحدث موعدًا أولًا',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(partnerFieldTeamSchema) }),
        },
      },
    },
    403: problemResponse('الحساب لا يمثل جهة'),
  },
})

export type UpdateSelfBody = z.infer<typeof updateSelfBodySchema>
export type DisplayConsentBody = z.infer<typeof displayConsentBodySchema>
