import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import { sessions, users } from '../../src/db/schema/identity.js'
import { runSeed } from '../../src/db/seed.js'
import {
  requestPasswordReset,
} from '../../src/modules/auth/auth.service.js'
import {
  TEST_PASSWORD,
  bearer,
  createStaffUser,
  extractRefreshCookie,
  login,
} from '../helpers/auth.js'
import {
  closeTestDatabase,
  ensureTestDatabase,
  resetDatabase,
} from '../helpers/database.js'

const ready = await ensureTestDatabase()

/**
 * إغلاق واحد على مستوى الملف لا داخل كل describe: `afterAll` داخل
 * describe يعمل عند انتهائه هو، فيقفل الـpool على الكتل التي بعده.
 */
afterAll(async () => {
  await closeTestDatabase()
})

const trace = { ipAddress: '127.0.0.1', userAgent: 'vitest', requestId: 'test' }

describe.runIf(ready)('auth flow', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('logs in and returns the resolved capabilities', async () => {
    await createStaffUser({
      email: 'ops@greencities.test',
      roleSlug: 'OPERATIONS',
      officeSlug: 'operations',
      fullNameAr: 'بتول الحسن',
    })

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ops@greencities.test', password: TEST_PASSWORD })
      .expect(200)

    expect(response.body.user).toMatchObject({
      email: 'ops@greencities.test',
      fullNameAr: 'بتول الحسن',
      kind: 'STAFF',
    })
    expect(response.body.user.capabilities).toContain('work.approve')
    expect(response.body.user.capabilities).not.toContain('partners.approve')
    expect(response.body.user.memberships[0]).toMatchObject({
      officeSlug: 'operations',
      roleSlug: 'OPERATIONS',
      isPrimary: true,
    })
    expect(response.body.accessToken).toBeTypeOf('string')

    const cookies = response.headers['set-cookie'] as unknown as string[]
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('gc_refresh='))

    expect(refreshCookie).toBeDefined()
    expect(refreshCookie).toContain('HttpOnly')
    expect(refreshCookie).toContain('Path=/api/auth')
    expect(refreshCookie).toContain('SameSite=Strict')
  })

  /** لا يجوز أن يفرّق الرد بين «بريد غير مسجل» و«كلمة مرور خاطئة». */
  it('gives the same answer for an unknown email and a wrong password', async () => {
    await createStaffUser({ email: 'known@greencities.test', roleSlug: 'MEMBER' })

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'known@greencities.test', password: 'wrong-password-here' })
      .expect(401)

    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@greencities.test', password: 'wrong-password-here' })
      .expect(401)

    expect(wrongPassword.body.detail).toBe(unknownEmail.body.detail)
    expect(wrongPassword.body.title).toBe(unknownEmail.body.title)
  })

  it('locks the account after the configured number of failures', async () => {
    await createStaffUser({ email: 'lock@greencities.test', roleSlug: 'MEMBER' })

    // AUTH_MAX_FAILED_LOGINS = 3 في بيئة الاختبار.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'lock@greencities.test', password: 'definitely-wrong' })
        .expect(401)
    }

    // كلمة المرور الصحيحة لا تفتح الحساب المقفل.
    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lock@greencities.test', password: TEST_PASSWORD })
      .expect(423)

    expect(locked.body.title).toBe('ACCOUNT_LOCKED')

    const [row] = await db
      .select({ lockedUntil: users.lockedUntil })
      .from(users)
      .where(eq(users.email, 'lock@greencities.test'))
      .limit(1)

    expect(row?.lockedUntil).toBeInstanceOf(Date)
  })

  it('refuses a suspended account that knows its password', async () => {
    await createStaffUser({
      email: 'suspended@greencities.test',
      roleSlug: 'MEMBER',
      status: 'SUSPENDED',
    })

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'suspended@greencities.test', password: TEST_PASSWORD })
      .expect(403)
  })

  it('guards /me and returns the caller once authenticated', async () => {
    await createStaffUser({ email: 'me@greencities.test', roleSlug: 'TECH' })

    await request(app).get('/api/auth/me').expect(401)

    const session = await login('me@greencities.test')

    const response = await request(app)
      .get('/api/auth/me')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    expect(response.body.email).toBe('me@greencities.test')
    expect(response.body.capabilities).toContain('users.manage')
    // لا يتسرّب أي حقل داخلي إلى الواجهة.
    expect(response.body).not.toHaveProperty('tokenVersion')
    expect(response.body).not.toHaveProperty('passwordHash')
    expect(response.body).not.toHaveProperty('status')
  })

  it('rotates the refresh token and invalidates the previous one', async () => {
    await createStaffUser({ email: 'rotate@greencities.test', roleSlug: 'MEMBER' })

    const first = await login('rotate@greencities.test')

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .set('cookie', first.refreshCookie)
      .expect(200)

    const secondCookie = extractRefreshCookie(
      rotated.headers['set-cookie'] as unknown as string[],
    )

    expect(secondCookie).not.toBe(first.refreshCookie)

    // الرمز الجديد يعمل.
    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', secondCookie)
      .expect(200)
  })

  /**
   * أهم اختبار أمني في هذا الملف: إعادة استعمال رمز مُدوَّر تعني أن نسخة
   * منه بيد طرف آخر، فيجب أن تسقط العائلة كاملة لا الرمز المُعاد وحده.
   */
  it('kills the whole session family when a rotated token is replayed', async () => {
    await createStaffUser({ email: 'replay@greencities.test', roleSlug: 'MEMBER' })

    const first = await login('replay@greencities.test')

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .set('cookie', first.refreshCookie)
      .expect(200)

    const liveCookie = extractRefreshCookie(
      rotated.headers['set-cookie'] as unknown as string[],
    )

    // إعادة استعمال الرمز القديم.
    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', first.refreshCookie)
      .expect(401)

    // الرمز الحي أيضًا يسقط، لأن العائلة كلها صارت مشبوهة.
    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', liveCookie)
      .expect(401)

    const [alarm] = await db
      .select({ severity: auditLogs.severity })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.refresh_reuse_detected'))
      .limit(1)

    expect(alarm?.severity).toBe('CRITICAL')
  })

  it('invalidates live access tokens on logout-all', async () => {
    await createStaffUser({ email: 'all@greencities.test', roleSlug: 'MEMBER' })

    const session = await login('all@greencities.test')

    await request(app)
      .get('/api/auth/me')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    await request(app)
      .post('/api/auth/logout-all')
      .set('authorization', bearer(session.accessToken))
      .expect(204)

    // رمز الوصول لم ينتهِ زمنيًا، لكنه سقط فورًا برفع tokenVersion.
    await request(app)
      .get('/api/auth/me')
      .set('authorization', bearer(session.accessToken))
      .expect(401)

    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', session.refreshCookie)
      .expect(401)
  })

  it('ends only the current session on logout', async () => {
    await createStaffUser({ email: 'one@greencities.test', roleSlug: 'MEMBER' })

    const deviceA = await login('one@greencities.test')
    const deviceB = await login('one@greencities.test')

    await request(app)
      .post('/api/auth/logout')
      .set('cookie', deviceA.refreshCookie)
      .expect(204)

    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', deviceA.refreshCookie)
      .expect(401)

    // الجهاز الآخر يبقى عاملًا.
    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', deviceB.refreshCookie)
      .expect(200)
  })

  it('writes an audit trail for successful and failed logins', async () => {
    const user = await createStaffUser({
      email: 'audit@greencities.test',
      roleSlug: 'MEMBER',
      fullNameAr: 'عضو التدقيق',
    })

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'audit@greencities.test', password: 'wrong-password' })
      .expect(401)

    await login('audit@greencities.test')

    const rows = await db
      .select({ action: auditLogs.action, actorUserId: auditLogs.actorUserId })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, user.userId))

    const actions = rows.map((row) => row.action)

    expect(actions).toContain('auth.login')
    expect(actions).toContain('auth.login_failed')
  })
})

