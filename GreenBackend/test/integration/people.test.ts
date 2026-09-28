import { and, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { memberships } from '../../src/db/schema/access.js'
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

/**
 * `roles.manage` يحملها التقني أيضًا، فلا تكفي وحدها: بدون هذه الحراسة
 * يرفع نفسه إلى المدير العام أو يُنهي عضوية المدير العام.
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

  it('lets a tech lead grant a role within its own capabilities', async () => {
    await createStaffUser({ email: 'tech@greencities.test', roleSlug: 'TECH' })
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const session = await login('tech@greencities.test')

    await request(app)
      .post(`/api/admin/people/${member.userId}/memberships`)
      .set('authorization', bearer(session.accessToken))
      .send({
        officeId: await officeIdBySlug('operations'),
        roleId: await roleIdBySlug('MEMBER'),
      })
      .expect(201)
  })

  it('refuses a tech lead ending or downgrading the director', async () => {
    await createStaffUser({ email: 'tech@greencities.test', roleSlug: 'TECH' })
    const director = await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })

    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, director.userId))

    const session = await login('tech@greencities.test')
    const base = `/api/admin/people/${director.userId}/memberships/${membership!.id}`

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
      .where(eq(memberships.id, membership!.id))

    expect(after).toEqual({ status: 'ACTIVE', roleId: director.roleId })
  })

  it('refuses the director ending their own membership', async () => {
    const director = await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })

    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, director.userId))

    const session = await login('director@greencities.test')

    await request(app)
      .post(`/api/admin/people/${director.userId}/memberships/${membership!.id}/end`)
      .set('authorization', bearer(session.accessToken))
      .expect(403)
  })
})
