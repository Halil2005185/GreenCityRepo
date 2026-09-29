import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requireAuth } from '../../common/middleware/authenticate.js'
import type { AuthContext } from '../access/access.service.js'

/**
 * من ينادي مسارات الميدان.
 *
 * اليوم مبدأ واحد: عضو فريق برمز وصول، وهو قائد المجموعة أو منسّقها.
 * المتطوع بلا حساب يدخل لاحقًا برمز رابطه الشخصي مبدأً ثانيًا هنا، فتبقى
 * المسارات تسأل «من أنت؟» في مكان واحد بدل أن تتفرع على شكل الترويسة.
 */
export type FieldPrincipal = {
  kind: 'STAFF'
  userId: string
  auth: AuthContext
}

/**
 * يفوّض إلى `requireAuth` ولا ينسخه: التوقيع ونسخة الرمز وحالة الحساب
 * تُفحص هناك، وأي تشديد عليها يسري على الميدان من تلقائه.
 *
 * ممثل الجهة الشريكة يُرفض هنا: حسابه صالح لكن الميدان ليس بوابته، ونطاق
 * بياناته يأتي من جهته لا من مجموعة يقودها.
 */
export const requireFieldAuth: RequestHandler = (request, response, next) => {
  const accept = (error?: unknown) => {
    if (error) {
      next(error)
      return
    }

    const auth = request.auth

    if (!auth || auth.kind !== 'STAFF') {
      next(errors.forbidden())
      return
    }

    request.field = { kind: 'STAFF', userId: auth.userId, auth }
    next()
  }

  // `requireAuth` غير متزامن ويُستدعى هنا يدويًا، فرفضه لا يلتقطه Express.
  Promise.resolve(requireAuth(request, response, accept)).catch(next)
}

/**
 * غياب المبدأ على مسار ميداني خطأ برمجي — الحارس لم يُركَّب — لا نقص
 * صلاحية، فيُرفع خطأً داخليًا كما في `authorize.ts`.
 */
export function fieldPrincipal(request: Request): FieldPrincipal {
  if (!request.field) {
    throw new Error('requireFieldAuth must run before any field route handler.')
  }

  return request.field
}
