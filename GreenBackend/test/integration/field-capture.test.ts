import { S3Client } from '@aws-sdk/client-s3'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import {
  attachments,
  attendance,
  participants,
} from '../../src/db/schema/field.js'
import { bearer } from '../helpers/auth.js'
import { closeTestDatabase, ensureTestDatabase } from '../helpers/database.js'
import {
  type FieldStage,
  addPeople,
  adminField,
  bootstrapField,
  createGroup,
  createJoinForm,
  createLead,
  fieldPost,
  getHome,
  getSheet,
  newClientId,
  submitAndDecide,
} from '../helpers/field.js'
import {
  addSite,
  createInitiative,
  metricIdBySlug,
  programIdBySlug,
  setSiteTarget,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

type SheetMember = {
  id: string
  participantId: string
  fullNameAr: string
  phone: string | null
  attendance: { id: string; method: string } | null
}

const membersOf = async (token: string, groupId: string) =>
  (await getSheet(token, groupId).expect(200)).body.members as SheetMember[]

/**
 * المسرح يُبنى مرة لكل مجموعة اختبارات، كما في `field.test.ts`: القاعدة
 * بعيدة، وحالات كل مجموعة هنا تعمل على مجموعاتها ومشاركيها.
 */
describe.runIf(ready)('distributing volunteers', () => {
  let stage: FieldStage
  let groupId: string

  beforeAll(async () => {
    stage = await bootstrapField()
    groupId = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة التوزيع',
        leadUserId: stage.lead.userId,
      })
    ).id
  })

  /**
   * صورتا المطابقة: الشخص نفسه مكتوبًا بإملاءين وصيغتَي هاتف مشارك واحد،
   * وأخوان بهاتف أبيهما شخصان.
   */
  it('adds typed people once, however their name and phone are written', async () => {
    const first = await addPeople(stage.director, stage.initiativeId, groupId, [
      { fullNameAr: 'أسامة الحلبي', phone: '+963 944 123 456' },
      { fullNameAr: 'ليان الحلبي', phone: '0944123456' },
    ])

    expect(first.summary).toMatchObject({ added: 2, newParticipants: 2 })

    const again = await addPeople(stage.director, stage.initiativeId, groupId, [
      { fullNameAr: 'اسامه الحلبى', phone: '0944 123 456' },
    ])

    expect(again.summary).toMatchObject({
      added: 0,
      alreadyMembers: 1,
      newParticipants: 0,
    })
    expect(again.members).toHaveLength(2)
  })

  it('does not double a hand-written list with no phones', async () => {
    const other = await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'مجموعة بلا هواتف',
    })
    const names = [{ fullNameAr: 'أحمد' }, { fullNameAr: 'سعاد' }]

    await addPeople(stage.director, stage.initiativeId, other.id, names)

    const again = await addPeople(
      stage.director,
      stage.initiativeId,
      other.id,
      names,
    )

    expect(again.summary).toMatchObject({ added: 0, alreadyMembers: 2 })

    // و«أحمد» في مجموعة أخرى شخص آخر: الاسم وحده ليس هوية خارج مجموعته.
    const elsewhere = await addPeople(
      stage.director,
      stage.initiativeId,
      groupId,
      [{ fullNameAr: 'أحمد' }],
    )

    expect(elsewhere.summary.newParticipants).toBe(1)
  })

  /**
   * الجسر من الاستمارة قرار المنسّق، وما يعبره الاسم ووسيلة التواصل وحدهما.
   * والطلب غير المقبول لا يُضاف ولو أُرسل معرّفه.
   */
  it('turns accepted applications into members, and refuses pending ones', async () => {
    const form = await createJoinForm(stage.director)
    const accepted = await submitAndDecide(stage.director, form, {
      full_name: 'سارة المتطوعة',
      phone: '0933 222 111',
    })
    const pending = await submitAndDecide(
      stage.director,
      form,
      { full_name: 'طلب لم يُفرز', phone: '0933 000 000' },
      'NEW',
    )

    const sources = await request(app)
      .get(adminField(stage.initiativeId, '/sources'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(sources.body.data).toEqual([
      { formId: form.formId, nameAr: 'استمارة المتطوعين', acceptedCount: 1 },
    ])

    const applicants = await request(app)
      .get(adminField(stage.initiativeId, `/applicants?formId=${form.formId}`))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(applicants.body.data).toEqual([
      expect.objectContaining({
        submissionId: accepted,
        fullNameAr: 'سارة المتطوعة',
        phone: '0933 222 111',
        participantId: null,
        groupNamesAr: [],
      }),
    ])
    // الإجابات لا تخرج من هنا: المنسّق يوزّع ولا يفرز.
    expect(applicants.body.data[0]).not.toHaveProperty('answers')

    await request(app)
      .post(adminField(stage.initiativeId, `/groups/${groupId}/members`))
      .set('authorization', bearer(stage.director))
      .send({ formId: form.formId, submissionIds: [accepted, pending] })
      .expect(422)

    const added = await request(app)
      .post(adminField(stage.initiativeId, `/groups/${groupId}/members`))
      .set('authorization', bearer(stage.director))
      .send({ formId: form.formId, submissionIds: [accepted] })
      .expect(200)

    expect(added.body.summary).toMatchObject({ added: 1, newParticipants: 1 })
    expect(
      added.body.members.find(
        (member: { fullNameAr: string }) => member.fullNameAr === 'سارة المتطوعة',
      ),
    ).toMatchObject({ fromForm: true, phone: '0933 222 111' })

    const after = await request(app)
      .get(adminField(stage.initiativeId, `/applicants?formId=${form.formId}`))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(after.body.data[0]).toMatchObject({
      groupNamesAr: ['مجموعة التوزيع'],
    })
    expect(after.body.data[0].participantId).toBeTypeOf('string')

    // تحويل الطلب مرة ثانية يعيد مشاركه لا مشاركًا ثانيًا.
    await request(app)
      .post(adminField(stage.initiativeId, `/groups/${groupId}/members`))
      .set('authorization', bearer(stage.director))
      .send({ formId: form.formId, submissionIds: [accepted] })
      .expect(200)

    const converted = await db
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.sourceSubmissionId, accepted))

    expect(converted).toHaveLength(1)
  })

  it('finds a past participant by name or phone', async () => {
    const byName = await request(app)
      .get(adminField(stage.initiativeId, '/participants?q=اسامه'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(byName.body.data).toEqual([
      expect.objectContaining({
        fullNameAr: 'أسامة الحلبي',
        groupNamesAr: ['مجموعة التوزيع'],
      }),
    ])

    const byPhone = await request(app)
      .get(adminField(stage.initiativeId, '/participants?q=0944123456'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(
      (byPhone.body.data as Array<{ fullNameAr: string }>)
        .map((row) => row.fullNameAr)
        .sort(),
    ).toEqual(['أسامة الحلبي', 'ليان الحلبي'])
  })

  it('names an assistant and removes a member without losing the person', async () => {
    const { members } = await addPeople(
      stage.director,
      stage.initiativeId,
      groupId,
      [{ fullNameAr: 'عضو عابر', phone: '0955 111 222' }],
    )
    const member = members.find((row) => row.fullNameAr === 'عضو عابر')!

    const promoted = await request(app)
      .patch(
        adminField(stage.initiativeId, `/groups/${groupId}/members/${member.id}`),
      )
      .set('authorization', bearer(stage.director))
      .send({ role: 'ASSISTANT' })
      .expect(200)

    expect(
      promoted.body.members.find((row: { id: string }) => row.id === member.id),
    ).toMatchObject({ role: 'ASSISTANT' })

    const removed = await request(app)
      .delete(
        adminField(stage.initiativeId, `/groups/${groupId}/members/${member.id}`),
      )
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(
      removed.body.members.some((row: { id: string }) => row.id === member.id),
    ).toBe(false)

    const [person] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.id, member.participantId))

    expect(person).toBeDefined()
  })

  it('keeps members and applicants behind field.manage', async () => {
    for (const path of [
      `/groups/${groupId}/members`,
      '/sources',
      '/participants?q=اسامه',
      '/attendance',
      '/photos',
    ]) {
      await request(app)
        .get(adminField(stage.initiativeId, path))
        .set('authorization', bearer(stage.lead.token))
        .expect(403)
    }
  })
})

