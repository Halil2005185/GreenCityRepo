import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
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
  setInitiativeTarget,
  setSiteTarget,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

/**
 * إغلاق واحد على مستوى الملف لا داخل كل describe: `afterAll` داخل
 * describe يعمل عند انتهائه هو، فيقفل الـpool على الكتل التي بعده.
 */
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

describe.runIf(ready)('initiative creation and templates', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  it('starts an initiative as a draft under its program', async () => {
    const program = await programIdBySlug('tree-planting')

    const initiative = await createInitiative(director, {
      programId: program.id,
      nameAr: 'حملة 100 شجرة',
      season: 'موسم التشجير 2026',
    })

    expect(initiative).toMatchObject({ nameAr: 'حملة 100 شجرة', status: 'DRAFT' })
    // السياسة تُنسخ من البرنامج ثم تستقل عنه.
    expect(initiative['targetRollup']).toBe(program.rollup)
  })

  /** قوالب البرنامج تُنسخ عند الإنشاء، فتبدأ الحملة الثانية جاهزة. */
  it('copies the program plan into real milestones and tasks', async () => {
    const program = await programIdBySlug('tree-planting')

    const initiative = await createInitiative(director, {
      programId: program.id,
      nameAr: 'حملة تشجير تجريبية',
      startsAt: '2026-09-15T06:00:00.000Z',
    })

    const work = initiative['work']

    expect(work.milestones.length).toBeGreaterThan(0)
    expect(work.workItems.length).toBeGreaterThan(0)

    // كل مهمة مولّدة تتبع مرحلة، ولا تطفو خارج الخطة.
    for (const task of work.workItems) {
      expect(task.milestoneId).not.toBeNull()
    }

    // الإزاحات نسبية لتاريخ البدء، فالقالب لا يحمل تواريخ تتقادم.
    const dated = work.workItems.filter(
      (task: { dueAt: string | null }) => task.dueAt !== null,
    )
    expect(dated.length).toBeGreaterThan(0)
  })

  it('leaves task dates empty when the initiative has no start date', async () => {
    const program = await programIdBySlug('tree-planting')

    const initiative = await createInitiative(director, {
      programId: program.id,
      nameAr: 'مبادرة بلا تاريخ بدء',
    })

    for (const task of initiative['work'].workItems) {
      expect(task.dueAt).toBeNull()
    }
  })

  it('refuses an initiative under an unknown program', async () => {
    await request(app)
      .post('/api/admin/initiatives')
      .set('authorization', bearer(director))
      .send({
        programId: '00000000-0000-4000-8000-000000000000',
        nameAr: 'مبادرة يتيمة',
      })
      .expect(422)
  })
})

describe.runIf(ready)('the launch gate', () => {
  let director: string
  let treePlanting: string
  let trees: string

  beforeEach(async () => {
    director = await bootstrap()
    treePlanting = (await programIdBySlug('tree-planting')).id
    trees = await metricIdBySlug('trees-planted')
  })

  it('refuses to launch an initiative with no sites', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'مبادرة بلا مواقع',
    })

    await request(app)
      .post(`/api/admin/initiatives/${initiative['id']}/launch`)
      .set('authorization', bearer(director))
      .expect(422)
  })

  /** «مجموع أهداف المواقع = هدف المبادرة» تحت سياسة STRICT. */
  it('blocks a STRICT launch when the site targets do not add up', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة صارمة',
      targetRollup: 'STRICT',
    })
    const id = initiative['id']

    const first = await addSite(director, id, { nameAr: 'الموقع الأول' })
    const second = await addSite(director, id, { nameAr: 'الموقع الثاني' })

    await setInitiativeTarget(director, id, trees, 100).expect(200)
    await setSiteTarget(director, id, first.id, trees, 40).expect(200)
    await setSiteTarget(director, id, second.id, trees, 35).expect(200)

    const rejected = await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(422)

    expect(JSON.stringify(rejected.body.details)).toContain('75')

    // إكمال الناقص يفتح البوابة دون تغيير أي شيء آخر.
    const third = await addSite(director, id, { nameAr: 'الموقع الثالث' })
    await setSiteTarget(director, id, third.id, trees, 25).expect(200)

    const launched = await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(launched.body.status).toBe('ACTIVE')
    expect(launched.body.launchedAt).toBeTypeOf('string')
  })

  it('lets an ADVISORY launch through but returns the mismatch as a warning', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة إرشادية',
      targetRollup: 'ADVISORY',
    })
    const id = initiative['id']
    const site = await addSite(director, id, { nameAr: 'موقع وحيد' })

    await setInitiativeTarget(director, id, trees, 100).expect(200)
    await setSiteTarget(director, id, site.id, trees, 40).expect(200)

    const launched = await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(launched.body.status).toBe('ACTIVE')
    expect(launched.body.warnings.length).toBeGreaterThan(0)
  })

  it('ignores the mismatch entirely under NONE', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة لا مركزية',
      targetRollup: 'NONE',
    })
    const id = initiative['id']
    const site = await addSite(director, id, { nameAr: 'موقع' })

    await setInitiativeTarget(director, id, trees, 1000).expect(200)
    await setSiteTarget(director, id, site.id, trees, 1).expect(200)

    const launched = await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(launched.body.status).toBe('ACTIVE')
    expect(launched.body.warnings).toHaveLength(0)
  })

  /** قائمة تحقق حيّة كما في بوابة اعتماد الشريك، لا رسالة خطأ فقط. */
  it('exposes the rollup on every read, not only on failure', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة للقراءة',
      targetRollup: 'STRICT',
    })
    const id = initiative['id']
    const site = await addSite(director, id, { nameAr: 'موقع' })

    await setInitiativeTarget(director, id, trees, 50).expect(200)
    await setSiteTarget(director, id, site.id, trees, 20).expect(200)

    const detail = await getInitiative(director, id).expect(200)

    expect(detail.body.rollup.satisfied).toBe(false)
    expect(detail.body.rollup.metrics[0]).toMatchObject({
      initiativeTarget: 50,
      siteTargetSum: 20,
      matches: false,
    })
  })

  it('excludes a cancelled site from the required sum', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة بموقع ملغى',
      targetRollup: 'STRICT',
    })
    const id = initiative['id']

    const live = await addSite(director, id, { nameAr: 'موقع عامل' })
    const dropped = await addSite(director, id, { nameAr: 'موقع ملغى' })

    await setInitiativeTarget(director, id, trees, 60).expect(200)
    await setSiteTarget(director, id, live.id, trees, 60).expect(200)
    await setSiteTarget(director, id, dropped.id, trees, 40).expect(200)

    // قبل الإلغاء المجموع 100 ≠ 60 فتُرفض.
    await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(422)

    await request(app)
      .patch(`/api/admin/initiatives/${id}/sites/${dropped.id}`)
      .set('authorization', bearer(director))
      .send({ status: 'CANCELLED' })
      .expect(200)

    await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(200)
  })

  it('refuses to launch the same initiative twice', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة مكررة',
      targetRollup: 'NONE',
    })
    const id = initiative['id']
    await addSite(director, id, { nameAr: 'موقع' })

    await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(200)

    await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(409)
  })

  it('reserves launching to the capability, not to anyone who can edit', async () => {
    const initiative = await createInitiative(director, {
      programId: treePlanting,
      nameAr: 'حملة محروسة',
      targetRollup: 'NONE',
    })
    const id = initiative['id']
    await addSite(director, id, { nameAr: 'موقع' })

    // الإعلام يرى المبادرات ولا يبدأ تنفيذها.
    await createStaffUser({
      email: 'media@greencities.test',
      roleSlug: 'MEDIA',
      officeSlug: 'media',
    })
    const media = (await login('media@greencities.test')).accessToken

    await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(media))
      .expect(403)
  })
})

