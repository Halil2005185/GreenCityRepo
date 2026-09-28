import type { AuthContext } from './access.service.js'
import {
  type Capability,
  isOfficeScoped,
  ORG_WIDE_COUNTERPART,
} from './capabilities.js'

export type OfficeScope = 'ALL' | ReadonlySet<string>

const NOWHERE: ReadonlySet<string> = new Set()

/**
 * المكاتب التي تسري فيها قدرة مقيّدة للمستخدم، أو `ALL`.
 *
 * `capabilities` المسطّحة لا تكفي لقدرة مقيّدة: مدير الإعلام يحمل
 * `team.manage` فتظهر فيها، لكنها لا تجعله مدير العمليات. كل قرار على
 * مكتب بعينه يمرّ من هنا.
 */
export function officeScope(actor: AuthContext, capability: Capability): OfficeScope {
  const orgWide = ORG_WIDE_COUNTERPART[capability]

  if (orgWide && actor.capabilities.includes(orgWide)) return 'ALL'

  return actor.officeScopes.get(capability) ?? NOWHERE
}

/**
 * هل يحمل المستخدم القدرة في هذا المكتب؟ القدرة غير المقيّدة تسري أينما
 * حُملت، فالمكتب لا يغيّر جوابها.
 */
export function holdsIn(
  actor: AuthContext,
  capability: Capability,
  officeId: string,
): boolean {
  if (!isOfficeScoped(capability)) return actor.capabilities.includes(capability)

  const scope = officeScope(actor, capability)

  return scope === 'ALL' || scope.has(officeId)
}

/** هل يحمل المستخدم القدرة في أي مكتب — لحارس المسار قبل معرفة المكتب. */
export function holdsAnywhere(actor: AuthContext, capability: Capability): boolean {
  const orgWide = ORG_WIDE_COUNTERPART[capability]

  return (
    actor.capabilities.includes(capability) ||
    Boolean(orgWide && actor.capabilities.includes(orgWide))
  )
}