describe.runIf(ready)('capturing the day from the field', () => {
  let stage: FieldStage
  let groupId: string
  let otherLead: { token: string; userId: string }
  let members: SheetMember[]
  let trees: string

  const post = (path: string, body: Record<string, unknown>) =>
    fieldPost(stage.lead.token, path, body)

  beforeAll(async () => {
    stage = await bootstrapField()
    otherLead = await createLead('second@greencities.test', 'قائد آخر')
    trees = await metricIdBySlug('trees-planted')

    groupId = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الصنوبر',
        leadUserId: stage.lead.userId,
      })
    ).id

    await addPeople(stage.director, stage.initiativeId, groupId, [
      { fullNameAr: 'هبة الأحمد', phone: '0944 000 001' },
      { fullNameAr: 'مازن العلي', phone: '0944 000 002' },
      { fullNameAr: 'نور الشامي' },
    ])

    members = await membersOf(stage.lead.token, groupId)
  })

  const member = (name: string) =>
    members.find((row) => row.fullNameAr === name)!

  it('shows the lead the group with phones and nobody present yet', async () => {
    expect(members.map((row) => row.fullNameAr)).toEqual([
      'مازن العلي',
      'نور الشامي',
      'هبة الأحمد',
    ])
    expect(member('هبة الأحمد')).toMatchObject({
      phone: '0944 000 001',
      attendance: null,
    })

    const home = await getHome(stage.lead.token).expect(200)

    expect(home.body.groups[0]).toMatchObject({
      memberCount: 3,
      presentToday: 0,
    })
  })

  /**
   * الهاتف يعيد الطلب بعد انقطاع حتى يصله الجواب، وقد ينقر قائد ومساعده
   * الاسم نفسه من جهازين. في الحالين: حضور واحد.
   */
  it('records a check-in once, by resend and by a second tap', async () => {
    const clientId = newClientId()
    const body = { clientId, participantId: member('هبة الأحمد').participantId }

    const first = await post(`/groups/${groupId}/attendance`, body).expect(200)
    const resent = await post(`/groups/${groupId}/attendance`, body).expect(200)

    expect(resent.body.id).toBe(first.body.id)
    expect(first.body).toMatchObject({
      fullNameAr: 'هبة الأحمد',
      method: 'LEAD_TAP',
      undoneAt: null,
    })

    const secondTap = await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId: member('هبة الأحمد').participantId,
    }).expect(200)

    expect(secondTap.body.id).toBe(first.body.id)

    const rows = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(eq(attendance.participantId, member('هبة الأحمد').participantId))

    expect(rows).toHaveLength(1)

    const sheet = await membersOf(stage.lead.token, groupId)

    expect(
      sheet.find((row) => row.fullNameAr === 'هبة الأحمد')?.attendance,
    ).toMatchObject({ id: first.body.id, method: 'LEAD_TAP' })
  })

  it('adds a walk-in as a member and marks them present', async () => {
    const walkIn = await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      walkIn: { fullNameAr: 'جار الحديقة', phone: '0966 555 444' },
    }).expect(200)

    expect(walkIn.body).toMatchObject({
      fullNameAr: 'جار الحديقة',
      method: 'WALK_IN',
    })
    expect(walkIn.body.memberId).toBeTypeOf('string')

    // من جاء بلا تسجيل وهو عضو أصلًا لا يصير اثنين.
    const known = await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      walkIn: { fullNameAr: 'مازن العلي', phone: '0944000002' },
    }).expect(200)

    expect(known.body.participantId).toBe(member('مازن العلي').participantId)

    const sheet = await membersOf(stage.lead.token, groupId)

    expect(sheet).toHaveLength(4)
    expect(sheet.filter((row) => row.attendance !== null)).toHaveLength(3)
  })

  it('refuses someone who is not in the group, and a check-in from the future', async () => {
    const stranger = await addPeople(
      stage.director,
      stage.initiativeId,
      (
        await createGroup(stage.director, stage.initiativeId, {
          siteId: stage.siteId,
          nameAr: 'مجموعة أخرى',
        })
      ).id,
      [{ fullNameAr: 'عضو مجموعة أخرى', phone: '0977 000 111' }],
    )

    await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId: stranger.members[0]!.participantId,
    }).expect(422)

    await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId: member('نور الشامي').participantId,
      checkedInAt: new Date(Date.now() + 3_600_000).toISOString(),
    }).expect(422)

    // واحد منهما لا كلاهما ولا لا شيء.
    await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
    }).expect(422)
  })

  /**
   * القائد يسجّل ويتراجع بلا شبكة، فيعرف هاتفه معرّفه هو لا معرّف الخادم.
   * والتراجع بطابع: الصف يبقى، ويُسجَّل حضور جديد بعده.
   */
  it('undoes a check-in by the id the phone gave it, then checks in again', async () => {
    const clientId = newClientId()
    const participantId = member('نور الشامي').participantId

    const checkedIn = await post(`/groups/${groupId}/attendance`, {
      clientId,
      participantId,
    }).expect(200)

    const undone = await post(`/groups/${groupId}/attendance/undo`, {
      attendanceClientId: clientId,
    }).expect(200)

    expect(undone.body.id).toBe(checkedIn.body.id)
    expect(undone.body.undoneAt).toBeTypeOf('string')

    const again = await post(`/groups/${groupId}/attendance/undo`, {
      attendanceId: checkedIn.body.id,
    }).expect(200)

    expect(again.body.undoneAt).toBe(undone.body.undoneAt)

    const back = await post(`/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId,
    }).expect(200)

    expect(back.body.id).not.toBe(checkedIn.body.id)

    const rows = await db
      .select({ undoneAt: attendance.undoneAt })
      .from(attendance)
      .where(eq(attendance.participantId, participantId))

    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.undoneAt === null)).toHaveLength(1)
  })

  /**
   * رقم الميدان قيد في الدفتر نفسه، مصدره ظاهر، ولا يدخل «المتحقق» قبل أن
   * يتحقق منه المنسّق.
   */
  it('records a count as an unverified field entry, once', async () => {
    await setSiteTarget(
      stage.director,
      stage.initiativeId,
      stage.siteId,
      trees,
      120,
    ).expect(200)

    const clientId = newClientId()
    const body = { clientId, metricId: trees, value: 40, noteAr: 'الصف الشرقي' }

    const entry = await post(`/groups/${groupId}/impact`, body).expect(200)
    const resent = await post(`/groups/${groupId}/impact`, body).expect(200)

    expect(resent.body.id).toBe(entry.body.id)
    expect(entry.body).toMatchObject({
      source: 'FIELD_ENTRY',
      scope: 'SITE',
      siteId: stage.siteId,
      value: 40,
      verifiedAt: null,
      recordedByNameAr: 'قائد الحديقة',
    })

    const sheet = await getSheet(stage.lead.token, groupId).expect(200)

    expect(sheet.body.targets).toEqual([
      expect.objectContaining({
        metricId: trees,
        target: 120,
        actual: 0,
        unverified: 40,
      }),
    ])

    const pending = await request(app)
      .get(
        `/api/admin/impact/entries?initiativeId=${stage.initiativeId}&source=FIELD_ENTRY&verified=false`,
      )
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(pending.body.data).toHaveLength(1)

    await request(app)
      .post(`/api/admin/impact/entries/${entry.body.id}/verify`)
      .set('authorization', bearer(stage.director))
      .expect(200)

    const verified = await getSheet(stage.lead.token, groupId).expect(200)

    expect(verified.body.targets[0]).toMatchObject({ actual: 40, unverified: 0 })

    await post(`/groups/${groupId}/impact`, {
      clientId: newClientId(),
      metricId: trees,
      value: 0,
    }).expect(422)
  })

  /**
   * الرابط نص يكتبه من يرسله: لا يُسجَّل في المعرض إلا ما وقّعناه لصور
   * الميدان. وصورة فيها أشخاص لا تُقبل بلا موافقتهم.
   */
  it('signs a photo upload and registers only what it signed', async () => {
    const signed = await post(`/groups/${groupId}/photos/sign`, {
      contentType: 'image/jpeg',
      size: 300_000,
    }).expect(200)

    const url = signed.body.data.publicUrl as string

    expect(url).toMatch(
      /^https:\/\/media\.test\/field\/photos\/[0-9a-f-]{36}\.jpg$/,
    )

    const photo = {
      clientId: newClientId(),
      url,
      contentType: 'image/jpeg',
      sizeBytes: 300_000,
      location: { lat: 33.5138, lng: 36.2765 },
      captionAr: 'الصف الشرقي بعد الزراعة',
      hasPeople: true,
      peopleConsent: true,
    }

    const registered = await post(`/groups/${groupId}/photos`, photo).expect(200)
    const resent = await post(`/groups/${groupId}/photos`, photo).expect(200)

    expect(resent.body.id).toBe(registered.body.id)
    expect(registered.body).toMatchObject({ url, hasPeople: true })

    for (const foreign of [
      'https://example.com/photo.jpg',
      'https://media.test/initiatives/covers/11111111-1111-4111-8111-111111111111.jpg',
      `${url}?x=1`,
      'https://media.test/field/photos/../../etc/passwd',
    ]) {
      await post(`/groups/${groupId}/photos`, {
        ...photo,
        clientId: newClientId(),
        url: foreign,
      }).expect(422)
    }

    const second = await post(`/groups/${groupId}/photos/sign`, {
      contentType: 'image/webp',
      size: 200_000,
    }).expect(200)

    await post(`/groups/${groupId}/photos`, {
      clientId: newClientId(),
      url: second.body.data.publicUrl,
      contentType: 'image/webp',
      sizeBytes: 200_000,
      hasPeople: true,
      peopleConsent: false,
    }).expect(422)

    await post(`/groups/${groupId}/photos/sign`, {
      contentType: 'application/pdf',
      size: 1000,
    }).expect(422)

    const sheet = await getSheet(stage.lead.token, groupId).expect(200)

    expect(sheet.body.photoCount).toBe(1)
    expect(sheet.body.photos[0]).toMatchObject({ id: registered.body.id })
  })

  /**
   * «أُنجزت» نيّة القائد: من لا يعتمد الإنجاز تذهب مهمته إلى المراجعة، ومن
   * يعتمده تصير عنده منجزة. والمهمة التي لم تبدأ تمرّ بمحطاتها.
   */
  it('moves a task through its gates, and sends it to review for a lead', async () => {
    const created = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(stage.director))
      .send({ siteId: stage.siteId, titleAr: 'حفر مئة وعشرين حفرة' })
      .expect(201)

    const taskId = created.body.id as string
    const status = (body: Record<string, unknown>, token = stage.lead.token) =>
      fieldPost(token, `/tasks/${taskId}/status`, { groupId, ...body })

    await status({ status: 'BLOCKED' }).expect(422)

    const blocked = await status({
      status: 'BLOCKED',
      blockedReasonAr: 'الصنبور مقفل وننتظر مفتاحه',
    }).expect(200)

    expect(blocked.body).toMatchObject({
      status: 'BLOCKED',
      blockedReasonAr: 'الصنبور مقفل وننتظر مفتاحه',
    })

    const finished = await status({ status: 'DONE' }).expect(200)

    expect(finished.body.status).toBe('IN_REVIEW')

    // النقرة أُعيد إرسالها: نجاح بلا أثر.
    await status({ status: 'DONE' }).expect(200)

    const approved = await status({ status: 'DONE' }, stage.director).expect(200)

    expect(approved.body.status).toBe('DONE')

    const trail = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, taskId))

    expect(trail.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'work.task_blocked',
        'work.task_in_progress',
        'work.task_in_review',
        'work.task_done',
      ]),
    )
  })

  it('adds a field note once, and keeps tasks outside the sheet out of reach', async () => {
    const onSite = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(stage.director))
      .send({ siteId: stage.siteId, titleAr: 'ريّ الشتلات' })
      .expect(201)

    const clientId = newClientId()
    const note = { clientId, groupId, bodyAr: 'الماء يكفي ليومين فقط.' }

    const first = await post(`/tasks/${onSite.body.id}/comments`, note).expect(200)

    await post(`/tasks/${onSite.body.id}/comments`, note).expect(200)

    expect(first.body.commentCount).toBe(1)

    const detail = await request(app)
      .get(`/api/admin/work/tasks/${onSite.body.id}`)
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(detail.body.comments).toHaveLength(1)
    expect(detail.body.comments[0]).toMatchObject({
      bodyAr: 'الماء يكفي ليومين فقط.',
      isInternal: true,
      authorNameAr: 'قائد الحديقة',
    })

    // مهمة على المبادرة لم تُسند إلى القائد ليست من ورقته.
    const elsewhere = await request(app)
      .post('/api/admin/work/tasks')
      .set('authorization', bearer(stage.director))
      .send({ initiativeId: stage.initiativeId, titleAr: 'مهمة مكتبية' })
      .expect(201)

    await post(`/tasks/${elsewhere.body.id}/status`, {
      groupId,
      status: 'IN_PROGRESS',
    }).expect(404)

    await post(`/tasks/${elsewhere.body.id}/comments`, {
      clientId: newClientId(),
      groupId,
      bodyAr: 'لا يجوز',
    }).expect(404)
  })

  it('starts, closes and reopens the site, and leaves cancelling to the coordinator', async () => {
    const site = (status: string) =>
      request(app)
        .patch(`/api/field/groups/${groupId}/site`)
        .set('authorization', bearer(stage.lead.token))
        .send({ status })

    const started = await site('IN_PROGRESS').expect(200)

    expect(started.body).toEqual({
      siteId: stage.siteId,
      status: 'IN_PROGRESS',
    })

    await site('IN_PROGRESS').expect(200)
    await site('COMPLETED').expect(200)
    await site('IN_PROGRESS').expect(200)
    await site('CANCELLED').expect(422)

    const sheet = await getSheet(stage.lead.token, groupId).expect(200)

    expect(sheet.body.site.status).toBe('IN_PROGRESS')
  })

  it('closes every write to a lead of another group', async () => {
    const participantId = member('هبة الأحمد').participantId

    await fieldPost(otherLead.token, `/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId,
    }).expect(404)

    await fieldPost(otherLead.token, `/groups/${groupId}/impact`, {
      clientId: newClientId(),
      metricId: trees,
      value: 5,
    }).expect(404)

    await fieldPost(otherLead.token, `/groups/${groupId}/photos/sign`, {
      contentType: 'image/jpeg',
      size: 1000,
    }).expect(404)

    await request(app)
      .patch(`/api/field/groups/${groupId}/site`)
      .set('authorization', bearer(otherLead.token))
      .send({ status: 'COMPLETED' })
      .expect(404)
  })

  /** المسودة لم يبدأ تنفيذها: ورقتها تُقرأ ولا يُكتب عليها. */
  it('reads a draft campaign but refuses to record on it', async () => {
    const program = await programIdBySlug('tree-planting')
    const draft = await createInitiative(stage.director, {
      programId: program.id,
      nameAr: 'حملة لم تبدأ',
    })
    const site = await addSite(stage.director, draft['id'], {
      nameAr: 'موقع لم يبدأ',
    })
    const group = await createGroup(stage.director, draft['id'], {
      siteId: site.id,
      nameAr: 'مجموعة تنتظر',
      leadUserId: stage.lead.userId,
    })
    const added = await addPeople(stage.director, draft['id'], group.id, [
      { fullNameAr: 'متطوع مبكر' },
    ])

    const sheet = await getSheet(stage.lead.token, group.id).expect(200)

    expect(sheet.body.initiative).toMatchObject({
      status: 'DRAFT',
      acceptsEntries: false,
    })

    const refused = await post(`/groups/${group.id}/attendance`, {
      clientId: newClientId(),
      participantId: added.members[0]!.participantId,
    }).expect(409)

    expect(refused.body.detail).toContain('لم يبدأ تنفيذ المبادرة')
  })
})

