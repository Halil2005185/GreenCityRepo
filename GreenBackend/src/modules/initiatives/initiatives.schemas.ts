import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { areaLevelEnum } from '../geo/geo.schemas.js'
import { optionalLookupRefSchema } from '../lookups/lookup-ref.schema.js'
import { metricAggregationEnum } from '../metrics/metrics.schemas.js'
import { targetRollupEnum } from '../programs/programs.schemas.js'
import {
  milestoneStatusEnum,
  workItemPriorityEnum,
  workItemStatusEnum,
} from '../work/work.schemas.js'
import type { InitiativeWork } from '../work/work.service.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/initiatives${suffix}`

export const initiativeStatusEnum = z.enum([
  'DRAFT',
  'PLANNING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
])

export const siteStatusEnum = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
])

// ── التمثيلات ──────────────────────────────────────────────────────────

export const initiativeSummarySchema = registry.register(
  'InitiativeSummary',
  z.object({
    id: z.uuid(),
    programId: z.uuid(),
    programNameAr: z.string(),
    kind: z.enum(['CAMPAIGN', 'GREEN_POINT']).openapi({
      description:
        'حملة يقودها الفريق، أو نقطة خضراء نفّذها شخص أو جهة ووثّقناها. كلاهما يظهر على الخريطة نفسها.',
    }),
    contributorNameAr: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
    slug: z.string().nullable(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    season: z.string().nullable().openapi({ example: 'خريف 2026' }),
    status: initiativeStatusEnum,
    targetRollup: targetRollupEnum,
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    launchedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    leadUserId: z.uuid().nullable(),
    leadNameAr: z.string().nullable(),
    areaCount: z.number().int(),
    siteCount: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
)

export const initiativeAreaSchema = registry.register(
  'InitiativeAreaLink',
  z.object({
    id: z.uuid(),
    areaId: z.uuid(),
    areaNameAr: z.string(),
    areaPath: z.string(),
    level: areaLevelEnum,
    noteAr: z.string().nullable(),
  }),
)

export const siteTargetSchema = registry.register(
  'InitiativeSiteTarget',
  z.object({
    metricId: z.uuid(),
    metricNameAr: z.string(),
    unitAr: z.string(),
    decimals: z.number().int(),
    value: z.number(),
  }),
)

export const initiativeSiteSchema = registry.register(
  'InitiativeSiteDetail',
  z.object({
    id: z.uuid(),
    areaId: z.uuid().nullable(),
    areaNameAr: z.string().nullable(),
    nameAr: z.string(),
    descriptionAr: z.string().nullable(),
    status: siteStatusEnum,
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    displayOrder: z.number().int(),
    targets: z.array(siteTargetSchema),
  }),
)

export const initiativeTargetSchema = registry.register(
  'InitiativeTarget',
  z.object({
    metricId: z.uuid(),
    metricSlug: z.string(),
    metricNameAr: z.string(),
    unitAr: z.string(),
    decimals: z.number().int(),
    value: z.number(),
    noteAr: z.string().nullable(),
  }),
)

export const rollupMetricSchema = registry.register(
  'InitiativeRollupMetric',
  z.object({
    metricId: z.uuid(),
    metricNameAr: z.string(),
    unitAr: z.string(),
    initiativeTarget: z.number().nullable().openapi({
      description:
        'null يعني أن المؤشر وُزّع على المواقع بلا رقم كلي للحملة، وهو اختلاف لا مطابقة.',
    }),
    siteTargetSum: z.number(),
    matches: z.boolean(),
  }),
)

/**
 * مطابقة مجموع أهداف المواقع لهدف المبادرة، محسوبة على الخادم.
 *
 * تُعاد مع كل قراءة لا عند فشل البدء فقط، فتظهر في صفحة المبادرة كقائمة
 * تحقق حيّة — العمليات ترى ما ينقص قبل أن تضغط زر البدء بدل أن تكتشفه
 * برسالة خطأ.
 */
export const initiativeRollupSchema = registry.register(
  'InitiativeRollup',
  z.object({
    policy: targetRollupEnum.openapi({
      description:
        'STRICT يمنع البدء عند الاختلاف، وADVISORY يمرّره مع تحذيرات، وNONE لا يقارن.',
    }),
    satisfied: z.boolean(),
    metrics: z.array(rollupMetricSchema),
  }),
)

export const initiativeProgressSchema = registry.register(
  'InitiativeMetricProgress',
  z.object({
    metricId: z.uuid(),
    metricSlug: z.string(),
    metricNameAr: z.string(),
    unitAr: z.string(),
    aggregation: metricAggregationEnum,
    decimals: z.number().int(),
    initiativeTarget: z.number().nullable(),
    siteTargetSum: z.number(),
    actual: z.number().openapi({
      description: 'القيود المتحقَّق منها وحدها.',
    }),
    unverified: z.number().openapi({
      description: 'المُقدَّم بانتظار التحقق، يُعرض منفصلًا ولا يدخل النسبة.',
    }),
    percent: z.number().nullable(),
  }),
)

export const initiativeWorkSchema = registry.register(
  'InitiativeWorkBoard',
  z.object({
    milestones: z.array(
      z.object({
        id: z.uuid(),
        siteId: z.uuid().nullable(),
        titleAr: z.string(),
        descriptionAr: z.string().nullable(),
        status: milestoneStatusEnum,
        dueAt: z.iso.datetime().nullable(),
        completedAt: z.iso.datetime().nullable(),
        displayOrder: z.number().int(),
        taskCount: z.number().int(),
        doneTaskCount: z.number().int(),
      }),
    ),
    workItems: z.array(
      z.object({
        id: z.uuid(),
        milestoneId: z.uuid().nullable(),
        siteId: z.uuid().nullable(),
        titleAr: z.string(),
        descriptionAr: z.string().nullable(),
        status: workItemStatusEnum,
        priority: workItemPriorityEnum,
        dueAt: z.iso.datetime().nullable(),
        assigneeUserId: z.uuid().nullable(),
        assigneeNameAr: z.string().nullable(),
        assignedPartnerId: z.uuid().nullable(),
        assignedPartnerNameAr: z.string().nullable(),
        followUpOfficeNameAr: z.string().nullable(),
        blockedReasonAr: z.string().nullable(),
      }),
    ),
  }),
)

/**
 * لا يُقرأ في وقت التشغيل؛ وجوده وحده يكسر البناء إن افترق ما تُرجعه
 * `loadInitiativeWork` عن الشكل المعلن هنا، فلا يعد المخطط بحقل حذفته
 * الخدمة.
 *
 * الاتجاه واحد: الخدمة تُصرّح بـ`status` و`priority` نصًّا عامًّا، فالمخطط
 * أضيق منها ويمرّ إليها. لذلك يُمسك الحقل الناقص أو المُعاد تسميته، ولا
 * يُمسك حقلٌ زادته الخدمة ولم يُعلَن هنا.
 */
const _workBoardMatchesService: InitiativeWork = null as unknown as z.infer<
  typeof initiativeWorkSchema
>

export const initiativeDetailSchema = registry.register(
  'InitiativeDetail',
  initiativeSummarySchema.extend({
    summaryAr: z.string().nullable(),
    storyAr: z.string().nullable().openapi({
      description: 'نص التفاصيل الطويل لصفحة المبادرة.',
    }),
    contributorKind: optionalLookupRefSchema,
    internalNotesAr: z.string().nullable().openapi({
      description:
        'لا يظهر إلا لمن يملك `initiatives.notes.view`؛ غيره يراه null.',
    }),
    areas: z.array(initiativeAreaSchema),
    sites: z.array(initiativeSiteSchema),
    targets: z.array(initiativeTargetSchema),
    progress: z.array(initiativeProgressSchema),
    work: initiativeWorkSchema,
    rollup: initiativeRollupSchema,
  }),
)

export const initiativeLaunchResultSchema = registry.register(
  'InitiativeLaunchResult',
  initiativeDetailSchema.extend({
    warnings: z.array(rollupMetricSchema).openapi({
      description:
        'يمتلئ تحت سياسة ADVISORY وحدها: البدء تمّ والاختلاف مسجّل ليراه المسؤول.',
    }),
  }),
)

// ── المسارات ───────────────────────────────────────────────────────────

export const listInitiativesQuerySchema = z.object({
  programId: z.uuid().optional(),
  status: initiativeStatusEnum.optional(),
  areaId: z.uuid().optional(),
  q: z.string().max(120).optional(),
})

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Initiatives'],
  summary: 'المبادرات',
  description:
    'الترشيح بالمنطقة يشمل ما تحتها في التسلسل الجغرافي: ترشيح بمحافظة يعيد مبادرات مواقعها أحياء فيها.',
  security,
  request: { query: listInitiativesQuerySchema },
  responses: {
    200: {
      description: 'المبادرات',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(initiativeSummarySchema) }),
        },
      },
    },
    403: problemResponse('لا تملك صلاحية عرض المبادرات'),
  },
})

