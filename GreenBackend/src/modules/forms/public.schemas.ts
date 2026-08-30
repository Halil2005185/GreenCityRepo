import { env } from '../../config/env.js'
import { introDocSchema } from './intro.schemas.js'
import { problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const path = (suffix: string) => `${env.API_PREFIX}/public${suffix}`

export const publicFieldSchema = registry.register(
  'PublicFormField',
  z.object({
    key: z.string(),
    labelAr: z.string(),
    hintAr: z.string().nullable(),
    type: z.string(),
    isRequired: z.boolean(),
    /** هذا هو حقل البريد الذي تصله نسخة الطلب، فتعرف الواجهة متى تعرض الخيار. */
    isContactEmail: z.boolean(),
    minSelections: z.number().int().nullable(),
    maxSelections: z.number().int().nullable(),
    maxLength: z.number().int().nullable(),
    /**
     * خيارات القوائم كما عُرِّفت في السؤال. وللمراجع — منطقة أو مكتب أو
     * برنامج — تأتي من كتالوج النظام وقت العرض، فتظهر قائمةً للزائر لا
     * حقل نصّ، وتتبع الكتالوج دون إصدار جديد.
     */
    options: z.array(z.object({ value: z.string(), labelAr: z.string() })),
    condition: z
      .object({
        fieldKey: z.string(),
        op: z.enum(['eq', 'in', 'notEmpty']),
        value: z.unknown().optional(),
      })
      .nullable(),
  }),
)

export const publicFormSchema = registry.register(
  'PublicForm',
  z.object({
    slug: z.string(),
    nameAr: z.string(),
    descriptionAr: z.string().nullable(),
    /** المقدّمة والصورة — ما يُصيَّر فوق الأسئلة. */
    introJson: introDocSchema.nullable(),
    coverImageUrl: z.url().nullable(),
    isAccepting: z.boolean(),
    version: z.number().int(),
    fields: z.array(publicFieldSchema),
  }),
)

/**
 * الإجابات كائن حر هنا عمدًا: شكلها يحدده إصدار الاستمارة لا هذا المخطط.
 * التحقق الحقيقي في `answers.service.ts` مقابل أسئلة الإصدار — نوعًا
 * وإلزامًا وشرطًا وحدودًا وانتماءً إلى الخيارات.
 */
export const submitBodySchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  /**
   * نسخة إلى بريد المتقدّم نفسه. تُهمَل بلا خطأ إن لم تحمل الاستمارة حقل
   * بريد أو تُرك فارغًا: المتقدّم طلب نسخة ولم يعطِ عنوانًا، وردّ الطلب
   * كله لأجل هذا يخسر البيانات لأجل خدمة جانبية.
   */
  sendCopy: z.boolean().optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/forms/{slug}'),
  tags: ['Public'],
  summary: 'الاستمارة المنشورة',
  description:
    'بلا مصادقة. تعيد الإصدار المنشور وحده؛ غير المنشور وغير الموجود يعطيان 404 نفسه.',
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: {
      description: 'الاستمارة',
      content: {
        'application/json': { schema: z.object({ data: publicFormSchema }) },
      },
    },
    404: problemResponse('غير متاحة'),
    429: problemResponse('تجاوز حد الطلبات'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/forms/{slug}/submissions'),
  tags: ['Public'],
  summary: 'تقديم طلب',
  description:
    'بلا مصادقة. يعيد 202 بلا جسم ولا معرّف. التحقق كامل على الخادم: الإلزام والشرطية والأنواع والحدود والانتماء إلى الخيارات. وعلم sendCopy يُدرج نسخة من الإجابات في صندوق البريد الصادر إلى عنوان المتقدّم نفسه.',
  request: {
    params: z.object({ slug: z.string() }),
    body: { content: { 'application/json': { schema: submitBodySchema } } },
  },
  responses: {
    202: { description: 'وصل الطلب' },
    404: problemResponse('غير متاحة'),
    409: problemResponse('الاستمارة مغلقة ولا تستقبل طلبات'),
    422: problemResponse('إجابات غير صالحة — التفاصيل تحمل مواضع الأخطاء'),
    429: problemResponse('تجاوز حد الطلبات'),
  },
})
