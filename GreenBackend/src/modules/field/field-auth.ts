import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requireAuth } from '../../common/middleware/authenticate.js'
import type { AuthContext } from '../access/access.service.js'
import { LINK_TOKEN_PREFIX, resolveLink } from './field-links.service.js'

/**
 * من ينادي مسارات الميدان — مبدآن:
 *
 * - عضو فريق برمز وصول، وهو قائد المجموعة أو منسّقها.
 * - مشارك برابطه الشخصي: لا حساب له، ونطاقه بطاقته في مبادرة واحدة.
 *
 * المسارات تسأل «من أنت؟» هنا في مكان واحد، ثم يحرس كل قسم مبدأه
 * (`requireFieldStaff`، `requireFieldParticipant`) بدل أن يتفرع على شكل
 * الترويسة.
 */
export type StaffPrincipal = {
  kind: 'STAFF'
  userId: string
  auth: AuthContext
}

export type ParticipantPrincipal = {
  kind: 'PARTICIPANT'
  participantId: string
  fullNameAr: string
  initiativeId: string
  linkId: string
  linkExpiresAt: Date
}

export type FieldPrincipal = StaffPrincipal | ParticipantPrincipal

function bearerToken(request: Request) {
  const header = request.header('authorization')

  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null
}

/**
 * رمز الرابط يُعرف ببادئته، فلا يُجرَّب رمزًا للوصول ولا العكس: رمز رابط
 * منتهٍ جوابه «اطلب رابطًا جديدًا» لا «انتهت جلستك».
 *
 * وعضو الفريق يُفوَّض إلى `requireAuth` ولا يُنسخ: التوقيع ونسخة الرمز وحالة
 * الحساب تُفحص هناك، وأي تشديد عليها يسري على الميدان من تلقائه. ممثل
 * الجهة الشريكة يُرفض: حسابه صالح لكن الميدان ليس بوابته.
 */
export const requireFieldAuth: RequestHandler = (request, response, next) => {
  const token = bearerToken(request)

  if (token?.startsWith(LINK_TOKEN_PREFIX)) {
    resolveLink(token)
      .then((principal) => {
        request.field = principal
        next()
      })
      .catch(next)

    return
  }

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

/** مسارات القائد: ورقة اليوم وكل ما يُسجَّل منها. المشارك لا يدخلها. */
export const requireFieldStaff: RequestHandler = (request, _response, next) => {
  next(
    fieldPrincipal(request).kind === 'STAFF'
      ? undefined
      : errors.forbidden('هذا المسار لقادة المجموعات.'),
  )
}

/** مسارات البطاقة: تأكيد الحضور وما يخص المشارك نفسه. */
export const requireFieldParticipant: RequestHandler = (
  request,
  _response,
  next,
) => {
  next(
    fieldPrincipal(request).kind === 'PARTICIPANT'
      ? undefined
      : errors.forbidden('هذا المسار لحامل رابط شخصي.'),
  )
}

export function staffPrincipal(request: Request): StaffPrincipal {
  const principal = fieldPrincipal(request)

  if (principal.kind !== 'STAFF') {
    throw new Error('requireFieldStaff must run before this handler.')
  }

  return principal
}

export function participantPrincipal(request: Request): ParticipantPrincipal {
  const principal = fieldPrincipal(request)

  if (principal.kind !== 'PARTICIPANT') {
    throw new Error('requireFieldParticipant must run before this handler.')
  }

  return principal
}
