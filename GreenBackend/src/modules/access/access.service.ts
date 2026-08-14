import { and, eq } from 'drizzle-orm'

import { db } from '../../db/client.js'
import { memberships } from '../../db/schema/access.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import { partnerMemberships, partners } from '../../db/schema/partners.js'
import { type Capability, isCapability } from './capabilities.js'

export type AuthMembership = {
  officeId: string
  officeSlug: string
  officeNameAr: string
  roleId: string
  roleSlug: string
  roleNameAr: string
  isPrimary: boolean
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

  return {
    ...base,
    capabilities: collectCapabilities(
      membershipRows.map((row) => row.capabilities),
    ),
    memberships: membershipRows.map((row) => ({
      officeId: row.officeId,
      officeSlug: row.officeSlug,
      officeNameAr: row.officeNameAr,
      roleId: row.roleId,
      roleSlug: row.roleSlug,
      roleNameAr: row.roleNameAr,
      isPrimary: row.isPrimary,
    })),
    partner: null,
  }
}

export function hasCapability(
  context: AuthContext,
  capability: Capability,
): boolean {
  return context.capabilities.includes(capability)
}
