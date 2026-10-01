import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { memberships } from '../../src/db/schema/access.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import { users } from '../../src/db/schema/identity.js'
import { hashPassword } from '../../src/modules/auth/password.service.js'
import {
  TEST_PASSWORD,
  bearer,
  createStaffUser,
  login,
} from '../helpers/auth.js'
import { closeTestDatabase, ensureTestDatabase } from '../helpers/database.js'
import {
  type FieldStage,
  bootstrapField,
  createGroup,
  createLead,
  getHome,
  getSheet,
} from '../helpers/field.js'
import { lookupValueId } from '../helpers/lookups.js'
import {
  addSite,
  createInitiative,
  programIdBySlug,
  recordImpact,
  setSiteTarget,
  metricIdBySlug,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

const fieldPath = (initiativeId: string, suffix = '') =>
  `/api/admin/initiatives/${initiativeId}/field${suffix}`

/**
 * المسرح يُبنى مرة لكل مجموعة اختبارات لا لكل اختبار: تفريغ القاعدة وبذرها
 * والدخول بكلمة مرور (Argon2) ثوانٍ على قاعدة بعيدة، وحالات كل مجموعة هنا
 * تُنشئ مجموعاتها بأسماء لا تتقاطع فلا يفسد بعضها بعضًا.
 */
describe.runIf(ready)('coordinating field groups', () => {
  let stage: FieldStage

  beforeAll(async () => {
    stage = await bootstrapField()
  })

  it('creates a group with a lead and returns the whole field', async () => {
    const response = await request(app)
      .post(fieldPath(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({
        siteId: stage.siteId,
        nameAr: '  مجموعة   الزيتون ',
        leadUserId: stage.lead.userId,
        meetsAt: '2026-10-09T05:00:00.000Z',
        meetingPointAr: 'البوابة الشرقية',
        instructionsAr: 'أحضر قفازات وماء.',
      })
      .expect(201)

    expect(response.body.initiativeId).toBe(stage.initiativeId)
    expect(response.body.groups).toHaveLength(1)
    expect(response.body.groups[0]).toMatchObject({
      // الاسم يُطبَّع: مسافتان متتاليتان لا تصنعان مجموعة ثانية.
      nameAr: 'مجموعة الزيتون',
      siteNameAr: 'حديقة تشرين',
      leadUserId: stage.lead.userId,
      leadNameAr: 'قائد الحديقة',
      meetsAt: '2026-10-09T05:00:00.000Z',
      meetingPointAr: 'البوابة الشرقية',
    })
  })

  it('refuses a second group with the same name in the same site', async () => {
    await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة الياسمين',
    })

    await request(app)
      .post(fieldPath(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({ siteId: stage.siteId, nameAr: 'مجموعة  الياسمين' })
      .expect(409)
  })

  it('refuses a site from another initiative and a cancelled site', async () => {
    const program = await programIdBySlug('tree-planting')
    const other = await createInitiative(stage.director, {
      programId: program.id,
      nameAr: 'حملة أخرى',
    })
    const foreign = await addSite(stage.director, other['id'], {
      nameAr: 'موقع غريب',
    })

    await request(app)
      .post(fieldPath(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({ siteId: foreign.id, nameAr: 'مجموعة في غير موقعها' })
      .expect(422)

    const cancelled = await addSite(stage.director, stage.initiativeId, {
      nameAr: 'موقع سيُلغى',
      status: 'CANCELLED',
    })

    await request(app)
      .post(fieldPath(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({ siteId: cancelled.id, nameAr: 'مجموعة موقع ملغى' })
      .expect(422)
  })

  /**
   * القائد يُفحص بقدرته لا بوجود حسابه: عضو بلا `field.lead` لو سُمّي قائدًا
   * لما فتح له التطبيق مجموعته، ولبقيت بلا من يسجّل فيها دون أن يعرف أحد.
   */
  it('refuses a lead who does not hold field.lead', async () => {
    const member = await createStaffUser({
      email: 'member@greencities.test',
      roleSlug: 'MEMBER',
      officeSlug: 'media',
    })

    const response = await request(app)
      .post(fieldPath(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({
        siteId: stage.siteId,
        nameAr: 'مجموعة بقائد بلا صلاحية',
        leadUserId: member.userId,
      })
      .expect(422)

    expect(response.body.detail).toContain('قائد مجموعة ميداني')
  })

  it('lists only members who hold field.lead as lead candidates', async () => {
    const response = await request(app)
      .get(fieldPath(stage.initiativeId, '/lead-candidates'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    const names = (response.body.data as Array<{ fullNameAr: string }>).map(
      (candidate) => candidate.fullNameAr,
    )

    expect(names).toContain('قائد الحديقة')
    // المدير العام يحمل الكتالوج كله، ومنه القيادة.
    expect(names).toContain('المدير العام')
    expect(names).not.toContain('عضو اختبار')
  })

  it('renames, reassigns and unassigns, and audits the lead change', async () => {
    const group = await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة السنديان',
    })

    const assigned = await request(app)
      .patch(fieldPath(stage.initiativeId, `/groups/${group.id}`))
      .set('authorization', bearer(stage.director))
      .send({ nameAr: 'مجموعة البلوط', leadUserId: stage.lead.userId })
      .expect(200)

    expect(
      assigned.body.groups.find((row: { id: string }) => row.id === group.id),
    ).toMatchObject({ nameAr: 'مجموعة البلوط', leadUserId: stage.lead.userId })

    const cleared = await request(app)
      .patch(fieldPath(stage.initiativeId, `/groups/${group.id}`))
      .set('authorization', bearer(stage.director))
      .send({ leadUserId: null })
      .expect(200)

    expect(
      cleared.body.groups.find((row: { id: string }) => row.id === group.id),
    ).toMatchObject({ leadUserId: null, leadNameAr: null })

    const events = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, group.id))

    expect(events.map((event) => event.action).sort()).toEqual([
      'field.group_created',
      'field.lead_assigned',
      'field.lead_assigned',
    ])
  })

  it('deletes a group, and answers 404 for one from another initiative', async () => {
    const group = await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة عابرة',
    })

    const program = await programIdBySlug('tree-planting')
    const other = await createInitiative(stage.director, {
      programId: program.id,
      nameAr: 'حملة لا تملك المجموعة',
    })

    await request(app)
      .delete(fieldPath(other['id'], `/groups/${group.id}`))
      .set('authorization', bearer(stage.director))
      .expect(404)

    const response = await request(app)
      .delete(fieldPath(stage.initiativeId, `/groups/${group.id}`))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(
      response.body.groups.some((row: { id: string }) => row.id === group.id),
    ).toBe(false)
  })

  it('refuses groups on a green point and on a closed campaign', async () => {
    const program = await programIdBySlug('tree-planting')

    // النقطة الخضراء تُوثَّق من الخريطة: مبادرة وموقعها في معاملة واحدة.
    const greenPoint = await request(app)
      .post('/api/admin/map/green-points')
      .set('authorization', bearer(stage.director))
      .send({
        nameAr: 'تشجير فناء المدرسة',
        contributorNameAr: 'مدرسة الأمل',
        contributorKindId: await lookupValueId('CONTRIBUTOR_KIND', 'SCHOOL'),
        lat: 33.5,
        lng: 36.3,
      })
      .expect(201)

    await request(app)
      .post(fieldPath(greenPoint.body.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({ siteId: greenPoint.body.siteId, nameAr: 'مجموعة نقطة خضراء' })
      .expect(422)

    const closing = await createInitiative(stage.director, {
      programId: program.id,
      nameAr: 'حملة ستُلغى',
    })
    const site = await addSite(stage.director, closing['id'], {
      nameAr: 'موقع حملة ملغاة',
    })

    await request(app)
      .post(`/api/admin/initiatives/${closing['id']}/cancel`)
      .set('authorization', bearer(stage.director))
      .expect(200)

    await request(app)
      .post(fieldPath(closing['id'], '/groups'))
      .set('authorization', bearer(stage.director))
      .send({ siteId: site.id, nameAr: 'مجموعة بعد الإلغاء' })
      .expect(409)
  })

  /**
   * ميدان المبادرة يُركَّب قبل موجّه المبادرات، فحارسه هو ما يحميه: من يرى
   * المبادرات ولا يحمل `field.manage` لا يرى مجموعاتها ولا يكوّنها.
   */
  it('keeps the coordinator routes behind field.manage', async () => {
    await request(app)
      .get(fieldPath(stage.initiativeId))
      .set('authorization', bearer(stage.lead.token))
      .expect(403)

    await request(app)
      .post(fieldPath(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.lead.token))
      .send({ siteId: stage.siteId, nameAr: 'مجموعة يكوّنها قائد' })
      .expect(403)

    await request(app).get(fieldPath(stage.initiativeId)).expect(401)

    // وموجّه المبادرات بعده لم يتأثر بالتركيب.
    await request(app)
      .get(`/api/admin/initiatives/${stage.initiativeId}`)
      .set('authorization', bearer(stage.lead.token))
      .expect(200)
  })
})

describe.runIf(ready)('the field app for a group lead', () => {
  let stage: FieldStage
  let groupId: string
  let otherLead: { token: string; userId: string }

  beforeAll(async () => {
    stage = await bootstrapField()
    otherLead = await createLead('second@greencities.test', 'قائد آخر')

    const group = await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة الصنوبر',
      leadUserId: stage.lead.userId,
      meetsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      meetingPointAr: 'مدخل الحديقة',
    })

    groupId = group.id
  })

  it('shows the lead only the groups they lead', async () => {
    await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة يقودها غيره',
      leadUserId: otherLead.userId,
    })

    const home = await getHome(stage.lead.token).expect(200)

    expect(home.body).toMatchObject({
      kind: 'STAFF',
      canLead: true,
      canManage: false,
      user: { fullNameAr: 'قائد الحديقة' },
    })
    expect(home.body.groups).toHaveLength(1)
    expect(home.body.groups[0]).toMatchObject({
      id: groupId,
      nameAr: 'مجموعة الصنوبر',
      siteNameAr: 'حديقة تشرين',
      initiativeNameAr: 'حملة الميدان التجريبية',
      initiativeStatus: 'ACTIVE',
    })
  })

  it('hides groups whose day passed long ago or whose site was cancelled', async () => {
    const stale = await addSite(stage.director, stage.initiativeId, {
      nameAr: 'موقع قديم',
    })
    const doomed = await addSite(stage.director, stage.initiativeId, {
      nameAr: 'موقع يُلغى بعد التكوين',
    })

    await createGroup(stage.director, stage.initiativeId, {
      siteId: stale.id,
      nameAr: 'مجموعة الشهر الماضي',
      leadUserId: stage.lead.userId,
      meetsAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    })
    await createGroup(stage.director, stage.initiativeId, {
      siteId: doomed.id,
      nameAr: 'مجموعة موقع ملغى',
      leadUserId: stage.lead.userId,
    })

    await request(app)
      .patch(`/api/admin/initiatives/${stage.initiativeId}/sites/${doomed.id}`)
      .set('authorization', bearer(stage.director))
      .send({ status: 'CANCELLED' })
      .expect(200)

    const home = await getHome(stage.lead.token).expect(200)

    expect(
      (home.body.groups as Array<{ nameAr: string }>).map((group) => group.nameAr),
    ).toEqual(['مجموعة الصنوبر'])
  })

  it('builds the day sheet from the site tasks, targets and entries', async () => {
    const trees = await metricIdBySlug('trees-planted')

    await setSiteTarget(
      stage.director,
      stage.initiativeId,
      stage.siteId,
      trees,
      120,
    ).expect(200)

    await recordImpact(stage.director, {
      metricId: trees,
      siteId: stage.siteId,
      value: 30,
    }).expect(201)

    const onSite = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(stage.director))
      .send({ siteId: stage.siteId, titleAr: 'توزيع الشتلات على الحفر' })
      .expect(201)

    await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(stage.director))
      .send({ siteId: stage.siteId, titleAr: 'مهمة ستُلغى' })
      .expect(201)
      .then((created) =>
        request(app)
          .post(`/api/admin/work/tasks/${created.body.id}/status`)
          .set('authorization', bearer(stage.director))
          .send({ status: 'CANCELLED' })
          .expect(200),
      )

    await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(stage.director))
      .send({
        initiativeId: stage.initiativeId,
        titleAr: 'استلام العدّة من المستودع',
        assigneeUserId: stage.lead.userId,
      })
      .expect(201)

    const sheet = await getSheet(stage.lead.token, groupId).expect(200)

    expect(sheet.body.group).toMatchObject({
      id: groupId,
      nameAr: 'مجموعة الصنوبر',
      meetingPointAr: 'مدخل الحديقة',
      leadNameAr: 'قائد الحديقة',
    })
    expect(sheet.body.initiative).toMatchObject({
      status: 'ACTIVE',
      acceptsEntries: true,
    })
    expect(sheet.body.site).toMatchObject({ nameAr: 'حديقة تشرين' })

    const tasks = sheet.body.tasks as Array<{
      id: string
      titleAr: string
      scope: string
    }>

    expect(tasks.find((task) => task.id === onSite.body.id)).toMatchObject({
      scope: 'SITE',
    })
    expect(
      tasks.find((task) => task.titleAr === 'استلام العدّة من المستودع'),
    ).toMatchObject({ scope: 'INITIATIVE' })
    expect(tasks.some((task) => task.titleAr === 'مهمة ستُلغى')).toBe(false)

    // القيد غير موثَّق بعد، فهو في «بانتظار التحقق» لا في «المتحقق».
    expect(sheet.body.targets).toEqual([
      expect.objectContaining({
        metricId: trees,
        target: 120,
        actual: 0,
        unverified: 30,
      }),
    ])
  })

  /** «ليست لك» و«غير موجودة» جواب واحد، فلا تُستكشف المعرّفات. */
  it('answers 404 for a group led by someone else, and lets a coordinator in', async () => {
    await getSheet(otherLead.token, groupId).expect(404)
    await getSheet(stage.lead.token, '00000000-0000-4000-8000-000000000000').expect(
      404,
    )

    const asCoordinator = await getSheet(stage.director, groupId).expect(200)

    expect(asCoordinator.body.group.id).toBe(groupId)
  })

  it('refuses callers without a session and partner accounts', async () => {
    await request(app).get('/api/field/me').expect(401)
    await request(app)
      .get('/api/field/me')
      .set('authorization', 'Bearer not-a-token')
      .expect(401)

    // حساب ممثل جهة صالح الجلسة، لكن الميدان ليس بوابته.
    await db.insert(users).values({
      email: 'partner@greencities.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      fullNameAr: 'ممثل جهة',
      kind: 'PARTNER',
      emailVerifiedAt: new Date(),
    })

    const partner = await login('partner@greencities.test')

    await getHome(partner.accessToken).expect(403)
    await getSheet(partner.accessToken, groupId).expect(403)
  })

  /**
   * الاسم في الصف لا يغني عن القدرة: قائد نُزعت منه `field.lead` بعد تسميته
   * لا يرى مجموعته ولا يفتح ورقتها.
   */
  it('closes the group to a lead whose capability was revoked', async () => {
    const revoked = await createLead('revoked@greencities.test', 'قائد سابق')

    const group = await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة قائد سابق',
      leadUserId: revoked.userId,
    })

    await getSheet(revoked.token, group.id).expect(200)

    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, revoked.userId),
          eq(memberships.status, 'ACTIVE'),
        ),
      )
      .limit(1)

    await request(app)
      .put(
        `/api/admin/people/${revoked.userId}/memberships/${membership!.id}/capabilities`,
      )
      .set('authorization', bearer(stage.director))
      .send({ grants: [], revokes: ['field.lead'] })
      .expect(200)

    const home = await getHome(revoked.token).expect(200)

    expect(home.body).toMatchObject({ canLead: false, groups: [] })
    await getSheet(revoked.token, group.id).expect(404)
  })

  it('carries the new role and capabilities through login', async () => {
    const session = await login('lead@greencities.test')

    expect(session.body.user.capabilities).toEqual(
      expect.arrayContaining(['field.lead', 'initiatives.view', 'work.view']),
    )
    expect(session.body.user.capabilities).not.toContain('field.manage')
  })
})
