import { and, eq, inArray } from 'drizzle-orm'

import { db } from '../../db/client.js'
import {
  membershipCapabilityOverrides,
  memberships,
} from '../../db/schema/access.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import { partnerMemberships, partners } from '../../db/schema/partners.js'
import {
  type Capability,
  type CapabilityOverride,
  effectiveCapabilities,
  isCapability,
  isOfficeScoped,
} from './capabilities.js'

export type AuthMembership = {
  officeId: string
  officeSlug: string
  officeNameAr: string
  roleId: string
  roleSlug: string
  roleNameAr: string
  isPrimary: boolean
  /** قدرات هذه العضوية وحدها بعد الاستثناءات؛ نطاقها مكتبها وأقسامه. */
  capabilities: readonly Capability[]
}

/** الجهة التي يمثلها المستخدم — أساس عزل بيانات الشركاء عن بعضها. */
export type AuthPartner = {
  id: string
  displayNameAr: string
  stage: string
  isSuspended: boolean
  roleSlug: string
  roleNameAr: string
}

export type AuthContext = {
  userId: string
  email: string
  fullNameAr: string
  kind: 'STAFF' | 'PARTNER'
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
  tokenVersion: number
  capabilities: readonly Capability[]
  memberships: readonly AuthMembership[]
  partner: AuthPartner | null
  /**
   * لكل قدرة مقيّدة بمكتب: المكاتب التي تسري فيها مع أقسامها الفرعية.
   * لا يُرسل للواجهة؛ يُقرأ عبر `scope.ts` وحده، لأن القدرة العامة
   * المقابلة (`team.all`) تتجاوزه.
   */
  officeScopes: ReadonlyMap<Capability, ReadonlySet<string>>
}

function collectCapabilities(sources: readonly (readonly string[])[]) {
  const granted = new Set<Capability>()

  for (const values of sources) {
    for (const value of values) {
      // قدرة بقيت في القاعدة بعد حذفها من الكود تُتجاهل بدل أن تُمرَّر.
      if (isCapability(value)) granted.add(value)
    }
  }

  return [...granted].sort()
}

/**
 * مكتب العضوية وكل ما تحته: مدير العمليات يدير قسمي الهندسات والتنفيذ.
 * الجدول صغير، فيُقرأ كاملًا مرة لكل طلب يحتاجه بدل استعلام متكرر.
 */
async function loadOfficeDescendants() {
  const rows = await db
    .select({ id: offices.id, parentId: offices.parentId })
    .from(offices)

  const children = new Map<string, string[]>()

  for (const row of rows) {
    if (!row.parentId) continue
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id])
  }

  return (officeId: string) => {
    const found = new Set<string>([officeId])
    const queue = [officeId]

    while (queue.length > 0) {
      for (const child of children.get(queue.pop()!) ?? []) {
        if (!found.has(child)) {
          found.add(child)
          queue.push(child)
        }
      }
    }

    return found
  }
}

async function resolveOfficeScopes(
  resolved: readonly { officeId: string; capabilities: readonly Capability[] }[],
  held: readonly Capability[],
) {
  const scopes = new Map<Capability, ReadonlySet<string>>()
  const scoped = held.filter(isOfficeScoped)

  // أغلب الأعضاء لا يحملون قدرة مقيّدة، فلا تُقرأ شجرة المكاتب لهم أصلًا.
  if (scoped.length === 0) return scopes

  const descendants = await loadOfficeDescendants()

  for (const capability of scoped) {
    const officeIds = new Set<string>()

    for (const membership of resolved) {
      if (!membership.capabilities.includes(capability)) continue

      for (const officeId of descendants(membership.officeId)) {
        officeIds.add(officeId)
      }
    }

    scopes.set(capability, officeIds)
  }

  return scopes
}

/**
 * يجمع هوية المستخدم وقدراته الفعلية.
 *
 * القدرات تُحل في كل طلب لا تُحمل في الرمز: إنهاء العضوية يسحب القدرة
 * فورًا دون انتظار انتهاء رمز الوصول.
 *
 * المساران منفصلان تمامًا. موظف يقرأ عضوياته المكتبية، وممثل شريك يقرأ
 * عضويته في جهته — ولا يخلط أحدهما بالآخر حتى لو حمل صفًّا في الجدول
 * الخطأ، لأن `kind` وحده يقرر أي جدول يُقرأ.
 */
