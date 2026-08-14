import { randomUUID } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'

import { AppError, errors } from '../../common/errors/app-error.js'
import { normalizeEmail, normalizeText } from '../../common/utils/text.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import { invitations, memberships } from '../../db/schema/access.js'
import {
  sessions,
  users,
  verificationTokens,
} from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import {
  partnerContacts,
  partnerMemberships,
  partners,
} from '../../db/schema/partners.js'
import { type AuthContext, loadAuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { enqueueEmail } from '../mail/outbox.service.js'
import {
  burnPasswordTime,
  hashPassword,
  verifyPassword,
} from './password.service.js'
import {
  generateOpaqueToken,
  hashToken,
  passwordResetExpiry,
  refreshTokenExpiry,
  signAccessToken,
} from './token.service.js'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * رسالة واحدة لكل أسباب فشل الدخول.
 *
 * التمييز بين «البريد غير مسجل» و«كلمة المرور خاطئة» يحوّل صفحة الدخول
 * إلى أداة تعداد حسابات.
 */
const INVALID_CREDENTIALS = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'

export type SessionResult = {
  accessToken: string
  expiresInSeconds: number
  refreshToken: string
  user: AuthContext
}

async function issueSession(
  tx: Transaction,
  userId: string,
  trace: RequestTrace,
  // بدون التثبيت يستنتج TS نوع `randomUUID` القالبي فيرفض أي عائلة قائمة.
  familyId: string = randomUUID(),
) {
  const { token, tokenHash } = generateOpaqueToken()

  const [session] = await tx
    .insert(sessions)
    .values({
      userId,
      familyId,
      refreshTokenHash: tokenHash,
      expiresAt: refreshTokenExpiry(),
      userAgent: trace.userAgent,
      ipAddress: trace.ipAddress,
    })
    .returning({ id: sessions.id })

  if (!session) throw new Error('Failed to create session row.')

  return { sessionId: session.id, refreshToken: token, familyId }
}

async function buildSessionResult(
  userId: string,
  refreshToken: string,
): Promise<SessionResult> {
  const context = await loadAuthContext(userId)

  if (!context) throw new Error('Authenticated user disappeared mid-request.')

  const { token, expiresInSeconds } = await signAccessToken({
    userId: context.userId,
    kind: context.kind,
    tokenVersion: context.tokenVersion,
  })

  return {
    accessToken: token,
    expiresInSeconds,
    refreshToken,
    user: context,
  }
}

// ── تسجيل الدخول ───────────────────────────────────────────────────────

export async function login(
  input: { email: string; password: string },
  trace: RequestTrace,
): Promise<SessionResult> {
  const email = normalizeEmail(input.email)

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) {
    // يستهلك زمنًا مكافئًا للتحقق الحقيقي حتى لا يفرّق زمن الرد.
    await burnPasswordTime()
    await recordAudit({
      action: 'auth.login_failed',
      severity: 'NOTICE',
      summaryAr: 'محاولة دخول ببريد غير مسجّل',
      metadata: { email },
      ...trace,
    })

    throw errors.unauthorized(INVALID_CREDENTIALS)
  }

  const now = new Date()

  if (user.lockedUntil && user.lockedUntil > now) {
    await recordAudit({
      action: 'auth.login_blocked_locked',
      severity: 'WARNING',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      summaryAr: 'محاولة دخول على حساب مقفل مؤقتًا',
      metadata: { lockedUntil: user.lockedUntil.toISOString() },
      ...trace,
    })

    throw new AppError(
      `الحساب مقفل مؤقتًا بعد محاولات فاشلة متتالية. أعد المحاولة بعد ${env.AUTH_LOCK_MINUTES} دقيقة.`,
      423,
      'ACCOUNT_LOCKED',
    )
  }

  const passwordMatches = await verifyPassword(user.passwordHash, input.password)

  if (!passwordMatches) {
    const failedCount = user.failedLoginCount + 1
    const shouldLock = failedCount >= env.AUTH_MAX_FAILED_LOGINS

    await db
      .update(users)
      .set({
        // عند القفل يُصفَّر العدّاد: النافذة التالية تبدأ من جديد بعد انتهاء القفل.
        failedLoginCount: shouldLock ? 0 : failedCount,
        lockedUntil: shouldLock
          ? new Date(now.getTime() + env.AUTH_LOCK_MINUTES * 60_000)
          : null,
      })
      .where(eq(users.id, user.id))

    await recordAudit({
      action: shouldLock ? 'auth.account_locked' : 'auth.login_failed',
      severity: shouldLock ? 'WARNING' : 'NOTICE',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.fullNameAr,
      summaryAr: shouldLock
        ? 'قُفل الحساب مؤقتًا بعد محاولات فاشلة متتالية'
        : 'محاولة دخول بكلمة مرور خاطئة',
      metadata: { attempt: failedCount },
      ...trace,
    })

    throw errors.unauthorized(INVALID_CREDENTIALS)
  }

  // الحالة تُفحص بعد كلمة المرور: من لا يعرفها لا يستحق معرفة حالة الحساب.
  if (user.status !== 'ACTIVE') {
    await recordAudit({
      action: 'auth.login_blocked_status',
      severity: 'WARNING',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      summaryAr: 'محاولة دخول على حساب غير نشط',
      metadata: { status: user.status },
      ...trace,
    })

    throw errors.forbidden('الحساب موقوف. راجع الإدارة.')
  }

  const refreshToken = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(users.id, user.id))

    const issued = await issueSession(tx, user.id, trace)

    await recordAudit(
      {
        action: 'auth.login',
        actorUserId: user.id,
        entityType: 'session',
        entityId: issued.sessionId,
        entityLabel: user.fullNameAr,
        summaryAr: 'تسجيل دخول ناجح',
        ...trace,
      },
      tx,
    )

    return issued.refreshToken
  })

  return buildSessionResult(user.id, refreshToken)
}

