import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { invitations } from '../../src/db/schema/access.js'
import { roles } from '../../src/db/schema/org.js'
import { runSeed } from '../../src/db/seed.js'
import {
  TEST_PASSWORD,
  bearer,
  createStaffUser,
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

/** يستخرج الرمز من رابط الدعوة كما سيفعل المدعوّ عند فتحه. */
function tokenFromUrl(inviteUrl: string) {
  const token = inviteUrl.split('/').pop()

  if (!token) throw new Error('Invite URL has no token segment.')

  return token
}

async function roleId(slug: string) {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, slug))
    .limit(1)

  if (!row) throw new Error(`Seed role "${slug}" is missing.`)

  return row.id
}

async function officeIdOf(seed: Awaited<ReturnType<typeof runSeed>>, slug: string) {
  const id = seed.officeIds.get(slug)

  if (!id) throw new Error(`Seed office "${slug}" is missing.`)

  return id
}

describe.runIf(ready)('invitations', () => {
  let seed: Awaited<ReturnType<typeof runSeed>>
  let adminToken: string

  beforeEach(async () => {
    await resetDatabase()
    seed = await runSeed({
      adminEmail: 'director@greencities.test',
      adminPassword: TEST_PASSWORD,
    })

    const session = await login('director@greencities.test')
    adminToken = session.accessToken
  })

  it('creates an invitation and returns the link exactly once', async () => {
    const response = await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'Newcomer@GreenCities.test',
        fullNameAr: 'عضو جديد',
        roleId: await roleId('OPERATIONS'),
        officeId: await officeIdOf(seed, 'operations'),
      })
      .expect(201)

    expect(response.body.invitation).toMatchObject({
      // البريد يُطبَّع إلى أحرف صغيرة قبل الحفظ.
      email: 'newcomer@greencities.test',
      kind: 'STAFF',
      status: 'PENDING',
      roleNameAr: 'مسؤول العمليات والتوسع',
      officeNameAr: 'مكتب العمليات والتوسع',
    })
    expect(response.body.inviteUrl).toContain('/accept-invite/')

    // القاعدة تحفظ التجزئة لا النص، فالرابط لا يمكن استرجاعه لاحقًا.
    const [stored] = await db
      .select({ tokenHash: invitations.tokenHash })
      .from(invitations)
      .limit(1)

    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(response.body.inviteUrl).not.toContain(stored!.tokenHash)
  })

  it('previews the invitation without exposing anything else', async () => {
    const created = await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'preview@greencities.test',
        roleId: await roleId('MEDIA'),
        officeId: await officeIdOf(seed, 'media'),
      })
      .expect(201)

    const preview = await request(app)
      .get(`/api/auth/invitations/${tokenFromUrl(created.body.inviteUrl)}`)
      .expect(200)

    expect(preview.body).toMatchObject({
      email: 'preview@greencities.test',
      kind: 'STAFF',
      roleNameAr: 'مسؤول الإعلام والاتصال',
      officeNameAr: 'مكتب الإعلام والاتصال',
    })
    expect(preview.body).not.toHaveProperty('tokenHash')
    expect(preview.body).not.toHaveProperty('invitedById')
  })

  it('creates the account with the role the inviter approved', async () => {
    const created = await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'accept@greencities.test',
        roleId: await roleId('ADMIN_FINANCE'),
        officeId: await officeIdOf(seed, 'admin-finance'),
      })
      .expect(201)

    const token = tokenFromUrl(created.body.inviteUrl)

    const accepted = await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ fullNameAr: 'أحمد زيدان', password: TEST_PASSWORD })
      .expect(201)

    expect(accepted.body.user).toMatchObject({
      email: 'accept@greencities.test',
      fullNameAr: 'أحمد زيدان',
      kind: 'STAFF',
    })
    // القدرات جاءت من دور الدعوة لا من الطلب.
    expect(accepted.body.user.capabilities).toContain('contributions.value.view')
    expect(accepted.body.user.capabilities).not.toContain('work.approve')
    expect(accepted.body.user.memberships[0]).toMatchObject({
      officeSlug: 'admin-finance',
      roleSlug: 'ADMIN_FINANCE',
      isPrimary: true,
    })

    // الحساب يعمل بتسجيل دخول عادي بعد ذلك.
    await login('accept@greencities.test')

    // الدعوة استُهلكت.
    await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ fullNameAr: 'محاولة ثانية', password: TEST_PASSWORD })
      .expect(404)
  })

  it('revokes the earlier pending invitation when re-inviting the same email', async () => {
    const body = {
      email: 'again@greencities.test',
      roleId: await roleId('MEMBER'),
      officeId: await officeIdOf(seed, 'tech'),
    }

    const first = await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send(body)
      .expect(201)

    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send(body)
      .expect(201)

    // الرابط الأول لم يعد صالحًا.
    await request(app)
      .get(`/api/auth/invitations/${tokenFromUrl(first.body.inviteUrl)}`)
      .expect(404)

    const rows = await db
      .select({ status: invitations.status })
      .from(invitations)
      .where(eq(invitations.email, 'again@greencities.test'))

    expect(rows.map((row) => row.status).sort()).toEqual(['PENDING', 'REVOKED'])
  })

  it('refuses to invite an email that already has an account', async () => {
    await createStaffUser({ email: 'taken@greencities.test', roleSlug: 'MEMBER' })

    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'taken@greencities.test',
        roleId: await roleId('MEMBER'),
        officeId: await officeIdOf(seed, 'tech'),
      })
      .expect(409)
  })

  it('refuses a staff invitation with no office', async () => {
    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'no-office@greencities.test',
        roleId: await roleId('MEMBER'),
      })
      .expect(422)
  })

  /**
   * بوابة الشريك غير مبنية بعد، فقبول دعوة بدور شريك ينتج حسابًا بلا
   * صلاحيات. الرفض الصريح أفضل من حساب صامت لا يعمل.
   */
  it('refuses a partner-scope role until the partner portal exists', async () => {
    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'partner@greencities.test',
        roleId: await roleId('PARTNER_ADMIN'),
      })
      .expect(422)
  })

  it('stops accepting a revoked invitation', async () => {
    const created = await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(adminToken))
      .send({
        email: 'revoked@greencities.test',
        roleId: await roleId('MEMBER'),
        officeId: await officeIdOf(seed, 'tech'),
      })
      .expect(201)

    await request(app)
      .post(`/api/admin/invitations/${created.body.invitation.id}/revoke`)
      .set('authorization', bearer(adminToken))
      .expect(204)

    const token = tokenFromUrl(created.body.inviteUrl)

    await request(app).get(`/api/auth/invitations/${token}`).expect(404)
    await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ fullNameAr: 'لن ينجح', password: TEST_PASSWORD })
      .expect(404)
  })

  /**
   * الدعوة تمنح دورًا كأي عضوية: بدون هذا الفحص يدعو مسؤول شؤون الفريق —
   * أو التقني — بريدًا يملكه بدور المدير العام، فيحصل على كل شيء.
   */
  it('refuses inviting with a role wider than the inviter can delegate', async () => {
    await createStaffUser({
      email: 'people@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })
    await createStaffUser({ email: 'tech@greencities.test', roleSlug: 'TECH' })

    for (const inviter of ['people@greencities.test', 'tech@greencities.test']) {
      const session = await login(inviter)

      await request(app)
        .post('/api/admin/invitations')
        .set('authorization', bearer(session.accessToken))
        .send({
          email: `escalate-${inviter}`,
          roleId: await roleId('GENERAL_ADMIN'),
          officeId: await officeIdOf(seed, 'general-admin'),
        })
        .expect(403)

      // ولا يُهرَّب الدور نفسه عبر العضوية الإضافية.
      await request(app)
        .post('/api/admin/invitations')
        .set('authorization', bearer(session.accessToken))
        .send({
          email: `sneak-${inviter}`,
          roleId: await roleId('MEMBER'),
          officeId: await officeIdOf(seed, 'media'),
          additionalOfficeId: await officeIdOf(seed, 'general-admin'),
          additionalRoleId: await roleId('GENERAL_ADMIN'),
        })
        .expect(403)
    }

    const pending = await db.select({ id: invitations.id }).from(invitations)

    expect(pending).toHaveLength(0)
  })

  it('lets the people lead invite a new member', async () => {
    await createStaffUser({
      email: 'people@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    const session = await login('people@greencities.test')

    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(session.accessToken))
      .send({
        email: 'volunteer@greencities.test',
        roleId: await roleId('MEMBER'),
        officeId: await officeIdOf(seed, 'media'),
      })
      .expect(201)
  })
})
