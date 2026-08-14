import type { RequestHandler } from 'express'

import { loadAuthContext } from '../../modules/access/access.service.js'
import { verifyAccessToken } from '../../modules/auth/token.service.js'
import { errors } from '../errors/app-error.js'

function extractBearerToken(header: string | undefined) {
  if (!header) return null

  const [scheme, value] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !value) return null

  return value.trim() || null
}

/**
 * يتحقق من رمز الوصول ثم يحمّل السياق من القاعدة.
 *
 * ثلاث بوابات بالترتيب: توقيع الرمز، ثم مطابقة `tokenVersion` — وهي ما
 * يجعل «إنهاء كل الجلسات» فوريًا لا مؤجلًا لانتهاء الرمز — ثم حالة
 * الحساب، فالموقوف يحمل رمزًا صالحًا لكنه لا يعمل.
 */
export const requireAuth: RequestHandler = async (request, _response, next) => {
  const token = extractBearerToken(request.header('authorization'))

  if (!token) {
    next(errors.unauthorized())
    return
  }

  const claims = await verifyAccessToken(token)
  const context = await loadAuthContext(claims.userId)

  if (!context) {
    next(errors.unauthorized('الحساب لم يعد موجودًا.'))
    return
  }

  if (context.tokenVersion !== claims.tokenVersion) {
    next(errors.unauthorized('انتهت الجلسة. سجّل الدخول من جديد.'))
    return
  }

  if (context.status !== 'ACTIVE') {
    next(errors.forbidden('الحساب موقوف. راجع الإدارة.'))
    return
  }

  request.auth = context
  next()
}