// ── تدوير الجلسة ───────────────────────────────────────────────────────

export async function refreshSession(
  rawRefreshToken: string,
  trace: RequestTrace,
): Promise<SessionResult> {
  const tokenHash = hashToken(rawRefreshToken)

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, tokenHash))
    .limit(1)

  if (!session) throw errors.unauthorized('جلسة غير صالحة.')

  const now = new Date()

  if (session.revokedAt) {
    /**
     * رمز مُدوَّر يُقدَّم مرة ثانية يعني أن نسخة منه بيد طرف آخر: إما
     * المستخدم وإما السارق. لا سبيل للتمييز، فتُبطل العائلة كاملة
     * ويُجبر الطرفان على دخول جديد.
     */
    if (session.revokeReason === 'ROTATED') {
      await db
        .update(sessions)
        .set({ revokedAt: now, revokeReason: 'REUSE_DETECTED' })
        .where(
          and(
            eq(sessions.familyId, session.familyId),
            isNull(sessions.revokedAt),
          ),
        )

      await recordAudit({
        action: 'auth.refresh_reuse_detected',
        severity: 'CRITICAL',
        actorUserId: session.userId,
        entityType: 'session',
        entityId: session.id,
        summaryAr:
          'قُدّم رمز تحديث مُدوَّر سابقًا — أُبطلت عائلة الجلسة كاملة',
        metadata: { familyId: session.familyId },
        ...trace,
      })
    }

    throw errors.unauthorized('انتهت الجلسة. سجّل الدخول من جديد.')
  }

  if (session.expiresAt <= now) {
    await db
      .update(sessions)
      .set({ revokedAt: now, revokeReason: 'EXPIRED' })
      .where(eq(sessions.id, session.id))

    throw errors.unauthorized('انتهت الجلسة. سجّل الدخول من جديد.')
  }

  const [user] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)

  if (!user || user.status !== 'ACTIVE') {
    await db
      .update(sessions)
      .set({ revokedAt: now, revokeReason: 'ADMIN_REVOKED' })
      .where(eq(sessions.id, session.id))

    throw errors.forbidden('الحساب موقوف. راجع الإدارة.')
  }

  const refreshToken = await db.transaction(async (tx) => {
    const issued = await issueSession(tx, session.userId, trace, session.familyId)

    await tx
      .update(sessions)
      .set({
        revokedAt: now,
        revokeReason: 'ROTATED',
        lastUsedAt: now,
        replacedById: issued.sessionId,
      })
      .where(eq(sessions.id, session.id))

    return issued.refreshToken
  })

  return buildSessionResult(session.userId, refreshToken)
}

// ── الخروج ─────────────────────────────────────────────────────────────

