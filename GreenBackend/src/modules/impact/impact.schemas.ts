import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { metricAggregationEnum } from '../metrics/metrics.schemas.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/impact${suffix}`

export const impactSourceEnum = z.enum([
  'STAFF_ENTRY',
  'PARTNER_SUBMISSION',
  'CONTRIBUTION',
  'FIELD_ENTRY',
])

export const impactScopeEnum = z.enum(['PROGRAM', 'INITIATIVE', 'SITE'])

// ── التمثيلات ──────────────────────────────────────────────────────────

export const impactEntrySchema = registry.register(
  'ImpactEntry',
  z.object({
    id: z.uuid(),
    metricId: z.uuid(),
    metricSlug: z.string(),
    metricNameAr: z.string(),
    unitAr: z.string(),
    decimals: z.number().int(),
    scope: impactScopeEnum,
    programId: z.uuid().nullable(),
    initiativeId: z.uuid().nullable(),
    siteId: z.uuid().nullable(),
    scopeLabelAr: z.string().nullable(),
    value: z.number(),
    source: impactSourceEnum,
    occurredAt: z.iso.datetime(),
    noteAr: z.string().nullable(),
    recordedById: z.uuid().nullable(),
    recordedByNameAr: z.string().nullable(),
    verifiedAt: z.iso.datetime().nullable().openapi({
      description: 'ما لم يُوثَّق القيد لا يدخل المجاميع المعلنة.',
    }),
    verifiedByNameAr: z.string().nullable(),
    reversalOfId: z.uuid().nullable().openapi({
      description: 'حين لا يكون فارغًا فهذا الصف تصحيح لقيد سابق.',
    }),
    reversedByEntryId: z.uuid().nullable().openapi({
      description: 'القيد العكسي الذي ألغى هذا الصف، إن وُجد.',
    }),
    createdAt: z.iso.datetime(),
  }),
)

export const scopeMetricProgressSchema = registry.register(
  'ScopeMetricProgress',
  z.object({
    metricId: z.uuid(),
    metricSlug: z.string(),
    metricNameAr: z.string(),
    unitAr: z.string(),
    aggregation: metricAggregationEnum,
    decimals: z.number().int(),
    target: z.number().nullable(),
    siteTargetSum: z.number().openapi({
      description:
        'مجموع أهداف المواقع غير الملغاة. مقارنته بالهدف يكشف فجوة التخطيط.',
    }),
    actual: z.number().openapi({ description: 'القيود الموثَّقة وحدها.' }),
    unverified: z.number().openapi({
      description: 'قيد الانتظار — يُعرض منفصلًا كي لا يضخّم الرقم المعلن.',
    }),
    percent: z.number().nullable(),
  }),
)

export const impactSummarySchema = registry.register(
  'ImpactSummary',
  z.object({
    scope: impactScopeEnum,
    scopeId: z.uuid(),
    scopeNameAr: z.string(),
    metrics: z.array(scopeMetricProgressSchema),
  }),
)

// ── المسارات ───────────────────────────────────────────────────────────

export const listEntriesQuerySchema = z.object({
  initiativeId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  programId: z.uuid().optional(),
  metricId: z.uuid().optional(),
  verified: z.stringbool().optional(),
  /** مصدر بعينه — قيود الميدان التي تنتظر التحقق مثلًا. */
  source: impactSourceEnum.optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/entries'),
  tags: ['Impact'],
  summary: 'دفتر قيود الأثر',
  description:
    'الترشيح بمبادرة يشمل قيود مواقعها، والترشيح ببرنامج يشمل مبادراته ومواقعها — الفريق الميداني يسجّل على الموقع والحملة يجب أن ترى رقمه.',
  security,
  request: { query: listEntriesQuerySchema },
  responses: {
    200: {
      description: 'القيود',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(impactEntrySchema) }),
        },
      },
    },
    403: problemResponse('لا تملك صلاحية عرض الأثر'),
  },
})

export const createEntryBodySchema = z
  .object({
    metricId: z.uuid(),
    programId: z.uuid().optional(),
    initiativeId: z.uuid().optional(),
    siteId: z.uuid().optional(),
    value: z.number().nonnegative().max(999_999_999_999),
    source: impactSourceEnum.default('STAFF_ENTRY'),
    occurredAt: z.iso.datetime().optional(),
    noteAr: z.string().max(2000).optional(),
  })
  .refine(
    (value) =>
      [value.programId, value.initiativeId, value.siteId].filter(Boolean)
        .length === 1,
    {
      message: 'يُعلَّق القيد على برنامج أو مبادرة أو موقع — نطاق واحد بالضبط.',
      path: ['initiativeId'],
    },
  )

