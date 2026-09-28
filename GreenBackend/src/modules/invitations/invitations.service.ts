import { and, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { normalizeEmail, normalizeText } from '../../common/utils/text.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import { invitationOfficeRoles, invitations } from '../../db/schema/access.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import { partners } from '../../db/schema/partners.js'

const additionalOffices = alias(offices, 'additional_offices')
const additionalRoles = alias(roles, 'additional_roles')
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { generateOpaqueToken, invitationExpiry } from '../auth/token.service.js'
import { enqueueEmail } from '../mail/outbox.service.js'

const invitationColumns = {
  id: invitations.id,
  email: invitations.email,
  fullNameAr: invitations.fullNameAr,
  kind: invitations.kind,
  status: invitations.status,
  roleId: invitations.roleId,
  roleNameAr: roles.nameAr,
  officeId: invitations.officeId,
  officeNameAr: offices.nameAr,
  partnerId: invitations.partnerId,
  partnerNameAr: partners.displayNameAr,
  additionalOfficeId: invitationOfficeRoles.officeId,
  additionalOfficeNameAr: additionalOffices.nameAr,
  additionalRoleId: invitationOfficeRoles.roleId,
  additionalRoleNameAr: additionalRoles.nameAr,
  expiresAt: invitations.expiresAt,
  createdAt: invitations.createdAt,
  acceptedAt: invitations.acceptedAt,
}

function serialize(row: {
  id: string
  email: string
  fullNameAr: string | null
  kind: 'STAFF' | 'PARTNER'
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  roleId: string
  roleNameAr: string
  officeId: string | null
  officeNameAr: string | null
  partnerId: string | null
  partnerNameAr: string | null
  additionalOfficeId: string | null
  additionalOfficeNameAr: string | null
  additionalRoleId: string | null
  additionalRoleNameAr: string | null
  expiresAt: Date
  createdAt: Date
  acceptedAt: Date | null
}) {
  return {
    id: row.id,
    email: row.email,
    fullNameAr: row.fullNameAr,
    kind: row.kind,
    status: row.status,
    roleId: row.roleId,
    roleNameAr: row.roleNameAr,
    officeId: row.officeId,
    officeNameAr: row.officeNameAr,
    partnerId: row.partnerId,
    partnerNameAr: row.partnerNameAr,
    additionalOfficeId: row.additionalOfficeId,
    additionalOfficeNameAr: row.additionalOfficeNameAr,
    additionalRoleId: row.additionalRoleId,
    additionalRoleNameAr: row.additionalRoleNameAr,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  }
}

type InvitationTarget = {
  kind: 'STAFF' | 'PARTNER'
  officeId: string | null
  partnerId: string | null
  labelAr: string
}

async function resolveOfficeTarget(
  officeId: string | undefined,
): Promise<InvitationTarget> {
  if (!officeId) {
    throw errors.unprocessable('دعوة عضو الفريق تتطلب تحديد المكتب.')
  }

  const [office] = await db
    .select({
      id: offices.id,
      nameAr: offices.nameAr,
      isActive: offices.isActive,
    })
    .from(offices)
    .where(eq(offices.id, officeId))
    .limit(1)

  if (!office) throw errors.unprocessable('المكتب المحدد غير موجود.')
  if (!office.isActive) throw errors.unprocessable('المكتب المحدد غير مفعّل.')

  return {
    kind: 'STAFF',
    officeId: office.id,
    partnerId: null,
    labelAr: office.nameAr,
  }
}

/**
 * دعوة ممثل الشريك لا تُرسل قبل اعتماد الشراكة.
 *
 * هذا ترتيب المسار في PLAN.md: «اعتماد المدير ← دعوة الممثل». دعوة ممثل
 * جهة لم تُعتمد تمنحه بوابة لا يستطيع فعل شيء فيها، وتلتف على البوابة
 * التي وُضعت لتضمن اكتمال الملف.
 */
async function resolvePartnerTarget(
  partnerId: string | undefined,
): Promise<InvitationTarget> {
  if (!partnerId) {
    throw errors.unprocessable('دعوة ممثل الشريك تتطلب تحديد الجهة.')
  }

  const [partner] = await db
    .select({
      id: partners.id,
      displayNameAr: partners.displayNameAr,
      stage: partners.stage,
      suspendedAt: partners.suspendedAt,
    })
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1)

  if (!partner) throw errors.unprocessable('الجهة المحددة غير موجودة.')

  if (partner.stage !== 'ACTIVE') {
    throw errors.unprocessable(
      'لا تُرسل دعوة ممثل قبل اعتماد الشراكة وتفعيل الجهة.',
    )
  }

  if (partner.suspendedAt) {
    throw errors.unprocessable('الجهة معلّقة مؤقتًا؛ ارفع التعليق أولًا.')
  }

  return {
    kind: 'PARTNER',
    officeId: null,
    partnerId: partner.id,
    labelAr: partner.displayNameAr,
  }
}