describe.runIf(ready)('the coordinator after the day', () => {
  let stage: FieldStage
  let groupId: string
  let volunteers: string
  let today: string

  beforeAll(async () => {
    stage = await bootstrapField()
    volunteers = await metricIdBySlug('volunteers-participated')

    groupId = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الحصاد',
        leadUserId: stage.lead.userId,
      })
    ).id

    const { members } = await addPeople(
      stage.director,
      stage.initiativeId,
      groupId,
      [
        { fullNameAr: 'حاضر أول', phone: '0944 100 001' },
        { fullNameAr: 'حاضر ثانٍ', phone: '0944 100 002' },
        { fullNameAr: 'غائب', phone: '0944 100 003' },
      ],
    )

    for (const name of ['حاضر أول', 'حاضر ثانٍ']) {
      const recorded = await fieldPost(
        stage.lead.token,
        `/groups/${groupId}/attendance`,
        {
          clientId: newClientId(),
          participantId: members.find((row) => row.fullNameAr === name)!
            .participantId,
        },
      ).expect(200)

      today = recorded.body.attendedOn
    }
  })

  it('summarises attendance by day and site, and lists who came', async () => {
    const summary = await request(app)
      .get(adminField(stage.initiativeId, '/attendance'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(summary.body.data).toEqual([
      {
        day: today,
        siteId: stage.siteId,
        siteNameAr: 'حديقة تشرين',
        present: 2,
        groups: [{ groupId, nameAr: 'مجموعة الحصاد', present: 2 }],
      },
    ])

    const members = await request(app)
      .get(adminField(stage.initiativeId, `/groups/${groupId}/members`))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(
      (members.body.members as Array<{ fullNameAr: string; attendedDays: number }>)
        .filter((row) => row.attendedDays > 0)
        .map((row) => row.fullNameAr)
        .sort(),
    ).toEqual(['حاضر أول', 'حاضر ثانٍ'])

    const field = await request(app)
      .get(adminField(stage.initiativeId))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(field.body.groups[0]).toMatchObject({
      memberCount: 3,
      attendedCount: 2,
    })
  })

  /**
   * يوم سُجّل حضوره لا يُسجَّل مرتين، وإن تغيّر العدد بعده لا يُكتب فوقه:
   * الدفتر إضافي، فالتصحيح عكسٌ ثم قيد.
   */
  it('turns a day of attendance into one impact entry per site', async () => {
    const record = () =>
      request(app)
        .post(adminField(stage.initiativeId, '/attendance/impact'))
        .set('authorization', bearer(stage.director))
        .send({ metricId: volunteers, day: today })

    const first = await record().expect(200)

    expect(first.body.recorded).toHaveLength(1)
    expect(first.body.recorded[0]).toMatchObject({
      source: 'FIELD_ENTRY',
      siteId: stage.siteId,
      value: 2,
      verifiedAt: null,
    })

    const second = await record().expect(200)

    expect(second.body.recorded).toHaveLength(0)
    expect(second.body.unchanged).toEqual([
      { siteId: stage.siteId, siteNameAr: 'حديقة تشرين', value: 2 },
    ])

    await fieldPost(stage.lead.token, `/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      walkIn: { fullNameAr: 'حاضر متأخر' },
    }).expect(200)

    await record().expect(409)

    await request(app)
      .post(`/api/admin/impact/entries/${first.body.recorded[0].id}/reverse`)
      .set('authorization', bearer(stage.director))
      .send({ noteAr: 'حضر متطوع بعد تسجيل القيد' })
      .expect(201)

    const third = await record().expect(200)

    expect(third.body.recorded[0]).toMatchObject({ value: 3 })

    await request(app)
      .post(adminField(stage.initiativeId, '/attendance/impact'))
      .set('authorization', bearer(stage.director))
      .send({ metricId: volunteers, day: '2020-01-01' })
      .expect(422)
  })

  it('refuses to delete a group that has attendance', async () => {
    const response = await request(app)
      .delete(adminField(stage.initiativeId, `/groups/${groupId}`))
      .set('authorization', bearer(stage.director))
      .expect(409)

    expect(response.body.detail).toContain('سجل حضور')
  })

  /**
   * الصورة داخلية حتى يسمح المنسّق بنشرها، وحذفها يمحوها من التخزين لا من
   * المعرض وحده.
   */
  it('reviews field photos: allows one for public use, deletes another', async () => {
    const upload = async (consent: boolean) => {
      const signed = await fieldPost(
        stage.lead.token,
        `/groups/${groupId}/photos/sign`,
        { contentType: 'image/jpeg', size: 250_000 },
      ).expect(200)

      const registered = await fieldPost(
        stage.lead.token,
        `/groups/${groupId}/photos`,
        {
          clientId: newClientId(),
          url: signed.body.data.publicUrl,
          contentType: 'image/jpeg',
          sizeBytes: 250_000,
          hasPeople: consent,
          peopleConsent: consent,
        },
      ).expect(200)

      return registered.body.id as string
    }

    const withPeople = await upload(true)
    const landscape = await upload(false)

    const listed = await request(app)
      .get(adminField(stage.initiativeId, `/photos?siteId=${stage.siteId}`))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(listed.body.data).toHaveLength(2)
    expect(listed.body.data[0]).toMatchObject({
      siteNameAr: 'حديقة تشرين',
      groupNameAr: 'مجموعة الحصاد',
      uploadedByNameAr: 'قائد الحديقة',
      publicUseAllowed: false,
    })

    const allowed = await request(app)
      .patch(adminField(stage.initiativeId, `/photos/${withPeople}`))
      .set('authorization', bearer(stage.director))
      .send({ publicUseAllowed: true, captionAr: 'متطوعو الحصاد' })
      .expect(200)

    expect(allowed.body).toMatchObject({
      publicUseAllowed: true,
      captionAr: 'متطوعو الحصاد',
    })

    // القاعدة تحرس ما لا يجوز أن يخطئ فيه كود: نشرٌ بلا موافقة يُرفض فيها.
    await expect(
      db
        .update(attachments)
        .set({ peopleConsent: false })
        .where(eq(attachments.id, withPeople)),
    ).rejects.toThrow()

    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}) as never)

    await request(app)
      .delete(adminField(stage.initiativeId, `/photos/${landscape}`))
      .set('authorization', bearer(stage.director))
      .expect(204)

    expect(send).toHaveBeenCalledTimes(1)

    const remaining = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.groupId, groupId)))

    expect(remaining.map((row) => row.id)).toEqual([withPeople])

    // صورة من مبادرة أخرى لا تُطال من هذه.
    const program = await programIdBySlug('tree-planting')
    const other = await createInitiative(stage.director, {
      programId: program.id,
      nameAr: 'حملة لا تملك الصورة',
    })

    await request(app)
      .patch(adminField(other['id'], `/photos/${withPeople}`))
      .set('authorization', bearer(stage.director))
      .send({ publicUseAllowed: false })
      .expect(404)
  })
})
