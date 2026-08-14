import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { outboxJobs } from '../../src/db/schema/outbox.js'
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

afterAll(async () => {
  await closeTestDatabase()
})

async function bootstrap() {
  await resetDatabase()
  await runSeed({
    adminEmail: 'director@greencities.test',
    adminPassword: TEST_PASSWORD,
  })

  return (await login('director@greencities.test')).accessToken
}

describe.runIf(ready)('office dashboard', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  it('reports the office and the viewer own task counts', async () => {
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('authorization', bearer(director))
      .expect(200)

    expect(response.body.officeNameAr).toBe('الإدارة العامة')
    expect(response.body.myTasks).toMatchObject({
      open: 0,
      overdue: 0,
      blocked: 0,
      inReview: 0,
    })
  })

  /**
   * الإخفاء يقع في الخادم لا في الواجهة: قسم يُرسل ثم يُخفى في العميل
   * يبقى في الشبكة، وإخفاؤه تجميلٌ لا حماية.
   */
  it('returns null for the sections the viewer has no capability for', async () => {
    // عضو فريق بلا منصب: لا يرى الشركاء ولا الأثر، ويرى المبادرات.
    await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })
    const member = (await login('member@greencities.test')).accessToken

    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('authorization', bearer(member))
      .expect(200)

    expect(response.body.partners).toBeNull()
    expect(response.body.impact).toBeNull()
    expect(response.body.initiatives).not.toBeNull()

    // والمدير العام يراها كلها.
    const asDirector = await request(app)
      .get('/api/admin/dashboard')
      .set('authorization', bearer(director))
      .expect(200)

    expect(asDirector.body.partners).not.toBeNull()
    expect(asDirector.body.impact).not.toBeNull()
  })

  it('counts the office tasks a template generated, not only scoped ones', async () => {
    const [operationsRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.slug, 'OPERATIONS'))
      .limit(1)

    expect(operationsRole).toBeDefined()

    await createStaffUser({
      email: 'ops@greencities.test',
      roleSlug: 'OPERATIONS',
      officeSlug: 'operations',
    })
    const ops = (await login('ops@greencities.test')).accessToken

    const programs = await request(app)
      .get('/api/admin/programs')
      .set('authorization', bearer(ops))
      .expect(200)

    const treePlanting = programs.body.data.find(
      (program: { slug: string }) => program.slug === 'tree-planting',
    )

    await request(app)
      .post('/api/admin/initiatives')
      .set('authorization', bearer(ops))
      .send({ programId: treePlanting.id, nameAr: 'حملة للوحة' })
      .expect(201)

    const dashboard = await request(app)
      .get('/api/admin/dashboard')
      .set('authorization', bearer(ops))
      .expect(200)

    /**
     * مهام القوالب مُعلَّقة على المبادرة لا على مكتب، ومكتبها في
     * `followUpOfficeId`. عدّ النطاق وحده كان يُظهر صفرًا للعمليات رغم
     * أن الخطة كلها تخصّها.
     */
    expect(dashboard.body.officeTasks.open).toBeGreaterThan(0)
    expect(dashboard.body.officeTasks.unassigned).toBeGreaterThan(0)
  })
})

describe.runIf(ready)('audit log access', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  it('shows the trail to those who may read it', async () => {
    const response = await request(app)
      .get('/api/admin/audit-logs?limit=10')
      .set('authorization', bearer(director))
      .expect(200)

    expect(response.body.data.length).toBeGreaterThan(0)
    expect(response.body.data[0]).toHaveProperty('action')
  })

  it('refuses everyone else', async () => {
    // الإعلام يدير المحتوى ولا يطّلع على سجل التدقيق.
    await createStaffUser({
      email: 'media@greencities.test',
      roleSlug: 'MEDIA',
      officeSlug: 'media',
    })
    const media = (await login('media@greencities.test')).accessToken

    await request(app)
      .get('/api/admin/audit-logs')
      .set('authorization', bearer(media))
      .expect(403)
  })

  it('filters by severity', async () => {
    const response = await request(app)
      .get('/api/admin/audit-logs?severity=CRITICAL')
      .set('authorization', bearer(director))
      .expect(200)

    for (const entry of response.body.data) {
      expect(entry.severity).toBe('CRITICAL')
    }
  })
})

describe.runIf(ready)('the mail outbox', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  /**
   * الإدراج داخل معاملة الدعوة هو ما يمنع دعوةً بلا بريدها. الاختبار
   * يثبت وجود الصف لا وصول الرسالة — الإرسال مسؤولية العامل.
   */
  it('queues the invitation mail in the same write', async () => {
    const rolesResponse = await request(app)
      .get('/api/admin/roles?scope=STAFF')
      .set('authorization', bearer(director))
      .expect(200)

    const memberRole = rolesResponse.body.data.find(
      (role: { slug: string }) => role.slug === 'MEMBER',
    )

    const offices = await request(app)
      .get('/api/admin/offices')
      .set('authorization', bearer(director))
      .expect(200)

    const media = offices.body.data.find(
      (office: { slug: string }) => office.slug === 'media',
    )

    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(director))
      .send({
        email: 'newcomer@greencities.test',
        roleId: memberRole.id,
        officeId: media.id,
      })
      .expect(201)

    const queued = await db
      .select()
      .from(outboxJobs)
      .where(eq(outboxJobs.recipient, 'newcomer@greencities.test'))

    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      templateKey: 'invitation',
      status: 'PENDING',
      attempts: 0,
    })

    // الرابط يُحمل في الحمولة لا يُصيَّر الآن: القالب يُطبَّق وقت الإرسال.
    expect(String(queued[0]?.payload['inviteUrl'])).toContain('/accept-invite/')
  })

  it('queues a reset mail without revealing whether the account exists', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'director@greencities.test' })
      .expect(202)

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@greencities.test' })
      .expect(202)

    const queued = await db.select().from(outboxJobs)
    const recipients = queued.map((job) => job.recipient)

    expect(recipients).toContain('director@greencities.test')
    // لا صف لبريد غير مسجّل: الطابور نفسه لا يجب أن يكشف ما تخفيه الاستجابة.
    expect(recipients).not.toContain('ghost@greencities.test')
  })
})