export const createInitiativeBodySchema = z.object({
  programId: z.uuid(),
  nameAr: z.string().min(2).max(200),
  nameEn: z.string().max(200).optional(),
  summaryAr: z.string().max(4000).optional(),
  season: z.string().max(80).optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  targetRollup: targetRollupEnum.optional(),
  leadUserId: z.uuid().optional(),
  internalNotesAr: z.string().max(4000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path(''),
  tags: ['Initiatives'],
  summary: 'إنشاء مبادرة',
  description:
    'تبدأ في `DRAFT`. `targetRollup` يُنسخ من البرنامج حين لا يُرسل ثم يستقل عنه. قوالب مراحل البرنامج ومهامه تُنسخ في المعاملة نفسها، فتبدأ المبادرة بخطة تشغيل جاهزة.',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createInitiativeBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُنشئت',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    403: problemResponse('لا تملك صلاحية إدارة المبادرات'),
    422: problemResponse('البرنامج غير موجود أو معطّل'),
  },
})

export const initiativeIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: path('/{id}'),
  tags: ['Initiatives'],
  summary: 'ملف المبادرة كاملًا',
  description:
    'المناطق والمواقع والأهداف والتقدم ولوحة العمل وحالة المطابقة في نداء واحد.',
  security,
  request: { params: initiativeIdParamsSchema },
  responses: {
    200: {
      description: 'الملف',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    404: problemResponse('المبادرة غير موجودة'),
  },
})

