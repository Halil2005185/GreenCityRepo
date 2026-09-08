import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/forms${suffix}`

export const submissionStatusEnum = z.enum([
  'NEW',
  'IN_REVIEW',
  'ACCEPTED',
  'REJECTED',
])

export const submissionSummarySchema = registry.register(
  'FormSubmissionSummary',
  z.object({
    id: z.uuid(),
    status: submissionStatusEnum,
    applicantNameAr: z.string().nullable(),
    applicantEmail: z.string().nullable(),
    applicantPhone: z.string().nullable(),
    /** رقم الإصدار الذي أُرسل الطلب عليه — الأسئلة تُقرأ منه لا من المسوّدة. */
    formVersion: z.number().int(),
    /**
     * الإجابات خامًا بمفاتيحها. الواجهة تختار أيّها تعرض في القائمة، وتقرأ
     * نصّ الخيار من تعريف السؤال الذي تملكه أصلًا.
     */
    answers: z.record(z.string(), z.unknown()),
    submittedAt: z.iso.datetime(),
  }),
)

export const submissionDetailSchema = registry.register(
  'FormSubmissionDetail',
  submissionSummarySchema.extend({
    formNameAr: z.string(),
    answers: z.array(z.object({ labelAr: z.string(), valueAr: z.string() })),
  }),
)

/**
 * مرشّح على إجابة سؤال: `مفتاح:قيمة`.
 *
 * الفصل عند أول نقطتين لا عند كلٍّ منها، فالقيم قد تحملها — «الدوام: صباحي»
 * قيمةٌ مشروعة لا مرشّحان.
 */
export const answerFilterSchema = z
  .string()
  .min(3)
  .max(300)
  .refine((value) => value.indexOf(':') > 0, {
    message: 'المرشّح يُكتب «مفتاح:قيمة».',
  })

export const listSubmissionsQuerySchema = z.object({
  status: submissionStatusEnum.optional(),
  /** بحث في الاسم والبريد والهاتف — الأعمدة المستخرجة لا داخل الإجابات. */
  q: z.string().trim().min(1).max(120).optional(),
  /**
   * مرشّحات على الإجابات نفسها. تتكرّر في العنوان: `?answer=a:1&answer=b:2`،
   * وتُجمع بـ«و» لا بـ«أو» — الفارز يضيّق لا يوسّع.
   */
  answer: z
    .union([answerFilterSchema, z.array(answerFilterSchema).max(10)])
    .optional()
    .transform((value) =>
      value === undefined ? [] : Array.isArray(value) ? value : [value],
    ),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const submissionIdParamsSchema = z.object({
  id: z.uuid(),
  submissionId: z.uuid(),
})

export const updateSubmissionBodySchema = z.object({
  status: submissionStatusEnum,
})

registry.registerPath({
  method: 'get',
  path: path('/{id}/submissions'),
  tags: ['Forms'],
  summary: 'طلبات الاستمارة',
  description:
    'الأحدث أولًا، بترشيح على الحالة وبحث في الاسم والبريد والهاتف. المؤشّر وقتٌ لا رقم صفحة، فلا تتزحزح الصفحة حين تصل طلبات جديدة أثناء القراءة.',
  security,
  request: {
    params: z.object({ id: z.uuid() }),
    query: listSubmissionsQuerySchema,
  },
  responses: {
    200: {
      description: 'الطلبات',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(submissionSummarySchema),
            nextBefore: z.iso.datetime().nullable(),
          }),
        },
      },
    },
    403: problemResponse('لا يملك القدرة forms.view'),
    404: problemResponse('الاستمارة غير موجودة'),
  },
})

registry.registerPath({
  method: 'get',
  path: path('/{id}/submissions/{submissionId}'),
  tags: ['Forms'],
  summary: 'طلب واحد بإجاباته',
  description:
    'الإجابات مقروءةً بأسئلة الإصدار الذي أُرسل معه لا بأسئلة المسوّدة الحالية — قراءة إجابة قديمة بسؤال جديد تنسب إلى المتقدّم ما لم يُسأل عنه.',
  security,
  request: { params: submissionIdParamsSchema },
  responses: {
    200: {
      description: 'الطلب',
      content: {
        'application/json': {
          schema: z.object({ data: submissionDetailSchema }),
        },
      },
    },
    404: problemResponse('الطلب غير موجود'),
  },
})

registry.registerPath({
  method: 'patch',
  path: path('/{id}/submissions/{submissionId}'),
  tags: ['Forms'],
  summary: 'نقل حالة الطلب',
  description:
    'بلا رسم انتقالات: الفارز يقرأ ثم يقرّر وقد يعيد النظر، ومنع العودة من «مرفوض» يدفن طلبًا بنقرة خاطئة. التغيير يُسجَّل في التدقيق.',
  security,
  request: {
    params: submissionIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updateSubmissionBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'نُقلت',
      content: {
        'application/json': {
          schema: z.object({ data: submissionDetailSchema }),
        },
      },
    },
    403: problemResponse('لا يملك القدرة forms.manage'),
    404: problemResponse('الطلب غير موجود'),
  },
})

export type SubmissionStatus = z.infer<typeof submissionStatusEnum>
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>
export type UpdateSubmissionBody = z.infer<typeof updateSubmissionBodySchema>