export async function loadAuthContext(
  userId: string,
): Promise<AuthContext | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullNameAr: users.fullNameAr,
      kind: users.kind,
      status: users.status,
      tokenVersion: users.tokenVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return null

  const base = {
    userId: user.id,
    email: user.email,
    fullNameAr: user.fullNameAr,
    kind: user.kind,
    status: user.status,
    tokenVersion: user.tokenVersion,
  }

  if (user.kind === 'PARTNER') {
    const [row] = await db
      .select({
        partnerId: partners.id,
        displayNameAr: partners.displayNameAr,
        stage: partners.stage,
        suspendedAt: partners.suspendedAt,
        roleSlug: roles.slug,
        roleNameAr: roles.nameAr,
        capabilities: roles.capabilities,
      })
      .from(partnerMemberships)
      .innerJoin(partners, eq(partnerMemberships.partnerId, partners.id))
      .innerJoin(roles, eq(partnerMemberships.roleId, roles.id))
      .where(
        and(
          eq(partnerMemberships.userId, userId),
          eq(partnerMemberships.status, 'ACTIVE'),
        ),
      )
      .limit(1)

    return {
      ...base,
      capabilities: row ? collectCapabilities([row.capabilities]) : [],
      memberships: [],
      officeScopes: new Map(),
      partner: row
        ? {
            id: row.partnerId,
            displayNameAr: row.displayNameAr,
            stage: row.stage,
            isSuspended: row.suspendedAt !== null,
            roleSlug: row.roleSlug,
            roleNameAr: row.roleNameAr,
          }
        : null,
    }
  }

  const membershipRows = await db
    .select({
      id: memberships.id,
      officeId: offices.id,
      officeSlug: offices.slug,
      officeNameAr: offices.nameAr,
      roleId: roles.id,
      roleSlug: roles.slug,
      roleNameAr: roles.nameAr,
      isPrimary: memberships.isPrimary,
      capabilities: roles.capabilities,
    })
    .from(memberships)
    .innerJoin(offices, eq(memberships.officeId, offices.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'ACTIVE')))

  const overridesByMembership = await loadOverrides(
    membershipRows.map((row) => row.id),
  )

  const resolved = membershipRows.map((row) => ({
    officeId: row.officeId,
    officeSlug: row.officeSlug,
    officeNameAr: row.officeNameAr,
    roleId: row.roleId,
    roleSlug: row.roleSlug,
    roleNameAr: row.roleNameAr,
    isPrimary: row.isPrimary,
    capabilities: effectiveCapabilities(
      row.capabilities,
      overridesByMembership.get(row.id) ?? [],
    ),
  }))

  const capabilities = collectCapabilities(
    resolved.map((membership) => membership.capabilities),
  )

  return {
    ...base,
    capabilities,
    memberships: resolved,
    officeScopes: await resolveOfficeScopes(resolved, capabilities),
    partner: null,
  }
}

/** استثناءات العضويات مجمّعة بمعرّفها — تستعملها الجلسة وملف العضو معًا. */
export async function loadOverrides(membershipIds: readonly string[]) {
  const byMembership = new Map<string, CapabilityOverride[]>()

  if (membershipIds.length === 0) return byMembership

  const rows = await db
    .select({
      membershipId: membershipCapabilityOverrides.membershipId,
      capability: membershipCapabilityOverrides.capability,
      effect: membershipCapabilityOverrides.effect,
    })
    .from(membershipCapabilityOverrides)
    .where(inArray(membershipCapabilityOverrides.membershipId, [...membershipIds]))

  for (const row of rows) {
    byMembership.set(row.membershipId, [
      ...(byMembership.get(row.membershipId) ?? []),
      { capability: row.capability, effect: row.effect },
    ])
  }

  return byMembership
}

export function hasCapability(
  context: AuthContext,
  capability: Capability,
): boolean {
  return context.capabilities.includes(capability)
}
