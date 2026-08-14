import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { offices } from '../../src/db/schema/org.js'
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
import {
  addSite,
  createInitiative,
  getInitiative,
  metricIdBySlug,
  programIdBySlug,
  recordImpact,
  recordVerifiedImpact,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

async function officeIdBySlug(slug: string) {
  const [row] = await db
    .select({ id: offices.id })
    .from(offices)
    .where(eq(offices.slug, slug))
    .limit(1)

  if (!row) throw new Error(`Seed office "${slug}" is missing.`)

  return row.id
}

async function bootstrap() {
  await resetDatabase()
  await runSeed({
    adminEmail: 'director@greencities.test',
    adminPassword: TEST_PASSWORD,
  })

  return (await login('director@greencities.test')).accessToken
}

describe.runIf(ready)('tasks on any scope', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  /**
   * جدول مهام محضر 02-08 نفسه يحوي مهامًا مكتبية بلا مبادرة، مثل
   * «تجهيز الملف الإعلامي الأولي». حصر المهام تحت المبادرات كان سيترك
   * نصف عمل الفريق خارج النظام.
   */
  it('accepts an office task that belongs to no initiative', async () => {
    const media = await officeIdBySlug('media')
    const generalAdmin = await officeIdBySlug('general-admin')

    const created = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(director))
      .send({
        officeId: media,
        titleAr: 'تجهيز الملف الإعلامي الأولي',
        followUpOfficeId: generalAdmin,
        priority: 'HIGH',
        dueAt: '2026-08-14T00:00:00.000Z',
      })
      .expect(201)

    expect(created.body).toMatchObject({ titleAr: 'تجهيز الملف الإعلامي الأولي' })

    const listed = await request(app)
      .get(`/api/admin/work/tasks?officeId=${media}`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(listed.body.data).toHaveLength(1)
  })

  it('refuses a task with no scope and a task with two', async () => {
    const media = await officeIdBySlug('media')
    const program = await programIdBySlug('tree-planting')

    await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(director))
      .send({ titleAr: 'مهمة بلا نطاق' })
      .expect(422)

    await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(director))
      .send({ titleAr: 'مهمة بنطاقين', officeId: media, programId: program.id })
      .expect(422)
  })

  it('requires a reason to block, and clears it on unblock', async () => {
    const media = await officeIdBySlug('media')

    const task = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(director))
      .send({ officeId: media, titleAr: 'مهمة قابلة للحجب' })
      .expect(201)

    const id = task.body.id

    await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(director))
      .send({ status: 'BLOCKED' })
      .expect(422)

    await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(director))
      .send({ status: 'BLOCKED', blockedReasonAr: 'بانتظار موافقة البلدية' })
      .expect(200)

    const unblocked = await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(director))
      .send({ status: 'IN_PROGRESS' })
      .expect(200)

    expect(unblocked.body.blockedReasonAr).toBeNull()
  })

  it('rejects a transition outside the allowed graph', async () => {
    const media = await officeIdBySlug('media')

    const task = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(director))
      .send({ officeId: media, titleAr: 'مهمة' })
      .expect(201)

    // TODO ← IN_REVIEW ليست في الرسم البياني.
    await request(app)
      .post(`/api/admin/work/tasks/${task.body.id}/status`)
      .set('authorization', bearer(director))
      .send({ status: 'IN_REVIEW' })
      .expect(409)
  })

  /** «فريق العمليات وحده يعتمد إنجازها» — PLAN.md. */
  it('reserves both approving and reopening to work.approve', async () => {
    const media = await officeIdBySlug('media')

    const task = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(director))
      .send({ officeId: media, titleAr: 'مهمة تحتاج اعتمادًا' })
      .expect(201)

    const id = task.body.id

    // الإعلام يملك work.manage لا work.approve.
    await createStaffUser({
      email: 'media@greencities.test',
      roleSlug: 'MEDIA',
      officeSlug: 'media',
    })
    const mediaLead = (await login('media@greencities.test')).accessToken

    await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(mediaLead))
      .send({ status: 'IN_PROGRESS' })
      .expect(200)

    // يرسلها للمراجعة بنفسه — وهذا مقصود.
    await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(mediaLead))
      .send({ status: 'IN_REVIEW' })
      .expect(200)

    // ولا يعتمدها.
    await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(mediaLead))
      .send({ status: 'DONE' })
      .expect(403)

    const approved = await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(director))
      .send({ status: 'DONE' })
      .expect(200)

    expect(approved.body.completedAt).toBeTypeOf('string')

    // واعتمادٌ يستطيع أي أحد نقضه ليس اعتمادًا.
    await request(app)
      .post(`/api/admin/work/tasks/${id}/status`)
      .set('authorization', bearer(mediaLead))
      .send({ status: 'IN_PROGRESS' })
      .expect(403)
  })
})

