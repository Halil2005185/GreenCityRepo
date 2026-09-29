import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const path = (suffix: string) => `${env.API_PREFIX}/auth${suffix}`

// ── لبنات مشتركة ───────────────────────────────────────────────────────

export const emailField = z
  .email('صيغة البريد الإلكتروني غير صحيحة.')
  .max(254)
  .openapi({ example: 'nour@greencities.sy' })

/**
 * الحد الأدنى 12 محرفًا بلا قواعد تركيب.
 *
 * NIST 800-63B تنصح صراحةً بترك التعقيد الإجباري: فرض رمز ورقم يدفع
 * الناس إلى `Password1!` وأنماط متوقعة، بينما الطول وحده يزيد صعوبة
 * التخمين فعليًا. هذه لوحة إدارية، فالحد أعلى من الثمانية الافتراضية.
 */
export const passwordField = z
  .string()
  .min(12, 'كلمة المرور يجب ألا تقل عن 12 محرفًا.')
  .max(128, 'كلمة المرور طويلة أكثر من اللازم.')

export const membershipSchema = registry.register(
  'AuthMembership',
  z.object({
    officeId: z.uuid(),
    officeSlug: z.string(),
    officeNameAr: z.string(),
    roleId: z.uuid(),
    roleSlug: z.string(),
    roleNameAr: z.string(),
    isPrimary: z.boolean(),
    capabilities: z.array(z.string()).openapi({
      description:
        'قدرات هذه العضوية وحدها بعد الاستثناءات الفردية. القدرة المقيّدة بمكتب تسري في مكتب العضوية وأقسامه فقط.',
    }),
  }),
)

export const authPartnerSchema = registry.register(
  'AuthPartner',
  z
    .object({
      id: z.uuid(),
      displayNameAr: z.string(),
      stage: z.string(),
      isSuspended: z.boolean(),
      roleSlug: z.string(),
      roleNameAr: z.string(),
    })
    .openapi({
      description:
        'الجهة التي يمثلها المستخدم. `null` لأعضاء الفريق. كل استعلامات البوابة تُقيَّد بهذا المعرّف على الخادم.',
    }),
)

export const authUserSchema = registry.register(
  'AuthUser',
  z.object({
    id: z.uuid(),
    email: z.email(),
    fullNameAr: z.string(),
    kind: z.enum(['STAFF', 'PARTNER']),
    capabilities: z.array(z.string()).openapi({
      description:
        'القدرات الفعلية المحلولة من أدوار العضويات النشطة. الواجهة تخفي ما لا يُقابله عنصر هنا، والخادم يعيد الفحص في كل مسار.',
    }),
    memberships: z.array(membershipSchema),
    partner: authPartnerSchema.nullable(),
  }),
)

export const sessionResponseSchema = registry.register(
  'SessionResponse',
  z.object({
    accessToken: z.string().openapi({
      description:
        'يُحفظ في ذاكرة التطبيق فقط. حفظه في localStorage يجعله متاحًا لأي XSS.',
    }),
    expiresInSeconds: z.number().int(),
    user: authUserSchema,
  }),
)

// ── تسجيل الدخول ───────────────────────────────────────────────────────

export const loginBodySchema = z.object({
  email: emailField,
  password: z.string().min(1, 'كلمة المرور مطلوبة.'),
})

registry.registerPath({
  method: 'post',
  path: path('/login'),
  tags: ['Auth'],
  summary: 'تسجيل الدخول',
  description:
    'يعيد رمز وصول قصير العمر ويضع رمز التحديث في كوكي httpOnly. المحاولات الفاشلة المتتالية تقفل الحساب مؤقتًا.',
  request: {
    body: { content: { 'application/json': { schema: loginBodySchema } } },
  },
  responses: {
    200: {
      description: 'تم الدخول',
      content: { 'application/json': { schema: sessionResponseSchema } },
    },
    401: problemResponse('بريد أو كلمة مرور غير صحيحة'),
    423: problemResponse('الحساب مقفل مؤقتًا بعد محاولات فاشلة'),
    429: problemResponse('محاولات كثيرة'),
  },
})

// ── تدوير الجلسة والخروج ───────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: path('/refresh'),
  tags: ['Auth'],
  summary: 'تدوير الجلسة',
  description:
    'يقرأ رمز التحديث من الكوكي ويستبدله بآخر. تقديم رمز مُدوَّر سابقًا يُعتبر سرقة ويُبطل عائلة الجلسة كاملة.',
  responses: {
    200: {
      description: 'جلسة جديدة',
      content: { 'application/json': { schema: sessionResponseSchema } },
    },
    401: problemResponse('رمز التحديث غائب أو غير صالح'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/logout'),
  tags: ['Auth'],
  summary: 'إنهاء الجلسة الحالية',
  responses: { 204: { description: 'تم' } },
})

