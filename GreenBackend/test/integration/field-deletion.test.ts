import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import {
  attendance,
  fieldGroupMembers,
  participantCertificates,
  participantDeletionRequests,
  participantLinks,
  participants,
} from '../../src/db/schema/field.js'
import { pushSubscriptions } from '../../src/db/schema/field-notify.js'
import { formSubmissions } from '../../src/db/schema/forms.js'
import { outboxJobs } from '../../src/db/schema/outbox.js'
import { bearer } from '../helpers/auth.js'
import { closeTestDatabase, ensureTestDatabase } from '../helpers/database.js'
import {
  type FieldStage,
  addPeople,
  adminField,
  bootstrapField,
  createGroup,
  createJoinForm,
  fieldPost,
  getHome,
  newClientId,
  submitAndDecide,
} from '../helpers/field.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

type DeletionRequest = {
  id: string
  status: 'PENDING' | 'DONE' | 'REJECTED'
  fullNameAr: string
  phone: string | null
  email: string | null
  decidedByNameAr: string | null
  decisionNoteAr: string | null
  participant: { id: string; anonymized: boolean }
  groupNamesAr: string[]
  attendedDays: number
  initiativeCount: number
  certificateCount: number
  submissionCount: number
}

type Holder = { participantId: string; memberId: string; token: string }

const tokenOf = (url: string) => url.slice(url.indexOf('#') + 1)

const HEBA = {
  fullNameAr: 'هبة الأحمد',
  phone: '0944 123 456',
  email: 'heba@example.test',
}