export const updateInitiativeBodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'الـslug بأحرف لاتينية صغيرة وأرقام وشرطات فقط.')
    .optional(),
  nameAr: z.string().min(2).max(200).optional(),
  nameEn: z.string().max(200).nullable().optional(),
  summaryAr: z.string().max(4000).nullable().optional(),
  /** نص صفحة المبادرة الطويل ورابط غلافها — محتوى العرض لا حالة التشغيل. */
  storyAr: z.string().max(20000).nullable().optional(),
  coverImageUrl: z.union([z.url().max(500), z.literal('')]).nullable().optional(),
  season: z.string().max(80).nullable().optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  targetRollup: targetRollupEnum.optional(),
  leadUserId: z.uuid().nullable().optional(),
  internalNotesAr: z.string().max(4000).nullable().optional(),
})

registry.registerPath({
  method: 'delete',
  path: path('/{id}'),
  tags: ['Initiatives'],
  summary: 'حذف مسودة مبادرة',
  description:
    'المسودة التي لم تُطلق ولا أثر لها ولا مهمة تحرّكت تُمحى بمواقعها ومهامها. وما جاوز ذلك يُلغى من مسار الإلغاء ولا يُمحى: الإلغاء يُبقي السجل ويُخرج المبادرة من الخريطة والمجاميع.',
  security,
  request: { params: initiativeIdParamsSchema },
  responses: {
    204: { description: 'حُذفت' },
    404: problemResponse('المبادرة غير موجودة'),
    409: problemResponse('المبادرة أُطلقت أو عليها أثر أو عمل — تُلغى ولا تُحذف'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/{id}'),
  tags: ['Initiatives'],
  summary: 'تعديل المبادرة',
  description:
    'الحالة لا تُعدَّل من هنا: البدء والإغلاق والإلغاء مسارات لها شروطها. البرنامج ثابت بعد الإنشاء لأن المراحل والمهام نُسخت من قوالبه.',
  security,
  request: {
    params: initiativeIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updateInitiativeBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّلت',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    409: problemResponse('الـslug مستخدم بمبادرة أخرى'),
    422: problemResponse('تاريخ الانتهاء قبل تاريخ البدء'),
  },
})

export const addAreaBodySchema = z.object({
  areaId: z.uuid(),
  noteAr: z.string().max(1000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/areas'),
  tags: ['Initiatives'],
  summary: 'إعلان نطاق جغرافي',
  description:
    'النطاق يُقرَّر أثناء التخطيط قبل وجود مواقع، فلا يبقى ذلك القرار حبيس ملاحظة نصية.',
  security,
  request: {
    params: initiativeIdParamsSchema,
    body: { content: { 'application/json': { schema: addAreaBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    409: problemResponse('المنطقة معلنة بالفعل لهذه المبادرة'),
    422: problemResponse('المنطقة غير موجودة'),
  },
})

export const areaLinkParamsSchema = z.object({
  id: z.uuid(),
  areaId: z.uuid(),
})

registry.registerPath({
  method: 'delete',
  path: path('/{id}/areas/{areaId}'),
  tags: ['Initiatives'],
  summary: 'سحب نطاق جغرافي معلن',
  security,
  request: { params: areaLinkParamsSchema },
  responses: {
    200: {
      description: 'سُحب',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    404: problemResponse('المنطقة غير معلنة لهذه المبادرة'),
  },
})

export const createSiteBodySchema = z.object({
  areaId: z.uuid().optional(),
  nameAr: z.string().min(2).max(200),
  descriptionAr: z.string().max(4000).optional(),
  status: siteStatusEnum.default('PLANNED'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  displayOrder: z.number().int().min(0).max(9999).default(0),
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/sites'),
  tags: ['Initiatives'],
  summary: 'إضافة موقع تنفيذ',
  description:
    'الإحداثيات إما كلاهما أو لا شيء. عدد المواقع مفتوح: لا رقم مفترض في المخطط ولا في الكود.',
  security,
  request: {
    params: initiativeIdParamsSchema,
    body: { content: { 'application/json': { schema: createSiteBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    422: problemResponse('منطقة غير موجودة أو إحداثيات ناقصة'),
  },
})

export const siteParamsSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
})

export const updateSiteBodySchema = z.object({
  areaId: z.uuid().nullable().optional(),
  nameAr: z.string().min(2).max(200).optional(),
  descriptionAr: z.string().max(4000).nullable().optional(),
  status: siteStatusEnum.optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/{id}/sites/{siteId}'),
  tags: ['Initiatives'],
  summary: 'تعديل موقع',
  description:
    'إلغاء الموقع يُخرج هدفه من مجموع المطابقة: هدف موقع ملغى غير مستحق.',
  security,
  request: {
    params: siteParamsSchema,
    body: { content: { 'application/json': { schema: updateSiteBodySchema } } },
  },
  responses: {
    200: {
      description: 'عُدِّل',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    404: problemResponse('الموقع غير موجود في هذه المبادرة'),
  },
})

export const upsertTargetBodySchema = z.object({
  metricId: z.uuid(),
  // عمود `numeric(16,4)` يسع اثنتي عشرة خانة صحيحة؛ ما فوقها يفيض في القاعدة.
  value: z.number().min(0).max(999_999_999_999),
  noteAr: z.string().max(1000).optional(),
})

registry.registerPath({
  method: 'put',
  path: path('/{id}/targets'),
  tags: ['Initiatives'],
  summary: 'تحديد هدف على مستوى المبادرة',
  description: 'هدف واحد لكل مؤشر في كل نطاق؛ الإرسال الثاني تحديث لا صف ثانٍ.',
  security,
  request: {
    params: initiativeIdParamsSchema,
    body: {
      content: { 'application/json': { schema: upsertTargetBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'حُدِّد',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    422: problemResponse('المؤشر غير موجود أو معطّل'),
  },
})

registry.registerPath({
  method: 'put',
  path: path('/{id}/sites/{siteId}/targets'),
  tags: ['Initiatives'],
  summary: 'تحديد هدف على مستوى الموقع',
  security,
  request: {
    params: siteParamsSchema,
    body: {
      content: { 'application/json': { schema: upsertTargetBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'حُدِّد',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    404: problemResponse('الموقع غير موجود في هذه المبادرة'),
    422: problemResponse('المؤشر غير موجود أو معطّل'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/launch'),
  tags: ['Initiatives'],
  summary: 'بدء تنفيذ المبادرة',
  description:
    'البوابة: مبادرة بلا موقع لا تُنفَّذ في مكان، وسياسة `STRICT` تمنع البدء ما لم يطابق مجموع أهداف المواقع هدف المبادرة. المطابقة تُحسب داخل المعاملة لا قبلها.',
  security,
  request: { params: initiativeIdParamsSchema },
  responses: {
    200: {
      description: 'بدأ التنفيذ',
      content: {
        'application/json': { schema: initiativeLaunchResultSchema },
      },
    },
    403: problemResponse('بدء التنفيذ يحتاج صلاحية مخصصة'),
    409: problemResponse('المبادرة بدأت أو أُغلقت أو أُلغيت'),
    422: problemResponse('لا مواقع، أو أهداف المواقع لا تطابق هدف المبادرة'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/complete'),
  tags: ['Initiatives'],
  summary: 'إغلاق المبادرة',
  security,
  request: { params: initiativeIdParamsSchema },
  responses: {
    200: {
      description: 'أُغلقت',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    409: problemResponse('لا تُغلق مبادرة لم يبدأ تنفيذها'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/{id}/cancel'),
  tags: ['Initiatives'],
  summary: 'إلغاء المبادرة',
  security,
  request: { params: initiativeIdParamsSchema },
  responses: {
    200: {
      description: 'أُلغيت',
      content: { 'application/json': { schema: initiativeDetailSchema } },
    },
    409: problemResponse('المبادرة مغلقة أو ملغاة أصلًا'),
  },
})

export type ListInitiativesQuery = z.infer<typeof listInitiativesQuerySchema>
export type CreateInitiativeBody = z.infer<typeof createInitiativeBodySchema>
export type UpdateInitiativeBody = z.infer<typeof updateInitiativeBodySchema>
export type AddAreaBody = z.infer<typeof addAreaBodySchema>
export type CreateSiteBody = z.infer<typeof createSiteBodySchema>
export type UpdateSiteBody = z.infer<typeof updateSiteBodySchema>
export type UpsertTargetBody = z.infer<typeof upsertTargetBodySchema>
