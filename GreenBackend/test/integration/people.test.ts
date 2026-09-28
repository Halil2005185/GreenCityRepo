import { and, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import {
  membershipCapabilityOverrides,
  memberships,
} from '../../src/db/schema/access.js'
import { users } from '../../src/db/schema/identity.js'
import { offices, roles } from '../../src/db/schema/org.js'
import { runSeed } from '../../src/db/seed.js'
import { bearer, createStaffUser, login } from '../helpers/auth.js'
import {
  closeTestDatabase,
  ensureTestDatabase,
  resetDatabase,
} from '../helpers/database.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

async function officeIdBySlug(slug: string) {
  const [office] = await db
    .select({ id: offices.id })
    .from(offices)
    .where(eq(offices.slug, slug))
    .limit(1)

  if (!office) throw new Error(`Seed office "${slug}" is missing.`)

  return office.id
}

async function roleIdBySlug(slug: string) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, slug))
    .limit(1)

  if (!role) throw new Error(`Seed role "${slug}" is missing.`)

  return role.id
}

describe.runIf(ready)('team directory', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('refuses a member without users.view', async () => {
    await createStaffUser({ email: 'plain@greencities.test', roleSlug: 'MEMBER' })

    const session = await login('plain@greencities.test')

    const response = await request(app)
      .get('/api/admin/people')
      .set('authorization', bearer(session.accessToken))
      .expect(403)

    expect(response.body.title).toBe('FORBIDDEN')
  })

  it('lists staff with their active membership', async () => {
    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
      fullNameAr: 'سارة الإدارية',
    })

    const session = await login('lead@greencities.test')

    const response = await request(app)
      .get('/api/admin/people')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    const member = response.body.data.find(
      (row: { email: string }) => row.email === 'lead@greencities.test',
    )

    expect(member.fullNameAr).toBe('سارة الإدارية')
    expect(member.memberships).toHaveLength(1)
    expect(member.memberships[0]).toMatchObject({
      officeSlug: 'people',
      roleSlug: 'PEOPLE',
      isPrimary: true,
      status: 'ACTIVE',
    })
  })

  it('excludes partner representatives from the directory', async () => {
    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    // ممثل شريك: مستخدم حقيقي بنطاق جهة لا مكتب.
    await db.insert(users).values({
      email: 'rep@partner.test',
      passwordHash: 'x'.repeat(60),
      fullNameAr: 'ممثل جهة',
      kind: 'PARTNER',
      status: 'ACTIVE',
    })

    const session = await login('lead@greencities.test')

    const response = await request(app)
      .get('/api/admin/people')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    const emails = response.body.data.map((row: { email: string }) => row.email)

    expect(emails).not.toContain('rep@partner.test')
  })

  it('filters by office through active membership only', async () => {
    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })
    await createStaffUser({
      email: 'media@greencities.test',
      roleSlug: 'MEDIA',
      officeSlug: 'media',
    })

    const session = await login('lead@greencities.test')
    const mediaOfficeId = await officeIdBySlug('media')

    const response = await request(app)
      .get(`/api/admin/people?officeId=${mediaOfficeId}`)
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    const emails = response.body.data.map((row: { email: string }) => row.email)

    expect(emails).toContain('media@greencities.test')
    expect(emails).not.toContain('lead@greencities.test')
  })

  it('searches name and email alike', async () => {
    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
      fullNameAr: 'سارة الإدارية',
    })

    const session = await login('lead@greencities.test')

    const byName = await request(app)
      .get('/api/admin/people?q=%D8%B3%D8%A7%D8%B1%D8%A9')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    const byEmail = await request(app)
      .get('/api/admin/people?q=lead@')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    expect(byName.body.data).toHaveLength(1)
    expect(byEmail.body.data).toHaveLength(1)
  })

  it('returns ended memberships in the member profile', async () => {
    const lead = await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    // انتقال سابق: عضوية منتهية في مكتب آخر.
    const mediaOfficeId = await officeIdBySlug('media')

    await db.insert(memberships).values({
      userId: lead.userId,
      officeId: mediaOfficeId,
      roleId: lead.roleId,
      isPrimary: false,
      status: 'ENDED',
      endedAt: new Date(),
    })

    const session = await login('lead@greencities.test')

    const list = await request(app)
      .get('/api/admin/people')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    const detail = await request(app)
      .get(`/api/admin/people/${lead.userId}`)
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    const listed = list.body.data.find(
      (row: { id: string }) => row.id === lead.userId,
    )

    // القائمة تعرض النشط وحده؛ الملف يعرض التاريخ كاملًا.
    expect(listed.memberships).toHaveLength(1)
    expect(detail.body.data.memberships).toHaveLength(2)
    expect(
      detail.body.data.memberships.some(
        (row: { status: string }) => row.status === 'ENDED',
      ),
    ).toBe(true)
  })

  it('does not expose a partner user through the profile route', async () => {
    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    const [rep] = await db
      .insert(users)
      .values({
        email: 'rep@partner.test',
        passwordHash: 'x'.repeat(60),
        fullNameAr: 'ممثل جهة',
        kind: 'PARTNER',
        status: 'ACTIVE',
      })
      .returning({ id: users.id })

    const session = await login('lead@greencities.test')

    await request(app)
      .get(`/api/admin/people/${rep!.id}`)
      .set('authorization', bearer(session.accessToken))
      .expect(404)
  })
})

