import type { RequestHandler } from 'express'

import { env } from '../../config/env.js'
import { errors } from '../errors/app-error.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * طبقة CSRF ثالثة بعد `sameSite: 'strict'` وقائمة CORS.
 *
 * السبب في عدم الاكتفاء بـCORS: المتصفح يمنع *قراءة* الرد لا *إرساله*،
 * وطلبات معيّنة تمر دون preflight. فحص `Origin` صراحةً على الطرق المغيّرة
 * يغلق ما تبقّى، وهو أرخص من رمز CSRF مزامن مع الحالة.
 *
 * غياب الترويسة مسموح: عملاء غير المتصفح (اختبارات، سكربتات، curl) لا
 * يرسلونها، والخطر الذي نغلقه مصدره المتصفح وحده.
 */
export const originCheck: RequestHandler = (request, _response, next) => {
  if (SAFE_METHODS.has(request.method)) {
    next()
    return
  }

  const origin = request.header('origin')

  if (!origin || env.CORS_ORIGINS.includes(origin)) {
    next()
    return
  }

  next(errors.forbidden('مصدر الطلب غير مسموح.'))
}
