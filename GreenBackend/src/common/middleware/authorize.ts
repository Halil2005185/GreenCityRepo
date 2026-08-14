import type { RequestHandler } from 'express'

import type { Capability } from '../../modules/access/capabilities.js'
import { errors } from '../errors/app-error.js'

/**
 * الحراس تقرأ `request.auth` الذي يضعه `requireAuth`، فلا تُركَّب إلا بعده.
 * غيابه خطأ برمجي لا نقص صلاحية، ولذلك يُرفع 500 لا 403 — إخفاؤه خلف 403
 * يحوّل مسارًا مكشوفًا إلى عطل صامت.
 */
function requireContext(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new Error(
      'requireAuth must run before any authorization guard on this route.',
    )
  }

  return request.auth
}

export function requireCapability(capability: Capability): RequestHandler {
  return (request, _response, next) => {
    const context = requireContext(request)

    if (!context.capabilities.includes(capability)) {
      next(errors.forbidden())
      return
    }

    next()
  }
}

export function requireAnyCapability(
  ...capabilities: readonly Capability[]
): RequestHandler {
  return (request, _response, next) => {
    const context = requireContext(request)
    const allowed = capabilities.some((capability) =>
      context.capabilities.includes(capability),
    )

    if (!allowed) {
      next(errors.forbidden())
      return
    }

    next()
  }
}

export function requireAllCapabilities(
  ...capabilities: readonly Capability[]
): RequestHandler {
  return (request, _response, next) => {
    const context = requireContext(request)
    const allowed = capabilities.every((capability) =>
      context.capabilities.includes(capability),
    )

    if (!allowed) {
      next(errors.forbidden())
      return
    }

    next()
  }
}

/**
 * فصل النطاقين. الرسالة لا تكشف وجود المسار الآخر: ممثل شريك يحاول مسار
 * فريق لا يجب أن يستنتج شكل لوحة إيفا من نص الخطأ.
 */
export function requireKind(kind: 'STAFF' | 'PARTNER'): RequestHandler {
  return (request, _response, next) => {
    const context = requireContext(request)

    if (context.kind !== kind) {
      next(errors.forbidden())
      return
    }

    next()
  }
}

export const requireStaff = requireKind('STAFF')
export const requirePartner = requireKind('PARTNER')

/**
 * يثبت أن للمستخدم جهة يمثلها.
 *
 * لا يكفي أن يكون `kind = PARTNER`: حساب قُبلت دعوته ثم أُنهيت عضويته
 * يبقى من نوع شريك بلا جهة، وأي مسار يقرأ `partnerId` منه سيقرأ
 * `undefined` — وهو المكان الذي تتحول فيه استعلامات النطاق إلى تسريب
 * بيانات كل الشركاء. يُرفض هنا لا في كل خدمة على حدة.
 */
export const requirePartnerScope: RequestHandler = (
  request,
  _response,
  next,
) => {
  const context = requireContext(request)

  if (context.kind !== 'PARTNER' || !context.partner) {
    next(errors.forbidden())
    return
  }

  next()
}

/**
 * يمنع الكتابة من جهة موقوفة أو لم تُعتمد بعد.
 *
 * القراءة تبقى مسموحة عمدًا: ممثل جهة معلّقة يجب أن يرى سبب التعليق في
 * بوابته بدل أن يصطدم بشاشة فارغة ويفتح تذكرة دعم.
 */
export const requireActivePartner: RequestHandler = (
  request,
  _response,
  next,
) => {
  const context = requireContext(request)
  const partner = context.partner

  if (!partner) {
    next(errors.forbidden())
    return
  }

  if (partner.isSuspended) {
    next(errors.forbidden('حساب جهتكم معلّق مؤقتًا. راجعوا مكتب العلاقات.'))
    return
  }

  if (partner.stage !== 'ACTIVE') {
    next(errors.forbidden('لم تُعتمد شراكة جهتكم بعد.'))
    return
  }

  next()
}