async function membershipOf(userId: string) {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'ACTIVE')))
    .limit(1)

  if (!row) throw new Error('The user has no active membership.')

  return row.id
}

/**
 * مدير الفريق يدير فريقه وحده، ولا يعطي ما لا يملك، ولا يصنع مديرًا مثله.
 * كل حالة هنا ثغرة تصعيد لو انكسرت — `roles.manage` عند التقني كانت تكفي
 * قبلها ليرفع نفسه إلى المدير العام.
 */
describe.runIf(ready)('membership management', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('refuses a tech lead granting the general director role', async () => {
    const tech = await createStaffUser({ email: 'tech@greencities.test', roleSlug: 'TECH' })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const session = await login('tech@greencities.test')
    const body = {
      officeId: await officeIdBySlug('general-admin'),
      roleId: await roleIdBySlug('GENERAL_ADMIN'),
    }

    for (const userId of [tech.userId, member.userId]) {
      await request(app)
        .post(`/api/admin/people/${userId}/memberships`)
        .set('authorization', bearer(session.accessToken))
        .send(body)
        .expect(403)
    }

    const granted = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.roleId, body.roleId),
          inArray(memberships.userId, [tech.userId, member.userId]),
        ),
      )

    expect(granted).toHaveLength(0)
  })

  it('lets a team manager add a colleague to their own team only', async () => {
    await createStaffUser({ email: 'media@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'operations',
    })

    const session = await login('media@greencities.test')
    const memberRole = await roleIdBySlug('MEMBER')

    await request(app)
      .post(`/api/admin/people/${member.userId}/memberships`)
      .set('authorization', bearer(session.accessToken))
      .send({ officeId: await officeIdBySlug('media'), roleId: memberRole })
      .expect(201)

    await request(app)
      .post(`/api/admin/people/${member.userId}/memberships`)
      .set('authorization', bearer(session.accessToken))
      .send({ officeId: await officeIdBySlug('relations'), roleId: memberRole })
      .expect(403)
  })

  /** مدير العمليات يدير قسمي الهندسات والتنفيذ تحته. */
  it('extends team management to child offices', async () => {
    await createStaffUser({
      email: 'ops@greencities.test',
      roleSlug: 'OPERATIONS',
      officeSlug: 'operations',
    })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const session = await login('ops@greencities.test')

    await request(app)
      .post(`/api/admin/people/${member.userId}/memberships`)
      .set('authorization', bearer(session.accessToken))
      .send({
        officeId: await officeIdBySlug('operations-engineering'),
        roleId: await roleIdBySlug('MEMBER'),
      })
      .expect(201)
  })

  it('refuses a team manager touching a fellow manager', async () => {
    await createStaffUser({ email: 'lead-a@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    const peer = await createStaffUser({
      email: 'lead-b@greencities.test',
      roleSlug: 'MEDIA',
      officeSlug: 'media',
    })

    const session = await login('lead-a@greencities.test')
    const base = `/api/admin/people/${peer.userId}/memberships/${await membershipOf(peer.userId)}`

    await request(app)
      .post(`${base}/end`)
      .set('authorization', bearer(session.accessToken))
      .expect(403)

    await request(app)
      .put(`${base}/capabilities`)
      .set('authorization', bearer(session.accessToken))
      .send({ grants: [], revokes: ['media.manage'] })
      .expect(403)
  })

  it('refuses moving a member out of the manager teams', async () => {
    await createStaffUser({ email: 'media@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const session = await login('media@greencities.test')

    await request(app)
      .patch(`/api/admin/people/${member.userId}/memberships/${await membershipOf(member.userId)}`)
      .set('authorization', bearer(session.accessToken))
      .send({ officeId: await officeIdBySlug('operations') })
      .expect(403)
  })

  /** المساعد: عضو يُعطى بعض ما يملكه المدير ويُنزع منه بعض حزمته. */
  it('customizes an assistant and the session reflects it at once', async () => {
    await createStaffUser({ email: 'media@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    const assistant = await createStaffUser({
      email: 'assistant@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const lead = await login('media@greencities.test')
    const membershipId = await membershipOf(assistant.userId)

    const response = await request(app)
      .put(`/api/admin/people/${assistant.userId}/memberships/${membershipId}/capabilities`)
      .set('authorization', bearer(lead.accessToken))
      .send({ grants: ['media.view'], revokes: ['files.upload'] })
      .expect(200)

    expect(response.body.data.effective).toEqual([
      'initiatives.view',
      'media.view',
      'work.view',
    ])

    const me = await login('assistant@greencities.test')

    expect(me.body.user.capabilities).toContain('media.view')
    expect(me.body.user.capabilities).not.toContain('files.upload')

    const detail = await request(app)
      .get(`/api/admin/people/${assistant.userId}`)
      .set('authorization', bearer(lead.accessToken))
      .expect(200)

    expect(detail.body.data.memberships[0]).toMatchObject({
      overrides: expect.arrayContaining([
        { capability: 'media.view', effect: 'GRANT' },
        { capability: 'files.upload', effect: 'REVOKE' },
      ]),
      canManage: true,
      canCustomize: true,
    })
  })

  it('refuses granting what the manager does not hold or admin capabilities', async () => {
    await createStaffUser({ email: 'media@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const session = await login('media@greencities.test')
    const url = `/api/admin/people/${member.userId}/memberships/${await membershipOf(member.userId)}/capabilities`

    for (const grant of ['work.approve', 'team.manage', 'audit.view']) {
      await request(app)
        .put(url)
        .set('authorization', bearer(session.accessToken))
        .send({ grants: [grant], revokes: [] })
        .expect(403)
    }
  })

  it('drops the overrides when the membership changes role', async () => {
    await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })
    const membershipId = await membershipOf(member.userId)

    const session = await login('director@greencities.test')
    const base = `/api/admin/people/${member.userId}/memberships/${membershipId}`

    await request(app)
      .put(`${base}/capabilities`)
      .set('authorization', bearer(session.accessToken))
      .send({ grants: ['audit.view'], revokes: [] })
      .expect(200)

    await request(app)
      .patch(base)
      .set('authorization', bearer(session.accessToken))
      .send({ roleId: await roleIdBySlug('MEDIA') })
      .expect(200)

    const left = await db
      .select({ id: membershipCapabilityOverrides.id })
      .from(membershipCapabilityOverrides)
      .where(eq(membershipCapabilityOverrides.membershipId, membershipId))

    expect(left).toHaveLength(0)
  })

  it('refuses customizing a general director membership', async () => {
    await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })
    const other = await createStaffUser({
      email: 'director-2@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })

    const session = await login('director@greencities.test')

    await request(app)
      .put(`/api/admin/people/${other.userId}/memberships/${await membershipOf(other.userId)}/capabilities`)
      .set('authorization', bearer(session.accessToken))
      .send({ grants: [], revokes: ['audit.view'] })
      .expect(422)
  })

  it('refuses a tech lead ending or downgrading the director', async () => {
    await createStaffUser({ email: 'tech@greencities.test', roleSlug: 'TECH' })
    const director = await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })

    const membershipId = await membershipOf(director.userId)
    const session = await login('tech@greencities.test')
    const base = `/api/admin/people/${director.userId}/memberships/${membershipId}`

    await request(app)
      .patch(base)
      .set('authorization', bearer(session.accessToken))
      .send({ roleId: await roleIdBySlug('MEMBER') })
      .expect(403)

    await request(app)
      .post(`${base}/end`)
      .set('authorization', bearer(session.accessToken))
      .expect(403)

    const [after] = await db
      .select({ status: memberships.status, roleId: memberships.roleId })
      .from(memberships)
      .where(eq(memberships.id, membershipId))

    expect(after).toEqual({ status: 'ACTIVE', roleId: director.roleId })
  })

  it('refuses the director ending their own membership', async () => {
    const director = await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })

    const session = await login('director@greencities.test')

    await request(app)
      .post(`/api/admin/people/${director.userId}/memberships/${await membershipOf(director.userId)}/end`)
      .set('authorization', bearer(session.accessToken))
      .expect(403)
  })
})