registry.registerPath({
  method: 'post',
  path: path('/entries'),
  tags: ['Impact'],
  summary: 'تسجيل قيد أثر',
  description:
    'الدفتر إضافي فقط: لا تعديل لقيمة ولا حذف. القيمة سالبة لا تُقبل هنا — التصحيح قيد عكسي عبر `/entries/{id}/reverse`. القيد يُسجَّل غير موثَّق ولا يدخل المجاميع قبل توثيقه.',
  security,
  request: {
    body: { content: { 'application/json': { schema: createEntryBodySchema } } },
  },
  responses: {
    201: {
      description: 'سُجِّل',
      content: { 'application/json': { schema: impactEntrySchema } },
    },
    403: problemResponse('لا تملك صلاحية تسجيل الأثر'),
    422: problemResponse('المؤشر معطّل أو النطاق غير موجود'),
  },
})

export const entryIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'post',
  path: path('/entries/{id}/verify'),
  tags: ['Impact'],
  summary: 'توثيق قيد',
  description:
    'التوثيق هو ما ينقل الرقم من «مُقدَّم» إلى «محتسَب». القيد العكسي وما عُكس لا يُوثَّق أيّهما منفردًا: طرف واحد في المجاميع يعني أثرًا سالبًا أو رقمًا سبق إلغاؤه.',
  security,
  request: { params: entryIdParamsSchema },
  responses: {
    200: {
      description: 'وُثِّق',
      content: { 'application/json': { schema: impactEntrySchema } },
    },
    404: problemResponse('القيد غير موجود'),
    409: problemResponse('القيد موثَّق سلفًا أو طرف في زوج عكسي'),
  },
})

export const reverseEntryBodySchema = z.object({
  noteAr: z.string().min(3).max(2000),
})

registry.registerPath({
  method: 'post',
  path: path('/entries/{id}/reverse'),
  tags: ['Impact'],
  summary: 'عكس قيد',
  description:
    'يُنشئ صفًّا بقيمة سالبة على النطاق نفسه بدل تعديل الأصل، فيبقى الرقم القديم وتصحيحه ظاهرين معًا في تقرير سبق إرساله. `noteAr` إلزامي: تصحيح بلا سبب مذكور غير قابل للتدقيق. عكس قيد موثَّق يُوثَّق فورًا حتى يخرج الرقم من المجاميع في اللحظة نفسها.',
  security,
  request: {
    params: entryIdParamsSchema,
    body: { content: { 'application/json': { schema: reverseEntryBodySchema } } },
  },
  responses: {
    201: {
      description: 'عُكس',
      content: { 'application/json': { schema: impactEntrySchema } },
    },
    404: problemResponse('القيد غير موجود'),
    409: problemResponse('القيد عكسيّ أصلًا أو سبق عكسه'),
    422: problemResponse('سبب التصحيح مطلوب'),
  },
})

export const summaryQuerySchema = z
  .object({
    initiativeId: z.uuid().optional(),
    programId: z.uuid().optional(),
    siteId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      [value.programId, value.initiativeId, value.siteId].filter(Boolean)
        .length === 1,
    {
      message: 'حدد نطاقًا واحدًا: برنامج أو مبادرة أو موقع.',
      path: ['initiativeId'],
    },
  )

registry.registerPath({
  method: 'get',
  path: path('/summary'),
  tags: ['Impact'],
  summary: 'مجاميع الأثر مقابل الأهداف',
  description:
    'يُعيد لكل مؤشر له هدف في هذا النطاق أو قيد مسجَّل فيه: الهدف، ومجموع أهداف المواقع، والمحتسَب، وما ينتظر التوثيق. لا اسم مؤشر ولا رقم هدف في الكود — كلاهما صفوف.',
  security,
  request: { query: summaryQuerySchema },
  responses: {
    200: {
      description: 'المجاميع',
      content: { 'application/json': { schema: impactSummarySchema } },
    },
    404: problemResponse('النطاق المطلوب غير موجود'),
  },
})

export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>
export type CreateEntryBody = z.infer<typeof createEntryBodySchema>
export type ReverseEntryBody = z.infer<typeof reverseEntryBodySchema>
export type SummaryQuery = z.infer<typeof summaryQuerySchema>
