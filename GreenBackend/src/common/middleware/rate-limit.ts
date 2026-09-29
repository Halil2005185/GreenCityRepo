import type { Request } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

import { env } from '../../config/env.js'
import { errors } from '../errors/app-error.js'

/**
 * الحد بالذاكرة يكفي لعملية واحدة. عند تشغيل أكثر من نسخة خلف Nginx
 * يلزم مخزن مشترك، وإلا صار الحد الفعلي مضروبًا بعدد النسخ.
 *
 * `TRUST_PROXY` يجب أن يكون مضبوطًا خلف Nginx، وإلا رأى الحدُّ عنوان
 * الوكيل وحده فقيّد كل المستخدمين معًا.
 */
function buildLimiter(options: {
  windowMs: number
  limit: number
  keyGenerator?: (request: Request) => string
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    /**
     * يُعطَّل في الاختبارات وحدها: كل الاختبارات تأتي من عنوان واحد،
     * فيستهلك اختبارُ القفل حصةَ ما بعده ويحوّل نجاحًا إلى 429 مضلل.
     * السلوك المختبَر هنا سلوك المكتبة لا سلوكنا.
     */
    skip: () => env.NODE_ENV === 'test',
    handler: (_request, _response, next) => {
      next(errors.tooManyRequests())
    },
  })
}

/**
 * الدخول محمي بطبقتين: هذا الحد يوقف الرش الأفقي على حسابات كثيرة من
 * عنوان واحد، بينما `lockedUntil` على المستخدم يوقف التخمين الرأسي على
 * حساب واحد من عناوين كثيرة. أيٌّ منهما وحده يترك ثغرة.
 */
export const loginRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
})

export const passwordResetRateLimit = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 5,
})

/** إنشاء الحساب عبر الدعوة عملية ثقيلة (Argon2)، فيُحد منها. */
export const invitationRateLimit = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 10,
})

/**
 * الاستمارة العامة — أول مسار كتابة بلا مصادقة في النظام.
 *
 * القراءة سخية لأنها لا تكتب شيئًا: زائر يفتح الاستمارة ويعيد تحميلها
 * ويقرأها من جهازين. والكتابة ضيقة لأن كل طلب يُنشئ صفًّا يقرأه إنسان.
 *
 * هذا حدٌّ على العنوان لا على الشخص، ولا يمنع من يوزّع طلباته على شبكة
 * عناوين. القصد إبقاء الإساءة العابرة خارج صندوق الفرز، لا إثبات هوية —
 * وإثباتها يحتاج تحديًا بصريًا لم يُبنَ بعد.
 */
export const publicFormReadRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 60,
})

export const publicSubmissionRateLimit = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 5,
})

/**
 * فتح الرابط الشخصي — بلا مصادقة، فالحد على العنوان.
 *
 * الرمز 256 بتًّا فلا يُخمَّن؛ الحد هنا يوقف طرق المسار لا تخمين الرمز.
 * وسقفه واسع: متطوعو مدرسة كاملة يفتحون روابطهم من شبكة واحدة في ساعة.
 */
export const linkRedeemRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 300,
})

/**
 * محاولات رمز الحضور — على المشارك لا على العنوان: متطوعو المجموعة كلهم
 * يكتبون رموزهم من شبكة واحدة عند نقطة اللقاء.
 *
 * الرمز ستة أرقام تُقبل منها خمسة في أي لحظة؛ ثلاثون محاولة في ربع ساعة
 * تسع من يخطئ في الكتابة، ولا تسع من يجرّب الأرقام.
 */
export const selfCheckinRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 30,
  keyGenerator: (request) =>
    request.field?.kind === 'PARTICIPANT'
      ? `checkin:${request.field.participantId}`
      : ipKeyGenerator(request.ip ?? ''),
})

/**
 * كتابات التطبيق الميداني — على الحساب لا على العنوان.
 *
 * قادة موقع واحد على شبكة جوال واحدة يخرجون من عنوان واحد، فحدٌّ على العنوان
 * يحاسبهم معًا. والمسارات خلف مصادقة، فصاحب الطلب معروف قبل أن يصل الحدّ.
 *
 * السقف سخيّ عمدًا: قائد يسجّل حضور مئة متطوع ثم يعود إلى الشبكة يفرّغ طابوره
 * دفعة واحدة. القصد إيقاف حلقة معطوبة في هاتف، لا تقنين العمل.
 */
export const fieldWriteRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 900,
  // حامل الرابط الشخصي يُحاسَب برابطه: متطوعو موقع واحد على شبكة واحدة.
  keyGenerator: (request) =>
    request.auth?.userId ??
    (request.field?.kind === 'PARTICIPANT'
      ? `participant:${request.field.participantId}`
      : ipKeyGenerator(request.ip ?? '')),
})
