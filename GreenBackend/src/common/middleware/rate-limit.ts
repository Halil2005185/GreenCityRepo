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
  keyGenerator: (request) =>
    request.auth?.userId ?? ipKeyGenerator(request.ip ?? ''),
})
