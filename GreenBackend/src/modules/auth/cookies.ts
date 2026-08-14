import type { CookieOptions, Response } from 'express'

import { env } from '../../config/env.js'

/** كوكي التلميح يُقرأ من خادم Next، فيحمل اسمًا مستقلًا عن كوكي التحديث. */
const HINT_COOKIE_SUFFIX = '_hint'

function sharedOptions(): Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'domain'
> {
  return {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: 'strict',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  }
}

/**
 * رمز التحديث محصور بمسار `/api/auth`: لا يُرسَل مع أي طلب آخر، فلا يظهر
 * في سجلات المسارات العادية ولا يُسرَّب عبرها.
 *
 * `sameSite: 'strict'` ممكن لأن اللوحة والـAPI على أصل واحد خلف Nginx،
 * ومحليًا عبر rewrite في Next. هذا يغلق CSRF من المصدر لا بمعالجته.
 */
function refreshCookieOptions(): CookieOptions {
  return { ...sharedOptions(), path: `${env.API_PREFIX}/auth` }
}

/**
 * تلميح جلسة لا يحمل سرًّا — قيمته `STAFF` أو `PARTNER` فقط.
 *
 * سببه: رمز التحديث محصور بمسار الـAPI، فلا يراه خادم Next ولا يستطيع
 * `proxy.ts` أن يوجّه الزائر إلى مساره الصحيح أو يعيده لصفحة الدخول.
 * لذلك يُضبط كوكي ثانٍ على المسار الجذري لأغراض التوجيه وحدها.
 *
 * لا يُعتمد عليه في أي قرار صلاحية: الـAPI يعيد فحص كل طلب. تزويره
 * يمنح المهاجم رؤية هيكل صفحة فارغة لا أكثر، لأن كل بياناتها تأتي من
 * الـAPI المحمي. ويبقى `httpOnly` كي لا تقرأه سكربتات الصفحة.
 */
function hintCookieOptions(): CookieOptions {
  return { ...sharedOptions(), path: '/' }
}

const hintCookieName = () => `${env.AUTH_COOKIE_NAME}${HINT_COOKIE_SUFFIX}`

export function setRefreshCookie(
  response: Response,
  token: string,
  kind: 'STAFF' | 'PARTNER',
) {
  const maxAge = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000

  response.cookie(env.AUTH_COOKIE_NAME, token, {
    ...refreshCookieOptions(),
    maxAge,
  })

  response.cookie(hintCookieName(), kind, { ...hintCookieOptions(), maxAge })
}

/** يجب أن تطابق الخيارات خيارات الضبط، وإلا بقي الكوكي في المتصفح. */
export function clearRefreshCookie(response: Response) {
  response.clearCookie(env.AUTH_COOKIE_NAME, refreshCookieOptions())
  response.clearCookie(hintCookieName(), hintCookieOptions())
}