export async function logout(
  rawRefreshToken: string | undefined,
  trace: RequestTrace,
) {
  if (!rawRefreshToken) return

  const tokenHash = hashToken(rawRefreshToken)
  const now = new Date()

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: now, revokeReason: 'LOGOUT', lastUsedAt: now })
    .where(
      and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)),
    )
    .returning({ id: sessions.id, userId: sessions.userId })

  const session = revoked[0]

  if (session) {
    await recordAudit({
      action: 'auth.logout',
      actorUserId: session.userId,
      entityType: 'session',
      entityId: session.id,
      summaryAr: 'إنهاء الجلسة',
      ...trace,
    })
  }
}

/**
 * رفع `tokenVersion` هو ما يجعل الإنهاء فوريًا: رموز الوصول الحالية
 * تفشل عند أول طلب لأن `requireAuth` يقارن النسخة، دون انتظار انتهائها.
 */
export async function logoutAll(userId: string, trace: RequestTrace) {
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      // زيادة ذرّية في SQL: قراءة النسخة ثم كتابتها تفقد زيادة متزامنة.
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId))

    await tx
      .update(sessions)
      .set({ revokedAt: now, revokeReason: 'LOGOUT_ALL' })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))

    await recordAudit(
      {
        action: 'auth.logout_all',
        actorUserId: userId,
        entityType: 'user',
        entityId: userId,
        severity: 'NOTICE',
        summaryAr: 'إنهاء كل الجلسات على كل الأجهزة',
        ...trace,
      },
      tx,
    )
  })
}

// ── استعادة كلمة المرور ────────────────────────────────────────────────

/**
 * يعيد الرمز الصريح للمستدعي بدل إرساله بالبريد — البريد يأتي مع
 * وحدة الإشعارات لاحقًا. المتحكم لا يمرره في الاستجابة أبدًا؛ الاختبارات
 * وحدها تستدعي الخدمة مباشرة.
 */
export async function requestPasswordReset(
  rawEmail: string,
  trace: RequestTrace,
): Promise<{ token: string; userId: string } | null> {
  const email = normalizeEmail(rawEmail)

  const [user] = await db
    .select({ id: users.id, status: users.status, fullNameAr: users.fullNameAr })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user || user.status !== 'ACTIVE') {
    await recordAudit({
      action: 'auth.password_reset_requested_unknown',
      severity: 'NOTICE',
      summaryAr: 'طلب استعادة لبريد غير مسجّل أو غير نشط',
      metadata: { email },
      ...trace,
    })

    return null
  }

  const { token, tokenHash } = generateOpaqueToken()

  await db.transaction(async (tx) => {
    // الفهرس الجزئي يسمح برمز فعّال واحد لكل غرض، فيُستهلك السابق أولًا.
    await tx
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(verificationTokens.userId, user.id),
          eq(verificationTokens.purpose, 'PASSWORD_RESET'),
          isNull(verificationTokens.consumedAt),
        ),
      )

    await tx.insert(verificationTokens).values({
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash,
      expiresAt: passwordResetExpiry(),
      requestedIp: trace.ipAddress,
    })

    await enqueueEmail(tx, {
      templateKey: 'password-reset',
      recipient: email,
      payload: {
        resetUrl: `${env.ADMIN_APP_URL}/reset-password/${token}`,
        expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      },
    })

    await recordAudit(
      {
        action: 'auth.password_reset_requested',
        actorUserId: user.id,
        entityType: 'user',
        entityId: user.id,
        entityLabel: user.fullNameAr,
        summaryAr: 'طلب رابط استعادة كلمة المرور',
        ...trace,
      },
      tx,
    )
  })

  return { token, userId: user.id }
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
  trace: RequestTrace,
) {
  const tokenHash = hashToken(rawToken)
  const now = new Date()

  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.purpose, 'PASSWORD_RESET'),
      ),
    )
    .limit(1)

  if (!record || record.consumedAt || record.expiresAt <= now) {
    throw errors.badRequest('رابط الاستعادة غير صالح أو منتهي الصلاحية.')
  }

  const passwordHash = await hashPassword(newPassword)

  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ consumedAt: now })
      .where(eq(verificationTokens.id, record.id))

    await tx
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: now,
        // تغيير كلمة المرور قد يكون ردًا على اختراق، فتسقط كل الجلسات.
        tokenVersion: sql`${users.tokenVersion} + 1`,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, record.userId))

    await tx
      .update(sessions)
      .set({ revokedAt: now, revokeReason: 'PASSWORD_CHANGED' })
      .where(
        and(eq(sessions.userId, record.userId), isNull(sessions.revokedAt)),
      )

    await recordAudit(
      {
        action: 'auth.password_reset_completed',
        severity: 'NOTICE',
        actorUserId: record.userId,
        entityType: 'user',
        entityId: record.userId,
        summaryAr: 'تعيين كلمة مرور جديدة وإبطال كل الجلسات',
        ...trace,
      },
      tx,
    )
  })
}