/**
 * معيار القبول الحاسم في PLAN.md: «إنشاء مبادرة ثانية تحت برنامج مختلف،
 * بمؤشر جديد ووحدة قياس مختلفة، بإدخال بيانات فقط ودون migration أو
 * تعديل كود أو شاشة».
 *
 * فشل هذا الاختبار يعني أن النموذج انزلق إلى التشفير الصلب مهما بدت
 * باقي الاختبارات ناجحة.
 */
describe.runIf(ready)('the dynamism criterion', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  it('runs a soil-remediation initiative on a brand new metric, through the API alone', async () => {
    // 1) برنامج جديد لم يكن في البذور.
    const program = await request(app)
      .post('/api/admin/programs')
      .set('authorization', bearer(director))
      .send({
        slug: 'soil-remediation',
        nameAr: 'معالجة التربة',
        descriptionAr: 'معالجة التربة المتضررة من المواد الكيميائية ومخلفات الحرب.',
        defaultTargetRollup: 'ADVISORY',
      })
      .expect(201)

    // 2) مؤشر جديد بوحدة ودقة مختلفتين تمامًا عن الأشجار.
    const metric = await request(app)
      .post('/api/admin/metrics')
      .set('authorization', bearer(director))
      .send({
        slug: 'soil-treated',
        nameAr: 'تربة معالجة',
        unitAr: 'م²',
        aggregation: 'SUM',
        decimals: 2,
      })
      .expect(201)

    // 3) مبادرة تحته بمواقعها وأهدافها.
    const initiative = await createInitiative(director, {
      programId: program.body.id,
      nameAr: 'إحياء تربة الغوطة',
      targetRollup: 'STRICT',
    })
    const id = initiative['id']

    const first = await addSite(director, id, { nameAr: 'القطعة الشمالية' })
    const second = await addSite(director, id, { nameAr: 'القطعة الجنوبية' })

    await setInitiativeTarget(director, id, metric.body.id, 1500.5).expect(200)
    await setSiteTarget(director, id, first.id, metric.body.id, 900.25).expect(200)
    await setSiteTarget(director, id, second.id, metric.body.id, 600.25).expect(200)

    // 4) البوابة الصارمة تعمل على المؤشر الجديد بأرقامه العشرية.
    const launched = await request(app)
      .post(`/api/admin/initiatives/${id}/launch`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(launched.body.status).toBe('ACTIVE')

    // 5) قيد أثر موثّق بالوحدة الجديدة يظهر في التقدم.
    const entry = await request(app)
      .post('/api/admin/impact/entries')
      .set('authorization', bearer(director))
      .send({
        metricId: metric.body.id,
        siteId: first.id,
        value: 320.75,
        occurredAt: '2026-10-01T08:00:00.000Z',
      })
      .expect(201)

    await request(app)
      .post(`/api/admin/impact/entries/${entry.body.id}/verify`)
      .set('authorization', bearer(director))
      .expect(200)

    const detail = await getInitiative(director, id).expect(200)
    const progress = detail.body.progress.find(
      (row: { metricSlug: string }) => row.metricSlug === 'soil-treated',
    )

    expect(progress).toMatchObject({ unitAr: 'م²', initiativeTarget: 1500.5 })
    // القيد سُجّل على الموقع، والمبادرة تراه — الفريق الميداني يسجّل على الموقع.
    expect(progress.actual).toBeCloseTo(320.75, 2)
  })
})