describe.runIf(ready)('the impact ledger', () => {
  let director: string
  let initiativeId: string
  let siteId: string
  let trees: string

  beforeEach(async () => {
    director = await bootstrap()
    trees = await metricIdBySlug('trees-planted')

    const program = await programIdBySlug('tree-planting')
    const initiative = await createInitiative(director, {
      programId: program.id,
      nameAr: 'حملة للأثر',
      targetRollup: 'NONE',
    })
    initiativeId = initiative['id']
    siteId = (await addSite(director, initiativeId, { nameAr: 'موقع' })).id
  })

  it('keeps unverified entries out of the headline total', async () => {
    await recordImpact(director, {
      metricId: trees,
      siteId,
      value: 40,
      occurredAt: '2026-09-20T08:00:00.000Z',
    }).expect(201)

    const detail = await getInitiative(director, initiativeId).expect(200)
    const row = detail.body.progress.find(
      (item: { metricSlug: string }) => item.metricSlug === 'trees-planted',
    )

    expect(row.actual).toBe(0)
    expect(row.unverified).toBe(40)
  })

  /** الفريق الميداني يسجّل على الموقع، والحملة يجب أن ترى رقمه. */
  it('rolls site-level entries up into the initiative total', async () => {
    await recordVerifiedImpact(director, {
      metricId: trees,
      siteId,
      value: 60,
      occurredAt: '2026-09-20T08:00:00.000Z',
    })

    await recordVerifiedImpact(director, {
      metricId: trees,
      initiativeId,
      value: 15,
      occurredAt: '2026-09-21T08:00:00.000Z',
    })

    const detail = await getInitiative(director, initiativeId).expect(200)
    const row = detail.body.progress.find(
      (item: { metricSlug: string }) => item.metricSlug === 'trees-planted',
    )

    expect(row.actual).toBe(75)
  })

  it('corrects by reversal, never by editing the number', async () => {
    const entryId = await recordVerifiedImpact(director, {
      metricId: trees,
      siteId,
      value: 100,
      occurredAt: '2026-09-20T08:00:00.000Z',
    })

    // سبب الإلغاء إلزامي: تصحيح بلا سبب غير قابل للتدقيق.
    await request(app)
      .post(`/api/admin/impact/entries/${entryId}/reverse`)
      .set('authorization', bearer(director))
      .send({})
      .expect(422)

    await request(app)
      .post(`/api/admin/impact/entries/${entryId}/reverse`)
      .set('authorization', bearer(director))
      .send({ noteAr: 'خطأ في الحصر الميداني' })
      .expect(201)

    const detail = await getInitiative(director, initiativeId).expect(200)
    const row = detail.body.progress.find(
      (item: { metricSlug: string }) => item.metricSlug === 'trees-planted',
    )

    // عكس قيد موثّق يخصم فورًا لا ينتظر توثيقًا ثانيًا.
    expect(row.actual).toBe(0)

    // والقيد الأصلي باقٍ: التصحيح أضاف سطرًا ولم يمحُ سطرًا.
    const entries = await request(app)
      .get(`/api/admin/impact/entries?initiativeId=${initiativeId}`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(entries.body.data).toHaveLength(2)
  })

  it('refuses to reverse the same entry twice or to reverse a reversal', async () => {
    const entryId = await recordVerifiedImpact(director, {
      metricId: trees,
      siteId,
      value: 50,
      occurredAt: '2026-09-20T08:00:00.000Z',
    })

    const reversal = await request(app)
      .post(`/api/admin/impact/entries/${entryId}/reverse`)
      .set('authorization', bearer(director))
      .send({ noteAr: 'تصحيح' })
      .expect(201)

    await request(app)
      .post(`/api/admin/impact/entries/${entryId}/reverse`)
      .set('authorization', bearer(director))
      .send({ noteAr: 'محاولة ثانية' })
      .expect(409)

    await request(app)
      .post(`/api/admin/impact/entries/${reversal.body.id}/reverse`)
      .set('authorization', bearer(director))
      .send({ noteAr: 'عكس العكس' })
      .expect(409)
  })

  /**
   * «شجرة حيّة» تُجمَّع بـLATEST لا SUM: جولات الحصر تتكرر كل موسم، وجمعها
   * يضاعف الرقم مع كل جولة.
   */
  it('takes the latest measurement for a LATEST metric instead of summing rounds', async () => {
    const surviving = await metricIdBySlug('trees-surviving')

    await recordVerifiedImpact(director, {
      metricId: surviving,
      siteId,
      value: 95,
      occurredAt: '2026-10-01T08:00:00.000Z',
    })

    await recordVerifiedImpact(director, {
      metricId: surviving,
      siteId,
      value: 88,
      occurredAt: '2026-12-01T08:00:00.000Z',
    })

    const detail = await getInitiative(director, initiativeId).expect(200)
    const row = detail.body.progress.find(
      (item: { metricSlug: string }) => item.metricSlug === 'trees-surviving',
    )

    expect(row.actual).toBe(88)
  })

  it('rejects a negative entry — corrections go through reversal', async () => {
    await recordImpact(director, {
      metricId: trees,
      siteId,
      value: -10,
      occurredAt: '2026-09-20T08:00:00.000Z',
    }).expect(422)
  })
})