export async function createInvitation(
  // `| undefined` صريح لأن `exactOptionalPropertyTypes` يفرّق بين الحقل
  // الغائب والحقل الموجود بقيمة undefined، وZod ينتج الثاني.
  input: {
    email: string
    fullNameAr?: string | undefined
    roleId: string
    officeId?: string | undefined
    partnerId?: string | undefined
    additionalOfficeId?: string | undefined
    additionalRoleId?: string | undefined
  },
  actor: AuthContext,
  trace: RequestTrace,
) {
  const email = normalizeEmail(input.email)

  const [role] = await db
    .select({ id: roles.id, slug: roles.slug, scope: roles.scope, nameAr: roles.nameAr })
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1)

  if (!role) throw errors.unprocessable('الدور المحدد غير موجود.')

  /**
   * نوع الحساب يُشتق من نطاق الدور، فلا يمكن إرسال دعوة فريق بدور شريك
   * أو العكس عبر تلاعب في الطلب.
   */
  const target =
    role.scope === 'PARTNER'
      ? await resolvePartnerTarget(input.partnerId)
      : await resolveOfficeTarget(input.officeId)

  /**
   * العضوية الإضافية («صلاحيات الأعضاء») تتاح لدعوة فريق فقط، بمكتب
   * مختلف عن الرئيسي — عضوان نشطان بالمكتب نفسه غير ممكنَين أصلًا
   * (`memberships_active_unique`).
   */
  let additional: { officeId: string; roleId: string; roleNameAr: string } | null =
    null

  if (input.additionalOfficeId || input.additionalRoleId) {
    if (target.kind !== 'STAFF') {
      throw errors.unprocessable('العضوية الإضافية تتاح لدعوات الفريق فقط.')
    }

    if (!input.additionalOfficeId || !input.additionalRoleId) {
      throw errors.unprocessable('اختر المكتب والدور معًا للعضوية الإضافية.')
    }

    if (input.additionalOfficeId === target.officeId) {
      throw errors.unprocessable('اختر مكتبًا مختلفًا للعضوية الإضافية.')
    }

    const additionalTarget = await resolveOfficeTarget(input.additionalOfficeId)

    // مضمون بوجود المكتب: `resolveOfficeTarget` يرمي خطأً حين لا يجده.
    if (!additionalTarget.officeId) {
      throw new Error('resolveOfficeTarget returned a STAFF target without officeId.')
    }

    const [additionalRole] = await db
      .select({ id: roles.id, scope: roles.scope, nameAr: roles.nameAr })
      .from(roles)
      .where(eq(roles.id, input.additionalRoleId))
      .limit(1)

    if (!additionalRole) throw errors.unprocessable('الدور الإضافي غير موجود.')
    if (additionalRole.scope !== 'STAFF') {
      throw errors.unprocessable('الدور الإضافي يجب أن يكون من أدوار الفريق.')
    }

    additional = {
      officeId: additionalTarget.officeId,
      roleId: additionalRole.id,
      roleNameAr: additionalRole.nameAr,
    }
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existingUser) {
    throw errors.conflict('يوجد حساب بهذا البريد بالفعل.')
  }

  const { token, tokenHash } = generateOpaqueToken()

  const invitationId = await db.transaction(async (tx) => {
    // الفهرس الجزئي يسمح بدعوة معلّقة واحدة لكل بريد، فتُلغى السابقة أولًا.
    await tx
      .update(invitations)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: actor.userId,
      })
      .where(
        and(eq(invitations.email, email), eq(invitations.status, 'PENDING')),
      )

    const [created] = await tx
      .insert(invitations)
      .values({
        email,
        kind: target.kind,
        roleId: role.id,
        officeId: target.officeId,
        partnerId: target.partnerId,
        tokenHash,
        expiresAt: invitationExpiry(),
        invitedById: actor.userId,
        ...(input.fullNameAr
          ? { fullNameAr: normalizeText(input.fullNameAr) }
          : {}),
      })
      .returning({ id: invitations.id })

    if (!created) throw new Error('Failed to create invitation row.')

    if (additional) {
      await tx.insert(invitationOfficeRoles).values({
        invitationId: created.id,
        officeId: additional.officeId,
        roleId: additional.roleId,
      })
    }

    /**
     * الرسالة تُدرج في معاملة الدعوة نفسها: دعوة بلا بريد تعني شخصًا
     * ينتظر رابطًا لن يصل، وبريدًا لدعوة تراجعت يعني رابطًا يفتح لا شيء.
     */
    await enqueueEmail(tx, {
      templateKey: 'invitation',
      recipient: email,
      payload: {
        inviteUrl: `${env.ADMIN_APP_URL}/accept-invite/${token}`,
        roleNameAr: role.nameAr,
        scopeNameAr: target.labelAr,
        invitedByAr: actor.fullNameAr,
        expiresInDays: Math.round(env.INVITATION_TTL_HOURS / 24),
      },
    })

    await recordAudit(
      {
        action: 'invitation.created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'invitation',
        entityId: created.id,
        entityLabel: email,
        summaryAr:
          target.kind === 'STAFF'
            ? `دعوة عضو فريق بدور ${role.nameAr} في ${target.labelAr}`
            : `دعوة ممثل عن ${target.labelAr} بدور ${role.nameAr}`,
        metadata: {
          roleSlug: role.slug,
          officeId: target.officeId,
          partnerId: target.partnerId,
          ...(additional
            ? {
                additionalOfficeId: additional.officeId,
                additionalRoleId: additional.roleId,
              }
            : {}),
        },
        ...trace,
      },
      tx,
    )

    return created.id
  })

  const [row] = await db
    .select(invitationColumns)
    .from(invitations)
    .innerJoin(roles, eq(invitations.roleId, roles.id))
    .leftJoin(offices, eq(invitations.officeId, offices.id))
    .leftJoin(partners, eq(invitations.partnerId, partners.id))
    .leftJoin(invitationOfficeRoles, eq(invitationOfficeRoles.invitationId, invitations.id))
    .leftJoin(additionalOffices, eq(invitationOfficeRoles.officeId, additionalOffices.id))
    .leftJoin(additionalRoles, eq(invitationOfficeRoles.roleId, additionalRoles.id))
    .where(eq(invitations.id, invitationId))
    .limit(1)

  if (!row) throw new Error('Invitation vanished right after creation.')

  return {
    invitation: serialize(row),
    /** النص الصريح يعود مرة واحدة فقط؛ القاعدة تحفظ تجزئته لا نصه. */
    inviteUrl: `${env.ADMIN_APP_URL}/accept-invite/${token}`,
  }
}

