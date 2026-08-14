import { rateLimit } from 'express-rate-limit'

import { env } from '../../config/env.js'
import { errors } from '../errors/app-error.js'

/**
 * الحد بالذاكرة يكفي لعملية واحدة. عند تشغيل أكثر من نسخة خلف Nginx
 * يلزم مخزن مشترك، وإلا صار الحد الفعلي مضروبًا بعدد النسخ.
 *
 * `TRUST_PROXY` يجب أن يكون مضبوطًا خلف Nginx، وإلا رأى الحدُّ عنوان
 * الوكيل وحده فقيّد كل المستخدمين معًا.
 */
function buildLimiter(options: { windowMs: number; limit: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
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