describe.runIf(ready)('data deletion request', () => {
  let stage: FieldStage
  let groupId: string
  let form: { formId: string; slug: string }
  let submissionId: string
  /** طلب ثانٍ لهبة في استمارة أخرى، بإملاء آخر وهاتف بصيغة دولية. */
  let laterSubmissionId: string
  /** أختها بهاتف أبيهما، وسميّتها بهاتف آخر: ليستا هي. */
  let sisterSubmissionId: string
  let namesakeSubmissionId: string
  let winter: { formId: string; slug: string }
  let heba: Holder
  let samer: Holder
  let certificateCode: string

  const ask = (token: string) =>
    request(app)
      .post('/api/field/me/deletion-request')
      .set('authorization', bearer(token))

  const withdraw = (token: string) =>
    request(app)
      .delete('/api/field/me/deletion-request')
      .set('authorization', bearer(token))

  const list = (token = stage.director) =>
    request(app)
      .get(adminField(stage.initiativeId, '/deletion-requests'))
      .set('authorization', bearer(token))

  const decide = (
    requestId: string,
    decision: 'approve' | 'reject',
    body?: Record<string, unknown>,
    token = stage.director,
  ) =>
    request(app)
      .post(
        adminField(
          stage.initiativeId,
          `/deletion-requests/${requestId}/${decision}`,
        ),
      )
      .set('authorization', bearer(token))
      .send(body ?? {})

  const pendingOf = async (participantId: string) => {
    const listed = await list().expect(200)

    return (listed.body.requests as DeletionRequest[]).find(
      (row) => row.participant.id === participantId && row.status === 'PENDING',
    )!
  }

  const eventsOf = (action: string) =>
    db.select().from(auditLogs).where(eq(auditLogs.action, action))

  beforeAll(async () => {
    stage = await bootstrapField()

    groupId = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الصنوبر',
        leadUserId: stage.lead.userId,
        hoursPerDay: 4,
      })
    ).id

    // هبة جاءت من استمارة، وسامر كُتب اسمه باليد.
    form = await createJoinForm(stage.director)
    submissionId = await submitAndDecide(stage.director, form, {
      full_name: HEBA.fullNameAr,
      phone: HEBA.phone,
    })

    await request(app)
      .post(adminField(stage.initiativeId, `/groups/${groupId}/members`))
      .set('authorization', bearer(stage.director))
      .send({ formId: form.formId, submissionIds: [submissionId] })
      .expect(200)

    winter = await createJoinForm(stage.director, 'winter-campaign')
    laterSubmissionId = await submitAndDecide(stage.director, winter, {
      full_name: 'هبه الاحمد',
      phone: '+963 944 123 456',
    })
    sisterSubmissionId = await submitAndDecide(stage.director, winter, {
      full_name: 'ليلى الأحمد',
      phone: HEBA.phone,
    })
    namesakeSubmissionId = await submitAndDecide(stage.director, winter, {
      full_name: HEBA.fullNameAr,
      phone: '0955 000 111',
    })

    // الاسم والهاتف أنفسهما: يُكمَل بريدها ولا تصير مشاركتين.
    const { members, summary } = await addPeople(
      stage.director,
      stage.initiativeId,
      groupId,
      [HEBA, { fullNameAr: 'سامر عيسى', phone: '0944 222 333' }],
    )

    expect(summary.newParticipants).toBe(1)

    // تسميتها مساعدةً تكتب اسمها في سجل التدقيق.
    const hebaMember = members.find((row) => row.fullNameAr === HEBA.fullNameAr)!

    await request(app)
      .patch(
        adminField(
          stage.initiativeId,
          `/groups/${groupId}/members/${hebaMember.id}`,
        ),
      )
      .set('authorization', bearer(stage.director))
      .send({ role: 'ASSISTANT' })
      .expect(200)

    const issued = await request(app)
      .post(adminField(stage.initiativeId, '/links'))
      .set('authorization', bearer(stage.director))
      .send({ groupId, email: true })
      .expect(200)

    const holderOf = (fullNameAr: string): Holder => {
      const member = members.find((row) => row.fullNameAr === fullNameAr)!
      const link = (
        issued.body.links as Array<{ participantId: string; url: string }>
      ).find((row) => row.participantId === member.participantId)!

      return {
        participantId: member.participantId,
        memberId: member.id,
        token: tokenOf(link.url),
      }
    }

    heba = holderOf(HEBA.fullNameAr)
    samer = holderOf('سامر عيسى')

    await request(app)
      .put(adminField(stage.initiativeId, '/settings'))
      .set('authorization', bearer(stage.director))
      .send({
        feedbackFormId: null,
        certificatesEnabled: true,
        certificateSignerNameAr: 'مصطفى الأحمد',
      })
      .expect(200)

    await fieldPost(stage.lead.token, `/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId: heba.participantId,
    }).expect(200)

    const certificate = await request(app)
      .post('/api/field/me/certificate')
      .set('authorization', bearer(heba.token))
      .expect(200)

    certificateCode = certificate.body.code as string

    await fieldPost(heba.token, '/push/subscriptions', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/heba-phone',
      keys: {
        p256dh:
          'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    }).expect(200)
  })

  describe('asking from the card', () => {
    it('belongs to the holder of a personal link', async () => {
      await ask(stage.lead.token).expect(403)
      await withdraw(stage.lead.token).expect(403)
      await request(app).post('/api/field/me/deletion-request').expect(401)
    })

    it('starts with no request on the card', async () => {
      const card = await getHome(samer.token).expect(200)

      expect(card.body.deletionRequest).toBeNull()
    })

    it('opens one pending request however often it is sent', async () => {
      const first = await ask(samer.token).expect(200)

      expect(first.body.kind).toBe('PARTICIPANT')
      expect(first.body.deletionRequest).toMatchObject({
        status: 'PENDING',
        decidedAt: null,
        noteAr: null,
      })

      const second = await ask(samer.token).expect(200)

      expect(second.body.deletionRequest.requestedAt).toBe(
        first.body.deletionRequest.requestedAt,
      )

      const rows = await db
        .select({ id: participantDeletionRequests.id })
        .from(participantDeletionRequests)
        .where(eq(participantDeletionRequests.participantId, samer.participantId))

      expect(rows).toHaveLength(1)
      expect(await eventsOf('field.deletion_requested')).toHaveLength(1)
    })

    it('deletes nothing by itself', async () => {
      const [row] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, samer.participantId))

      expect(row).toMatchObject({
        fullNameAr: 'سامر عيسى',
        phone: '0944 222 333',
        anonymizedAt: null,
      })

      await getHome(samer.token).expect(200)
    })

    it('is withdrawn by its owner, and withdrawing twice is fine', async () => {
      const withdrawn = await withdraw(samer.token).expect(200)

      expect(withdrawn.body.deletionRequest).toBeNull()

      await withdraw(samer.token).expect(200)

      expect(await eventsOf('field.deletion_withdrawn')).toHaveLength(1)
      expect((await list().expect(200)).body.requests).toEqual([])
    })
  })

  describe('the coordinator list', () => {
    it('needs the capability to manage the field', async () => {
      await list(stage.lead.token).expect(403)
      await decide(newClientId(), 'approve', undefined, stage.lead.token).expect(
        403,
      )
    })

    it('shows who asks and what deleting would touch', async () => {
      await ask(heba.token).expect(200)
      await ask(samer.token).expect(200)

      const listed = await list().expect(200)
      const requests = listed.body.requests as DeletionRequest[]

      expect(listed.body.pendingCount).toBe(2)
      expect(
        requests.find((row) => row.participant.id === heba.participantId),
      ).toMatchObject({
        status: 'PENDING',
        fullNameAr: HEBA.fullNameAr,
        phone: HEBA.phone,
        email: HEBA.email,
        participant: { anonymized: false },
        groupNamesAr: ['مجموعة الصنوبر'],
        attendedDays: 1,
        initiativeCount: 1,
        certificateCount: 1,
        // طلبها الذي جاءت منه، وطلبها الثاني في الاستمارة الأخرى.
        submissionCount: 2,
      })
      expect(
        requests.find((row) => row.participant.id === samer.participantId),
      ).toMatchObject({
        attendedDays: 0,
        certificateCount: 0,
        submissionCount: 0,
      })
    })
  })

  describe('rejecting', () => {
    it('needs a note the volunteer can read', async () => {
      const pending = await pendingOf(samer.participantId)

      await decide(pending.id, 'reject').expect(422)
      await decide(pending.id, 'reject', { noteAr: '  ' }).expect(422)
    })

    it('tells the volunteer why, and leaves the data as it was', async () => {
      const pending = await pendingOf(samer.participantId)
      const noteAr = 'وصل الطلب من هاتف غير هاتفك. اتصل بالمنسّق لنتأكد.'

      const rejected = await decide(pending.id, 'reject', { noteAr }).expect(200)

      expect(
        (rejected.body.requests as DeletionRequest[]).find(
          (row) => row.id === pending.id,
        ),
      ).toMatchObject({
        status: 'REJECTED',
        decisionNoteAr: noteAr,
        decidedByNameAr: expect.any(String),
        fullNameAr: 'سامر عيسى',
      })
      expect(rejected.body.pendingCount).toBe(1)

      const card = await getHome(samer.token).expect(200)

      expect(card.body.deletionRequest).toMatchObject({
        status: 'REJECTED',
        noteAr,
      })
      expect(card.body.deletionRequest.decidedAt).toBeTypeOf('string')

      // قُرّر مرة: لا يُقرَّر ثانية.
      await decide(pending.id, 'reject', { noteAr }).expect(409)
      await decide(pending.id, 'approve').expect(409)
    })

    it('lets the volunteer ask again', async () => {
      const again = await ask(samer.token).expect(200)

      expect(again.body.deletionRequest).toMatchObject({ status: 'PENDING' })

      await withdraw(samer.token).expect(200)

      // بعد التراجع يعود آخر ما قُرّر: الرفض بملاحظته.
      const card = await getHome(samer.token).expect(200)

      expect(card.body.deletionRequest).toMatchObject({ status: 'REJECTED' })
    })
  })

  describe('approving', () => {
    let requestId: string

    it('is refused for a request that is not of this initiative', async () => {
      await decide(newClientId(), 'approve').expect(404)
    })

    it('removes the person and keeps the attendance', async () => {
      requestId = (await pendingOf(heba.participantId)).id

      const before = await db
        .select({ id: outboxJobs.id })
        .from(outboxJobs)
        .where(eq(outboxJobs.recipient, HEBA.email))

      expect(before.length).toBeGreaterThan(0)

      const approved = await decide(requestId, 'approve').expect(200)

      expect(approved.body.pendingCount).toBe(0)
      expect(
        (approved.body.requests as DeletionRequest[]).find(
          (row) => row.id === requestId,
        ),
      ).toMatchObject({
        status: 'DONE',
        fullNameAr: 'مشارك محذوف',
        phone: null,
        email: null,
        participant: { id: heba.participantId, anonymized: true },
        groupNamesAr: [],
        attendedDays: 1,
        certificateCount: 0,
        submissionCount: 0,
        decidedByNameAr: expect.any(String),
      })

      const [person] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, heba.participantId))

      expect(person).toMatchObject({
        fullNameAr: 'مشارك محذوف',
        nameKey: `deleted:${heba.participantId}`,
        phone: null,
        phoneKey: null,
        email: null,
        notesAr: null,
        sourceSubmissionId: null,
      })
      expect(person!.anonymizedAt).toBeInstanceOf(Date)

      expect(
        await db
          .select({ id: fieldGroupMembers.id })
          .from(fieldGroupMembers)
          .where(eq(fieldGroupMembers.participantId, heba.participantId)),
      ).toEqual([])

      expect(
        await db
          .select({ id: participantLinks.id })
          .from(participantLinks)
          .where(
            and(
              eq(participantLinks.participantId, heba.participantId),
              isNull(participantLinks.revokedAt),
            ),
          ),
      ).toEqual([])

      expect(
        await db
          .select({ id: participantCertificates.id })
          .from(participantCertificates)
          .where(eq(participantCertificates.participantId, heba.participantId)),
      ).toEqual([])

      expect(
        await db
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.participantId, heba.participantId)),
      ).toEqual([])

      expect(
        await db
          .select({ id: outboxJobs.id })
          .from(outboxJobs)
          .where(eq(outboxJobs.recipient, HEBA.email)),
      ).toEqual([])

      // الحضور يبقى: منه يُحسب كم حضر.
      expect(
        await db
          .select({ id: attendance.id })
          .from(attendance)
          .where(
            and(
              eq(attendance.participantId, heba.participantId),
              isNull(attendance.undoneAt),
            ),
          ),
      ).toHaveLength(1)
    })

    it('closes the card and the certificate, and says why', async () => {
      const card = await getHome(heba.token).expect(401)

      // صاحب الرابط يُقال له إن طلبه نُفّذ، لا «اطلب رابطًا جديدًا».
      expect(card.body.title).toBe('PARTICIPANT_DELETED')
      expect(card.body.detail).toContain('حُذفت بيانات')

      const record = await request(app)
        .get('/api/field/me/record')
        .set('authorization', bearer(heba.token))
        .expect(401)

      expect(record.body.title).toBe('PARTICIPANT_DELETED')

      const reopened = await request(app)
        .post('/api/field/links/redeem')
        .send({ token: heba.token })
        .expect(401)

      expect(reopened.body.title).toBe('PARTICIPANT_DELETED')

      await request(app)
        .get(`/api/public/certificates/${certificateCode}`)
        .expect(404)
    })

    it('empties every form submission of the person', async () => {
      const emptied = await db
        .select()
        .from(formSubmissions)
        .where(inArray(formSubmissions.id, [submissionId, laterSubmissionId]))

      expect(emptied).toHaveLength(2)

      for (const submission of emptied) {
        expect(submission).toMatchObject({
          status: 'ACCEPTED',
          answers: {},
          applicantNameAr: null,
          applicantEmail: null,
          applicantPhone: null,
          sourceIpHash: null,
        })
        expect(submission.redactedAt).toBeInstanceOf(Date)
      }

      const listed = await request(app)
        .get(`/api/admin/forms/${form.formId}/submissions`)
        .set('authorization', bearer(stage.director))
        .expect(200)

      const row = (
        listed.body.data as Array<{
          id: string
          applicantNameAr: string | null
          redactedAt: string | null
          answers: Record<string, unknown>
        }>
      ).find((item) => item.id === submissionId)!

      expect(row.applicantNameAr).toBeNull()
      expect(row.answers).toEqual({})
      expect(row.redactedAt).toBeTypeOf('string')

      const detail = await request(app)
        .get(`/api/admin/forms/${form.formId}/submissions/${submissionId}`)
        .set('authorization', bearer(stage.director))
        .expect(200)

      expect(detail.body.data).toMatchObject({
        applicantNameAr: null,
        answers: [],
      })

      // لا يُعرض مقبولًا يُوزَّع على مجموعة.
      const applicants = await request(app)
        .get(adminField(stage.initiativeId, `/applicants?formId=${form.formId}`))
        .set('authorization', bearer(stage.director))
        .expect(200)

      expect(applicants.body.data).toEqual([])

      await request(app)
        .post(adminField(stage.initiativeId, `/groups/${groupId}/members`))
        .set('authorization', bearer(stage.director))
        .send({ formId: form.formId, submissionIds: [submissionId] })
        .expect(422)
    })

    it('leaves the submissions of other people as they were', async () => {
      const kept = await db
        .select({
          id: formSubmissions.id,
          applicantNameAr: formSubmissions.applicantNameAr,
          applicantPhone: formSubmissions.applicantPhone,
          redactedAt: formSubmissions.redactedAt,
        })
        .from(formSubmissions)
        .where(
          inArray(formSubmissions.id, [sisterSubmissionId, namesakeSubmissionId]),
        )

      expect(kept.find((row) => row.id === sisterSubmissionId)).toMatchObject({
        applicantNameAr: 'ليلى الأحمد',
        applicantPhone: HEBA.phone,
        redactedAt: null,
      })
      expect(kept.find((row) => row.id === namesakeSubmissionId)).toMatchObject({
        applicantNameAr: HEBA.fullNameAr,
        applicantPhone: '0955 000 111',
        redactedAt: null,
      })

      const applicants = await request(app)
        .get(adminField(stage.initiativeId, `/applicants?formId=${winter.formId}`))
        .set('authorization', bearer(stage.director))
        .expect(200)

      expect(
        (applicants.body.data as Array<{ submissionId: string }>)
          .map((row) => row.submissionId)
          .sort(),
      ).toEqual([sisterSubmissionId, namesakeSubmissionId].sort())
    })

    it('takes the name out of the audit log and keeps the events', async () => {
      const named = await db
        .select({ id: auditLogs.id, entityId: auditLogs.entityId })
        .from(auditLogs)
        .where(
          sql`${auditLogs.entityLabel} like ${'%هبة%'}
            or ${auditLogs.entityLabel} like ${'%هبه%'}
            or ${auditLogs.summaryAr} like ${'%هبة%'}
            or ${auditLogs.metadata}::text like ${'%هبة%'}
            or ${auditLogs.metadata}::text like ${'%0944 123 456%'}`,
        )

      // ما بقي باسم «هبة» لسميّتها: طلبها لم يُمسّ، وحدث قبوله باسمها.
      expect(named.map((row) => row.entityId)).toEqual([namesakeSubmissionId])

      const [renamed] = await db
        .select({ entityLabel: auditLogs.entityLabel })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'field.member_updated'),
            eq(auditLogs.entityId, heba.memberId),
          ),
        )

      expect(renamed?.entityLabel).toBe('مشارك محذوف')

      // ما فعلته من بطاقتها يبقى حدثًا، بلا عنوان هاتفها.
      const hers = await db
        .select({
          action: auditLogs.action,
          ipAddress: auditLogs.ipAddress,
          userAgent: auditLogs.userAgent,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorType, 'SYSTEM'),
            sql`${auditLogs.metadata}->>'participantId' = ${heba.participantId}`,
          ),
        )

      expect(hers.map((row) => row.action).sort()).toEqual([
        'field.certificate_issued',
        'field.deletion_requested',
      ])
      expect(hers.every((row) => row.ipAddress === null)).toBe(true)
      expect(hers.every((row) => row.userAgent === null)).toBe(true)

      // وما فعله المنسّق يبقى بعنوانه: هو من يُسأل عمّا نُفّذ.
      const [done] = await eventsOf('field.participant_anonymized')

      expect(done).toMatchObject({
        severity: 'WARNING',
        entityId: requestId,
        metadata: {
          participantId: heba.participantId,
          memberships: 1,
          linksRevoked: 1,
          certificates: 1,
          submissionsRedacted: 2,
        },
      })
      expect(done!.actorUserId).toBeTypeOf('string')
      expect(JSON.stringify(done)).not.toContain('هبة')
    })

    it('cannot be decided twice', async () => {
      await decide(requestId, 'approve').expect(409)
      await decide(requestId, 'reject', { noteAr: 'بعد التنفيذ' }).expect(409)
    })

    it('keeps the group numbers', async () => {
      const field = await request(app)
        .get(adminField(stage.initiativeId))
        .set('authorization', bearer(stage.director))
        .expect(200)

      const group = (
        field.body.groups as Array<{
          id: string
          memberCount: number
          attendedCount: number
        }>
      ).find((row) => row.id === groupId)!

      expect(group).toMatchObject({ memberCount: 1, attendedCount: 1 })
      expect(field.body.settings.certificateCount).toBe(0)
    })

    it('is not found in the registry, and cannot be added back', async () => {
      for (const q of ['هبة', '0944123456', 'deleted', 'محذوف']) {
        const found = await request(app)
          .get(
            adminField(
              stage.initiativeId,
              `/participants?q=${encodeURIComponent(q)}`,
            ),
          )
          .set('authorization', bearer(stage.director))
          .expect(200)

        expect(
          (found.body.data as Array<{ id: string }>).map((row) => row.id),
        ).not.toContain(heba.participantId)
      }

      await request(app)
        .post(adminField(stage.initiativeId, `/groups/${groupId}/members`))
        .set('authorization', bearer(stage.director))
        .send({ participantIds: [heba.participantId] })
        .expect(422)
    })

    it('treats the same person joining again as someone new', async () => {
      const { members, summary } = await addPeople(
        stage.director,
        stage.initiativeId,
        groupId,
        [{ fullNameAr: HEBA.fullNameAr, phone: HEBA.phone }],
      )

      expect(summary).toMatchObject({ added: 1, newParticipants: 1 })

      const returned = members.find((row) => row.fullNameAr === HEBA.fullNameAr)!

      expect(returned.participantId).not.toBe(heba.participantId)
      expect(returned.attendance).toBeNull()

      const rows = await db
        .select({ id: participants.id, anonymizedAt: participants.anonymizedAt })
        .from(participants)
        .where(
          inArray(participants.id, [heba.participantId, returned.participantId]),
        )

      expect(
        rows.find((row) => row.id === returned.participantId)!.anonymizedAt,
      ).toBeNull()
    })

    it('leaves the other volunteer untouched', async () => {
      const card = await getHome(samer.token).expect(200)

      expect(card.body.participant.fullNameAr).toBe('سامر عيسى')
      expect(card.body.memberships).toHaveLength(1)
    })

    it('answers a revoked link of someone not deleted as any dead link', async () => {
      await request(app)
        .post(adminField(stage.initiativeId, '/links/revoke'))
        .set('authorization', bearer(stage.director))
        .send({ participantIds: [samer.participantId] })
        .expect(200)

      const card = await getHome(samer.token).expect(401)

      expect(card.body.title).toBe('UNAUTHORIZED')
      expect(card.body.detail).not.toContain('حُذفت')

      // رمز لم يكن رابطًا قط: الجواب نفسه.
      const unknown = await getHome(`plk_${'z'.repeat(43)}`).expect(401)

      expect(unknown.body.title).toBe('UNAUTHORIZED')
      expect(unknown.body.detail).toBe(card.body.detail)
    })
  })
})