describe.runIf(ready)('password reset', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('always answers 202 so the endpoint cannot enumerate accounts', async () => {
    await createStaffUser({ email: 'real@greencities.test', roleSlug: 'MEMBER' })

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'real@greencities.test' })
      .expect(202)

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@greencities.test' })
      .expect(202)
  })

  it('never returns the reset token in the response body', async () => {
    await createStaffUser({ email: 'leak@greencities.test', roleSlug: 'MEMBER' })

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'leak@greencities.test' })
      .expect(202)

    expect(JSON.stringify(response.body)).not.toMatch(/token/i)
  })

  it('changes the password, revokes sessions, and burns the token', async () => {
    await createStaffUser({ email: 'reset@greencities.test', roleSlug: 'MEMBER' })

    const before = await login('reset@greencities.test')

    const issued = await requestPasswordReset('reset@greencities.test', trace)

    expect(issued).not.toBeNull()

    const newPassword = 'a-brand-new-passphrase'

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: issued!.token, password: newPassword })
      .expect(204)

    // كلمة المرور القديمة لم تعد تعمل، والجديدة تعمل.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@greencities.test', password: TEST_PASSWORD })
      .expect(401)

    await login('reset@greencities.test', newPassword)

    // الجلسة التي كانت قائمة قبل التغيير سقطت.
    await request(app)
      .post('/api/auth/refresh')
      .set('cookie', before.refreshCookie)
      .expect(401)

    const revoked = await db
      .select({ reason: sessions.revokeReason })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessions.id),
          eq(sessions.revokeReason, 'PASSWORD_CHANGED'),
        ),
      )

    expect(revoked.length).toBeGreaterThan(0)

    // الرمز يُستهلك مرة واحدة.
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: issued!.token, password: 'yet-another-passphrase' })
      .expect(400)
  })

  it('rejects a password below the minimum length', async () => {
    await createStaffUser({ email: 'short@greencities.test', roleSlug: 'MEMBER' })

    const issued = await requestPasswordReset('short@greencities.test', trace)

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: issued!.token, password: 'short' })
      .expect(422)
  })
})
