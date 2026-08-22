import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { memberships } from '../../src/db/schema/access.js'
import { users } from '../../src/db/schema/identity.js'
import { offices } from '../../src/db/schema/org.js'
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