export async function listInvitations(filters: {
  status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
}) {
  const rows = await db
    .select(invitationColumns)
    .from(invitations)
    .innerJoin(roles, eq(invitations.roleId, roles.id))
    .leftJoin(offices, eq(invitations.officeId, offices.id))
    .leftJoin(partners, eq(invitations.partnerId, partners.id))
    .leftJoin(invitationOfficeRoles, eq(invitationOfficeRoles.invitationId, invitations.id))
    .leftJoin(additionalOffices, eq(invitationOfficeRoles.officeId, additionalOffices.id))
    .leftJoin(additionalRoles, eq(invitationOfficeRoles.roleId, additionalRoles.id))
    .where(filters.status ? eq(invitations.status, filters.status) : undefined)
    .orderBy(desc(invitations.createdAt))
    .limit(200)

  return rows.map(serialize)
}

export async function revokeInvitation(
  invitationId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const now = new Date()

  const revoked = await db
    .update(invitations)
    .set({ status: 'REVOKED', revokedAt: now, revokedById: actor.userId })
    .where(
      and(eq(invitations.id, invitationId), eq(invitations.status, 'PENDING')),
    )
    .returning({ id: invitations.id, email: invitations.email })

  const row = revoked[0]

  if (!row) throw errors.notFound('الدعوة غير موجودة أو ليست معلّقة.')

  await recordAudit({
    action: 'invitation.revoked',
    severity: 'NOTICE',
    actorUserId: actor.userId,
    entityType: 'invitation',
    entityId: row.id,
    entityLabel: row.email,
    summaryAr: 'إلغاء دعوة معلّقة',
    ...trace,
  })
}