/** مدير الفريق بلا `users.view` يرى فريقه في الدليل، لا الفريق كله. */
describe.runIf(ready)('team manager directory', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('shows a team manager only their own team', async () => {
    await createStaffUser({ email: 'media@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    await createStaffUser({
      email: 'in-media@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })
    const outsider = await createStaffUser({
      email: 'in-ops@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'operations',
    })

    const session = await login('media@greencities.test')

    const list = await request(app)
      .get('/api/admin/people')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    expect(list.body.data.map((row: { email: string }) => row.email).sort()).toEqual([
      'in-media@greencities.test',
      'media@greencities.test',
    ])

    await request(app)
      .get(`/api/admin/people/${outsider.userId}`)
      .set('authorization', bearer(session.accessToken))
      .expect(404)
  })

  it('finds colleagues to add by name, for managers only', async () => {
    await createStaffUser({ email: 'media@greencities.test', roleSlug: 'MEDIA', officeSlug: 'media' })
    await createStaffUser({
      email: 'rana@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'operations',
      fullNameAr: 'رنا المتطوعة',
    })

    const lead = await login('media@greencities.test')

    const found = await request(app)
      .get('/api/admin/people/candidates?q=rana')
      .set('authorization', bearer(lead.accessToken))
      .expect(200)

    expect(found.body.data).toEqual([
      { id: expect.any(String), fullNameAr: 'رنا المتطوعة', email: 'rana@greencities.test' },
    ])

    const member = await login('rana@greencities.test')

    await request(app)
      .get('/api/admin/people/candidates?q=media')
      .set('authorization', bearer(member.accessToken))
      .expect(403)
  })
})
