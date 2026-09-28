import { errors } from '../../common/errors/app-error.js'
import type { AuthContext } from './access.service.js'
import {
  ADMIN_CAPABILITIES,
  type Capability,
  capabilityNameAr,
  isAdminCapability,
  isCapability,
  isOfficeScoped,
} from './capabilities.js'
import { holdsIn } from './scope.js'

/**
 * قواعد توزيع الصلاحيات في مكان واحد. كل مسار يمنح أو ينزع — العضويات،
 * الاستثناءات الفردية، الدعوات، حزم الأدوار — يمرّ من هنا، فلا يبقى مسار
 * نسي فحصًا كما حدث مع الدعوات.
 *
 * القاعدة الأم: لا يعطي أحد ما لا يملك. وفوقها:
 * - القدرة المقيّدة بمكتب تُفوَّض في مكتب يحملها المنفّذ فيه؛ مدير الإعلام
 *   لا يعطي في العمليات ما يحمله في الإعلام.
 * - قدرات فئة ADMIN لا يفوّضها إلا حامل `roles.manage`، فلا يصنع مدير
 *   فريق مديرًا مثله.
 */

/**
 * `officeId = null` يعني تفويضًا بالاسم دون مكتب — حزمة دور تُحرَّر، أو
 * دعوة يثبّت مكتبها مسؤول شؤون الفريق.
 */
export function canDelegate(
  actor: AuthContext,
  capability: Capability,
  officeId: string | null,
): boolean {
  if (isAdminCapability(capability) && !actor.capabilities.includes('roles.manage')) {
    return false
  }

  if (officeId !== null && isOfficeScoped(capability)) {
    return holdsIn(actor, capability, officeId)
  }

  return actor.capabilities.includes(capability)
}

/** ما لا يستطيع المنفّذ تفويضه من مجموعة قدرات؛ القدرة الميتة لا تُحسب. */
export function undelegable(
  actor: AuthContext,
  capabilities: readonly string[],
  officeId: string | null,
): Capability[] {
  return capabilities
    .filter(isCapability)
    .filter((capability) => !canDelegate(actor, capability, officeId))
}

/** إدارة أعضاء فريق: `team.manage` فيه أو في مكتب أعلى، أو `team.all`. */
export function canManageOffice(actor: AuthContext, officeId: string): boolean {
  return holdsIn(actor, 'team.manage', officeId)
}

export function assertNotSelf(actor: AuthContext, userId: string) {
  if (actor.userId === userId) {
    throw errors.forbidden('لا يمكنك تعديل عضوياتك بنفسك؛ يتولاها مسؤول آخر.')
  }
}

export function assertCanManageOffice(actor: AuthContext, officeId: string) {
  if (!canManageOffice(actor, officeId)) {
    throw errors.forbidden('لا تدير أعضاء هذا الفريق.')
  }
}

/**
 * يمنح دورًا أو يمسّ عضوية بقدرات كهذه. يُستعمل لحزمة الدور المُسنَد
 * ولقدرات العضوية **الفعلية** قبل تعديلها — هكذا لا يمسّ مدير فريق زميلًا
 * مديرًا، ولا يمسّ أحد عضوية المدير العام إلا مدير عام.
 */
export function assertCanDelegateAll(
  actor: AuthContext,
  capabilities: readonly string[],
  officeId: string | null,
  messageAr: string,
) {
  if (undelegable(actor, capabilities, officeId).length > 0) {
    throw errors.forbidden(messageAr)
  }
}

export function assertCanDelegate(
  actor: AuthContext,
  capability: Capability,
  officeId: string | null,
) {
  if (!canDelegate(actor, capability, officeId)) {
    throw errors.forbidden(
      `لا تملك منح «${capabilityNameAr(capability)}» أو نزعها في هذا الفريق.`,
    )
  }
}

/**
 * حزمة دور تُحرَّر: القديمة والجديدة كلتاهما مما يحمله المحرِّر، وتغيير
 * أي قدرة إدارية فيها يتطلب حمل القدرات الإدارية كلها — وإلا أضاف القسم
 * التقني `roles.manage` إلى «عضو فريق» فصار كل عضو مشرفًا.
 */
export function assertCanEditBundle(
  actor: AuthContext,
  before: readonly string[],
  after: readonly string[],
) {
  const touched = [...new Set([...before, ...after])].filter(isCapability)
  const missing = touched.filter((capability) => !actor.capabilities.includes(capability))

  if (missing.length > 0) {
    throw errors.forbidden(
      `الحزمة تتضمن صلاحيات لا تملكها: ${missing.map(capabilityNameAr).join('، ')}.`,
    )
  }

  const adminChanged = touched.some(
    (capability) =>
      isAdminCapability(capability) &&
      before.includes(capability) !== after.includes(capability),
  )

  if (
    adminChanged &&
    !ADMIN_CAPABILITIES.every((capability) => actor.capabilities.includes(capability))
  ) {
    throw errors.forbidden(
      'تغيير الصلاحيات الإدارية في حزمة دور محصور بمن يحمل الصلاحيات الإدارية كلها.',
    )
  }
}
