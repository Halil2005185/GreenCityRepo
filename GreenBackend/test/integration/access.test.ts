import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { memberships } from '../../src/db/schema/access.js'
import { roles } from '../../src/db/schema/org.js'
import { runSeed } from '../../src/db/seed.js'
import { loadAuthContext } from '../../src/modules/access/access.service.js'
import { STAFF_CAPABILITIES } from '../../src/modules/access/capabilities.js'
import { bearer, createStaffUser, login } from '../helpers/auth.js'
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

describe.runIf(ready)('capability enforcement', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })
  })

  it('blocks a plain member from managing invitations', async () => {
    await createStaffUser({ email: 'member@greencities.test', roleSlug: 'MEMBER' })

    const session = await login('member@greencities.test')

    const response = await request(app)
      .get('/api/admin/invitations')
      .set('authorization', bearer(session.accessToken))
      .expect(403)

    expect(response.body.title).toBe('FORBIDDEN')
  })

  it('allows the technology lead to manage invitations', async () => {
    await createStaffUser({ email: 'tech@greencities.test', roleSlug: 'TECH' })

    const session = await login('tech@greencities.test')

    await request(app)
      .get('/api/admin/invitations')
      .set('authorization', bearer(session.accessToken))
      .expect(200)
  })

  it('resolves the general director to every staff capability', async () => {
    const director = await createStaffUser({
      email: 'director@greencities.test',
      roleSlug: 'GENERAL_ADMIN',
      officeSlug: 'general-admin',
    })

    const context = await loadAuthContext(director.userId)

    expect([...(context?.capabilities ?? [])].sort()).toEqual(
      [...STAFF_CAPABILITIES].sort(),
    )
  })

  /** «التقني يدير الحسابات والنظام دون اعتماد قرارات تجارية» — PLAN.md */
  it('keeps approval powers away from the technology lead', async () => {
    const tech = await createStaffUser({
      email: 'tech2@greencities.test',
      roleSlug: 'TECH',
    })

    const context = await loadAuthContext(tech.userId)

    expect(context?.capabilities).toContain('users.manage')
    expect(context?.capabilities).not.toContain('partners.approve')
    expect(context?.capabilities).not.toContain('work.approve')
    expect(context?.capabilities).not.toContain('contributions.value.view')
  })

  it('unions capabilities across several active memberships', async () => {
    const user = await createStaffUser({
      email: 'dual@greencities.test',
      roleSlug: 'MEDIA',
      officeSlug: 'media',
    })

    const [operationsRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.slug, 'OPERATIONS'))
      .limit(1)

    const seeded = await runSeed({ quiet: true })

    await db.insert(memberships).values({
      userId: user.userId,
      officeId: seeded.officeIds.get('operations')!,
      roleId: operationsRole!.id,
      isPrimary: false,
    })

    const context = await loadAuthContext(user.userId)

    // من الإعلام.
    expect(context?.capabilities).toContain('files.manage')
    // ومن العمليات.
    expect(context?.capabilities).toContain('work.approve')
    expect(context?.memberships).toHaveLength(2)
  })

  /** إنهاء العضوية يسحب القدرة فورًا، لا عند انتهاء رمز الوصول. */
  it('drops capabilities as soon as the membership ends', async () => {
    const user = await createStaffUser({
      email: 'ended@greencities.test',
      roleSlug: 'OPERATIONS',
      officeSlug: 'operations',
    })

    const session = await login('ended@greencities.test')

    const before = await loadAuthContext(user.userId)
    expect(before?.capabilities).toContain('work.approve')

    await db
      .update(memberships)
      .set({ status: 'ENDED', endedAt: new Date() })
      .where(eq(memberships.userId, user.userId))

    const after = await loadAuthContext(user.userId)
    expect(after?.capabilities).toEqual([])

    // رمز الوصول ما زال صالح التوقيع، لكن القدرات صارت فارغة.
    const response = await request(app)
      .get('/api/auth/me')
      .set('authorization', bearer(session.accessToken))
      .expect(200)

    expect(response.body.capabilities).toEqual([])
  })

  it('rejects a request with no token, a malformed token, and a forged token', async () => {
    await request(app).get('/api/admin/invitations').expect(401)

    await request(app)
      .get('/api/admin/invitations')
      .set('authorization', 'Bearer not-a-jwt')
      .expect(401)

    await request(app)
      .get('/api/admin/invitations')
      .set('authorization', 'NotBearer something')
      .expect(401)
  })
})
