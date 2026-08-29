import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/uploads${suffix}`

/**
 * الغرض لا المجلّد: الواجهة تقول «هذه صورة غلاف استمارة»، والخادم يقرّر
 * أين تُخزَّن وأي قدرة تلزم لها. لو أرسلت الواجهة المسار لصار من يملك رفع
 * صورة نقطة خضراء قادرًا على الكتابة فوق مجلّد المبادرات.
 */
export const uploadPurposeEnum = z.enum([
  'FORM_COVER',
  'INITIATIVE_COVER',
  'GREEN_POINT_COVER',
])

export const signUploadBodySchema = z.object({
  purpose: uploadPurposeEnum,
  contentType: z.string().min(3).max(100),
  /** الحجم يُوقَّع مع الطلب، فالمتصفح ملزَم بما أعلنه هنا. */
  size: z.number().int().positive(),
})

export const signedUploadSchema = registry.register(
  'SignedUpload',
  z.object({
    uploadUrl: z.string(),
    publicUrl: z.string(),
    expiresInSeconds: z.number().int(),
  }),
)

registry.registerPath({
  method: 'post',
  path: path('/sign'),
  tags: ['Uploads'],
  summary: 'رابط رفع موقّع',
  description:
    'يوقّع رفعًا مباشرًا من المتصفح إلى التخزين: الملف لا يمرّ بالخادم. التوقيع يقيّد المفتاح ونوع المحتوى وحجمه، والقدرة المطلوبة تتبع الغرض — غلاف الاستمارة يلزمه `forms.manage`، وأغلفة المبادرات والنقاط `initiatives.manage`.',
  security,
  request: {
    body: { content: { 'application/json': { schema: signUploadBodySchema } } },
  },
  responses: {
    201: {
      description: 'وُقِّع',
      content: {
        'application/json': { schema: z.object({ data: signedUploadSchema }) },
      },
    },
    403: problemResponse('لا يملك القدرة التي يتطلبها الغرض'),
    422: problemResponse('نوع أو حجم غير مسموح، أو التخزين غير مهيّأ'),
  },
})

export type UploadPurpose = z.infer<typeof uploadPurposeEnum>
export type SignUploadBody = z.infer<typeof signUploadBodySchema>
