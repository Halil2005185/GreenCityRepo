import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { roles } from '../../src/db/schema/org.js'
import { runSeed, syncSystemData } from '../../src/db/seed.js'
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

async function roleBySlug(slug: string) {
  const [row] = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1)

  if (!row) throw new Error(`Seed role "${slug}" is missing.`)

  return row
}

async function sessionFor(email: string, roleSlug: string, officeSlug: string) {
  await createStaffUser({ email, roleSlug, officeSlug })

  return (await login(email)).accessToken
}

/**
 * تحرير حزمة دور يغيّر صلاحيات كل من يحمله. الحراسة هنا تمنع أن يصير
 * محرّر الأدوار طريقًا خلفيًا للتصعيد، وأن يمحو النشر قرار المدير.
 */
describe.runIf(ready)('roles screen', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('lists roles with their team, members and lock', async () => {
    const token = await sessionFor('media@greencities.test', 'MEDIA', 'media')

    const response = await request(app)
      .get('/api/admin/roles?scope=STAFF')
      .set('authorization', bearer(token))
      .expect(200)

    const bySlug = Object.fromEntries(
      response.body.data.map((role: { slug: string }) => [role.slug, role]),
    )

    expect(bySlug.GENERAL_ADMIN).toMatchObject({ isLocked: true })
    expect(bySlug.MEDIA).toMatchObject({ isLocked: false, activeMembers: 1 })
    expect(bySlug.MEDIA.officeId).toEqual(expect.any(String))
    expect(bySlug.MEMBER.officeId).toBeNull()
  })

  it('lets the director create a team role and edit it, surviving the next deploy', async () => {
    const token = await sessionFor('director@greencities.test', 'GENERAL_ADMIN', 'general-admin')
    const media = await roleBySlug('MEDIA')

    const created = await request(app)
      .post('/api/admin/roles')
      .set('authorization', bearer(token))
      .send({
        nameAr: 'مساعد الإعلام',
        officeId: media.officeId,
        capabilities: ['media.view', 'work.view'],
      })
      .expect(201)

    await request(app)
      .patch(`/api/admin/roles/${media.id}`)
      .set('authorization', bearer(token))
      .send({ capabilities: ['media.view', 'media.manage', 'team.manage'] })
      .expect(200)

    await syncSystemData()

    expect((await roleBySlug('MEDIA')).capabilities).toEqual([
      'media.manage',
      'media.view',
      'team.manage',
    ])

    const [assistant] = await db
      .select({ isSystem: roles.isSystem, customizedAt: roles.customizedAt })
      .from(roles)
      .where(eq(roles.id, created.body.data.id))

    expect(assistant).toMatchObject({ isSystem: false, customizedAt: expect.any(Date) })
  })

  it('refuses anyone without roles.manage', async () => {
    const token = await sessionFor('media@greencities.test', 'MEDIA', 'media')

    await request(app)
      .post('/api/admin/roles')
      .set('authorization', bearer(token))
      .send({ nameAr: 'دور', capabilities: ['media.view'] })
      .expect(403)
  })

  /**
   * التقني يحمل `roles.manage`، لكنه لا يضع في حزمة ما لا يحمله، ولا يمسّ
   * القدرات الإدارية — وإلا أضاف `roles.manage` لـ«عضو فريق» فصار كل عضو مشرفًا.
   */
  it('keeps the tech lead from escalating through a role bundle', async () => {
    const token = await sessionFor('tech@greencities.test', 'TECH', 'tech')
    const member = await roleBySlug('MEMBER')

    for (const capabilities of [
      [...member.capabilities, 'partners.approve'],
      [...member.capabilities, 'audit.view'],
      [...member.capabilities, 'roles.manage'],
    ]) {
      await request(app)
        .patch(`/api/admin/roles/${member.id}`)
        .set('authorization', bearer(token))
        .send({ capabilities })
        .expect(403)
    }

    // وما يحمله من غير الإداري يضعه.
    await request(app)
      .patch(`/api/admin/roles/${member.id}`)
      .set('authorization', bearer(token))
      .send({ capabilities: [...member.capabilities, 'geo.manage'] })
      .expect(200)
  })

  it('locks the general director role', async () => {
    const token = await sessionFor('director@greencities.test', 'GENERAL_ADMIN', 'general-admin')
    const director = await roleBySlug('GENERAL_ADMIN')

    await request(app)
      .patch(`/api/admin/roles/${director.id}`)
      .set('authorization', bearer(token))
      .send({ nameAr: 'مدير' })
      .expect(422)

    await request(app)
      .delete(`/api/admin/roles/${director.id}`)
      .set('authorization', bearer(token))
      .expect(422)
  })

  it('deletes only an unused custom role', async () => {
    const token = await sessionFor('director@greencities.test', 'GENERAL_ADMIN', 'general-admin')

    const created = await request(app)
      .post('/api/admin/roles')
      .set('authorization', bearer(token))
      .send({ nameAr: 'دور مؤقت', capabilities: ['work.view'] })
      .expect(201)

    const member = await createStaffUser({ email: 'm@greencities.test', roleSlug: 'MEMBER' })

    await request(app)
      .post(`/api/admin/people/${member.userId}/memberships`)
      .set('authorization', bearer(token))
      .send({ officeId: (await roleBySlug('MEDIA')).officeId, roleId: created.body.data.id })
      .expect(201)

    await request(app)
      .delete(`/api/admin/roles/${created.body.data.id}`)
      .set('authorization', bearer(token))
      .expect(409)

    await request(app)
      .delete(`/api/admin/roles/${(await roleBySlug('MEMBER')).id}`)
      .set('authorization', bearer(token))
      .expect(422)

    const unused = await request(app)
      .post('/api/admin/roles')
      .set('authorization', bearer(token))
      .send({ nameAr: 'دور لم يُستعمل', capabilities: [] })
      .expect(201)

    await request(app)
      .delete(`/api/admin/roles/${unused.body.data.id}`)
      .set('authorization', bearer(token))
      .expect(204)
  })
})