registry.registerPath({
  method: 'post',
  path: path('/logout-all'),
  tags: ['Auth'],
  summary: 'إنهاء كل الجلسات على كل الأجهزة',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    204: { description: 'تم' },
    401: problemResponse('غير مصادق'),
  },
})

registry.registerPath({
  method: 'get',
  path: path('/me'),
  tags: ['Auth'],
  summary: 'المستخدم الحالي وقدراته',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: 'بيانات المستخدم',
      content: { 'application/json': { schema: authUserSchema } },
    },
    401: problemResponse('غير مصادق'),
  },
})

// ── استعادة كلمة المرور ────────────────────────────────────────────────

export const forgotPasswordBodySchema = z.object({ email: emailField })

registry.registerPath({
  method: 'post',
  path: path('/forgot-password'),
  tags: ['Auth'],
  summary: 'طلب استعادة كلمة المرور',
  description:
    'يعيد 202 دائمًا سواء وُجد البريد أو لا، حتى لا يتحول المسار إلى أداة لكشف الحسابات المسجلة.',
  request: {
    body: {
      content: { 'application/json': { schema: forgotPasswordBodySchema } },
    },
  },
  responses: {
    202: { description: 'إن كان البريد مسجلًا فقد أُرسل الرابط' },
    429: problemResponse('محاولات كثيرة'),
  },
})

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: passwordField,
})

registry.registerPath({
  method: 'post',
  path: path('/reset-password'),
  tags: ['Auth'],
  summary: 'تعيين كلمة مرور جديدة',
  description:
    'يستهلك الرمز مرة واحدة، ويُبطل كل الجلسات القائمة لأن كلمة المرور قد تكون غُيّرت بسبب اختراق.',
  request: {
    body: {
      content: { 'application/json': { schema: resetPasswordBodySchema } },
    },
  },
  responses: {
    204: { description: 'تم التغيير' },
    400: problemResponse('الرمز غير صالح أو منتهٍ'),
  },
})

// ── الدعوات ────────────────────────────────────────────────────────────

export const invitationTokenParamsSchema = z.object({
  token: z.string().min(1),
})

export const invitationPreviewSchema = registry.register(
  'InvitationPreview',
  z.object({
    email: z.email(),
    fullNameAr: z.string().nullable(),
    kind: z.enum(['STAFF', 'PARTNER']),
    roleNameAr: z.string(),
    officeNameAr: z.string().nullable(),
    partnerNameAr: z.string().nullable(),
    expiresAt: z.iso.datetime(),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/invitations/{token}'),
  tags: ['Auth'],
  summary: 'معاينة الدعوة قبل قبولها',
  description:
    'يعرض ما وافق عليه المرسِل — الدور والمكتب — حتى يعرف المدعوّ ما يقبله. لا يكشف أي بيانات أخرى.',
  request: { params: invitationTokenParamsSchema },
  responses: {
    200: {
      description: 'تفاصيل الدعوة',
      content: { 'application/json': { schema: invitationPreviewSchema } },
    },
    404: problemResponse('الدعوة غير موجودة أو منتهية أو مستهلكة'),
  },
})

export const acceptInvitationBodySchema = z.object({
  fullNameAr: z
    .string()
    .min(3, 'الاسم الكامل مطلوب.')
    .max(160)
    .openapi({ example: 'محمد نور' }),
  password: passwordField,
  phone: z.string().max(32).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/invitations/{token}/accept'),
  tags: ['Auth'],
  summary: 'قبول الدعوة وإنشاء الحساب',
  description:
    'معاملة واحدة: إنشاء المستخدم وعضويته وتعليم الدعوة مقبولة. الدور والمكتب يُؤخذان من الدعوة لا من الطلب.',
  request: {
    params: invitationTokenParamsSchema,
    body: {
      content: { 'application/json': { schema: acceptInvitationBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُنشئ الحساب وسُجّل الدخول',
      content: { 'application/json': { schema: sessionResponseSchema } },
    },
    404: problemResponse('الدعوة غير صالحة'),
    409: problemResponse('البريد مستخدم بحساب قائم'),
  },
})

export type LoginBody = z.infer<typeof loginBodySchema>
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>