// ── الدعوات ────────────────────────────────────────────────────────────

export async function previewInvitation(rawToken: string) {
  const tokenHash = hashToken(rawToken)

  const [record] = await db
    .select({
      email: invitations.email,
      fullNameAr: invitations.fullNameAr,
      kind: invitations.kind,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      roleNameAr: roles.nameAr,
      officeNameAr: offices.nameAr,
      partnerNameAr: partners.displayNameAr,
    })
    .from(invitations)
    .innerJoin(roles, eq(invitations.roleId, roles.id))
    .leftJoin(offices, eq(invitations.officeId, offices.id))
    .leftJoin(partners, eq(invitations.partnerId, partners.id))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1)

  if (!record || record.status !== 'PENDING' || record.expiresAt <= new Date()) {
    throw errors.notFound('الدعوة غير صالحة أو انتهت صلاحيتها.')
  }

  return {
    email: record.email,
    fullNameAr: record.fullNameAr,
    kind: record.kind,
    roleNameAr: record.roleNameAr,
    officeNameAr: record.officeNameAr,
    partnerNameAr: record.partnerNameAr,
    expiresAt: record.expiresAt.toISOString(),
  }
}

export async function acceptInvitation(
  rawToken: string,
  input: { fullNameAr: string; password: string; phone?: string | undefined },
  trace: RequestTrace,
): Promise<SessionResult> {
  const tokenHash = hashToken(rawToken)
  const now = new Date()

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1)

  if (
    !invitation ||
    invitation.status !== 'PENDING' ||
    invitation.expiresAt <= now
  ) {
    throw errors.notFound('الدعوة غير صالحة أو انتهت صلاحيتها.')
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1)

  if (existing) {
    throw errors.conflict('يوجد حساب بهذا البريد. استخدم استعادة كلمة المرور.')
  }

  const passwordHash = await hashPassword(input.password)

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email: invitation.email,
        passwordHash,
        fullNameAr: normalizeText(input.fullNameAr),
        kind: invitation.kind,
        status: 'ACTIVE',
        // قبول الدعوة عبر رابط وصل البريد إثباتٌ لملكيته.
        emailVerifiedAt: now,
        passwordChangedAt: now,
        ...(input.phone ? { phone: input.phone.trim() } : {}),
      })
      .returning({ id: users.id })

    if (!created) throw new Error('Failed to create user row.')

    if (invitation.officeId) {
      await tx.insert(memberships).values({
        userId: created.id,
        officeId: invitation.officeId,
        roleId: invitation.roleId,
        isPrimary: true,
      })
    } else if (invitation.partnerId) {
      await tx.insert(partnerMemberships).values({
        userId: created.id,
        partnerId: invitation.partnerId,
        roleId: invitation.roleId,
      })

      /**
       * يربط جهة الاتصال الورقية بالحساب الجديد حين يتطابق البريد.
       * الشرط `linkedUserId is null` يمنع سرقة ربط قائم لو أُعيد
       * استعمال البريد نفسه لاحقًا.
       */
      await tx
        .update(partnerContacts)
        .set({ linkedUserId: created.id })
        .where(
          and(
            eq(partnerContacts.partnerId, invitation.partnerId),
            eq(partnerContacts.email, invitation.email),
            isNull(partnerContacts.linkedUserId),
          ),
        )
    }

    await tx
      .update(invitations)
      .set({
        status: 'ACCEPTED',
        acceptedAt: now,
        acceptedUserId: created.id,
      })
      .where(eq(invitations.id, invitation.id))

    const issued = await issueSession(tx, created.id, trace)

    await recordAudit(
      {
        action: 'invitation.accepted',
        severity: 'NOTICE',
        actorUserId: created.id,
        entityType: 'invitation',
        entityId: invitation.id,
        entityLabel: invitation.email,
        summaryAr: 'قبول الدعوة وإنشاء الحساب',
        metadata: { kind: invitation.kind },
        ...trace,
      },
      tx,
    )

    return { userId: created.id, refreshToken: issued.refreshToken }
  })

  return buildSessionResult(result.userId, result.refreshToken)
}
