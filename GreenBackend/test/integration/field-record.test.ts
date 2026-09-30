import { and, eq, inArray, isNull } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import {
  attendance,
  participantCertificates,
} from '../../src/db/schema/field.js'
import { bearer } from '../helpers/auth.js'
import { closeTestDatabase, ensureTestDatabase } from '../helpers/database.js'
import {
  type FieldStage,
  addPeople,
  adminField,
  bootstrapField,
  createGroup,
  fieldPost,
  getHome,
  newClientId,
} from '../helpers/field.js'
import {
  addSite,
  createInitiative,
  programIdBySlug,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

type Participation = {
  initiativeId: string
  initiativeNameAr: string
  days: number
  hours: number | null
  firstDay: string | null
  lastDay: string | null
  sites: string[]
  certificate: { code: string | null; canIssue: boolean }
}

type Record_ = {
  totals: { initiatives: number; days: number; hours: number | null }
  participations: Participation[]
}

type Certificate = {
  code: string
  verifyUrl: string
  fullNameAr: string
  initiativeNameAr: string
  programNameAr: string
  days: number
  hours: number | null
  signer: { nameAr: string; titleAr: string | null } | null
}

const tokenOf = (url: string) => url.slice(url.indexOf('#') + 1)
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString()

describe.runIf(ready)('participant record and certificate', () => {
  let stage: FieldStage
  let morning: string
  let evening: string
  let heba: { participantId: string; token: string }
  let samer: { participantId: string; token: string }

  const recordOf = async (token: string) =>
    (
      await request(app)
        .get('/api/field/me/record')
        .set('authorization', bearer(token))
        .expect(200)
    ).body as Record_

  const certificate = (token: string) =>
    request(app)
      .post('/api/field/me/certificate')
      .set('authorization', bearer(token))

  const verify = (code: string) =>
    request(app).get(`/api/public/certificates/${code}`)

  const settings = (body: Record<string, unknown>) =>
    request(app)
      .put(adminField(stage.initiativeId, '/settings'))
      .set('authorization', bearer(stage.director))
      .send({ feedbackFormId: null, ...body })

  const attend = (
    groupId: string,
    participantId: string,
    checkedInAt?: string,
  ) =>
    fieldPost(stage.lead.token, `/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId,
      ...(checkedInAt ? { checkedInAt } : {}),
    })

  beforeAll(async () => {
    stage = await bootstrapField()

    morning = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الصباح',
        leadUserId: stage.lead.userId,
        hoursPerDay: 4,
      })
    ).id
    evening = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة المساء',
        leadUserId: stage.lead.userId,
      })
    ).id

    const { members } = await addPeople(
      stage.director,
      stage.initiativeId,
      morning,
      [
        { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
        { fullNameAr: 'سامر عيسى', phone: '0944 222 333' },
      ],
    )

    // القائمة تعود مرتّبة بالاسم، فالعضو يُلتقط باسمه لا بموضعه.
    await request(app)
      .post(adminField(stage.initiativeId, `/groups/${evening}/members`))
      .set('authorization', bearer(stage.director))
      .send({
        participantIds: [
          members.find((row) => row.fullNameAr === 'هبة الأحمد')!.participantId,
        ],
      })
      .expect(200)

    const issued = await request(app)
      .post(adminField(stage.initiativeId, '/links'))
      .set('authorization', bearer(stage.director))
      .send({ groupId: morning })
      .expect(200)

    const linkOf = (fullNameAr: string) => {
      const member = members.find((row) => row.fullNameAr === fullNameAr)!
      const link = (
        issued.body.links as Array<{ participantId: string; url: string }>
      ).find((row) => row.participantId === member.participantId)!

      return { participantId: member.participantId, token: tokenOf(link.url) }
    }

    heba = linkOf('هبة الأحمد')
    samer = linkOf('سامر عيسى')
  })

  describe('hours of a group day', () => {
    it('are kept in half hours and cleared with null', async () => {
      const patch = (hoursPerDay: unknown) =>
        request(app)
          .patch(adminField(stage.initiativeId, `/groups/${evening}`))
          .set('authorization', bearer(stage.director))
          .send({ hoursPerDay })

      await patch(0.3).expect(422)
      await patch(25).expect(422)
      await patch(0).expect(422)

      const set = await patch(2.5).expect(200)
      const group = (
        set.body.groups as Array<{ id: string; hoursPerDay: number | null }>
      ).find((row) => row.id === evening)!

      expect(group.hoursPerDay).toBe(2.5)

      const cleared = await patch(null).expect(200)

      expect(
        (
          cleared.body.groups as Array<{ id: string; hoursPerDay: number | null }>
        ).find((row) => row.id === evening)!.hoursPerDay,
      ).toBeNull()
    })
  })

  describe('the record', () => {
    it('is empty for someone who was invited and never came', async () => {
      const record = await recordOf(samer.token)

      expect(record.totals).toEqual({ initiatives: 0, days: 0, hours: null })
      expect(record.participations).toEqual([])
    })

    it('counts days attended and the hours of their groups', async () => {
      await attend(morning, heba.participantId, daysAgo(1)).expect(200)
      await attend(morning, heba.participantId).expect(200)

      const record = await recordOf(heba.token)

      expect(record.totals).toEqual({ initiatives: 1, days: 2, hours: 8 })

      const [participation] = record.participations

      expect(participation).toMatchObject({
        initiativeId: stage.initiativeId,
        initiativeNameAr: 'حملة الميدان التجريبية',
        days: 2,
        hours: 8,
        sites: ['حديقة تشرين'],
      })
      expect(participation!.firstDay! < participation!.lastDay!).toBe(true)
    })

    /**
     * حضر صباحًا ومساءً في اليوم نفسه: يوم واحد من عمره، وساعات المجموعتين
     * معًا. والمساء بلا ساعات محدَّدة فلا يزيد شيئًا.
     */
    it('counts a day once when he worked in two groups on it', async () => {
      await attend(evening, heba.participantId).expect(200)

      expect((await recordOf(heba.token)).totals).toEqual({
        initiatives: 1,
        days: 2,
        hours: 8,
      })

      await request(app)
        .patch(adminField(stage.initiativeId, `/groups/${evening}`))
        .set('authorization', bearer(stage.director))
        .send({ hoursPerDay: 2.5 })
        .expect(200)

      expect((await recordOf(heba.token)).totals).toEqual({
        initiatives: 1,
        days: 2,
        hours: 10.5,
      })
    })

    it('drops a day whose check-in was undone', async () => {
      const extra = await attend(morning, heba.participantId, daysAgo(3)).expect(
        200,
      )

      expect((await recordOf(heba.token)).totals.days).toBe(3)

      await fieldPost(stage.lead.token, `/groups/${morning}/attendance/undo`, {
        attendanceId: extra.body.id,
      }).expect(200)

      expect((await recordOf(heba.token)).totals).toEqual({
        initiatives: 1,
        days: 2,
        hours: 10.5,
      })
    })

    it('spans campaigns, newest first', async () => {
      const program = await programIdBySlug('tree-planting')
      const second = await createInitiative(stage.director, {
        programId: program.id,
        nameAr: 'حملة الربيع',
        targetRollup: 'NONE',
      })
      const secondId = second['id'] as string
      const site = await addSite(stage.director, secondId, {
        nameAr: 'مدرسة الأمل',
      })

      await request(app)
        .post(`/api/admin/initiatives/${secondId}/launch`)
        .set('authorization', bearer(stage.director))
        .expect(200)

      const group = await createGroup(stage.director, secondId, {
        siteId: site.id,
        nameAr: 'مجموعة المدرسة',
        leadUserId: stage.lead.userId,
        hoursPerDay: 3,
      })

      // الاسم والهاتف أنفسهما: الشخص نفسه، لا مشارك ثانٍ.
      const added = await addPeople(stage.director, secondId, group.id, [
        { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
      ])

      expect(added.members[0]!.participantId).toBe(heba.participantId)

      await attend(group.id, heba.participantId, daysAgo(5)).expect(200)

      const record = await recordOf(heba.token)

      expect(record.totals).toEqual({ initiatives: 2, days: 3, hours: 13.5 })
      expect(record.participations.map((item) => item.initiativeNameAr)).toEqual(
        ['حملة الميدان التجريبية', 'حملة الربيع'],
      )
      // رابط حملة لا يُصدر شهادة أخرى.
      expect(record.participations[1]!.certificate).toEqual({
        code: null,
        canIssue: false,
      })
    })

    it('is the volunteer’s own, by his link', async () => {
      await request(app)
        .get('/api/field/me/record')
        .set('authorization', bearer(stage.lead.token))
        .expect(403)

      await request(app).get('/api/field/me/record').expect(401)

      const text = JSON.stringify(await recordOf(heba.token))

      expect(text).not.toContain('0944')
      expect(text).not.toContain('سامر')
    })
  })

  describe('the certificate', () => {
    let code: string

    it('is not issued until the coordinator enables it', async () => {
      await certificate(heba.token).expect(409)

      const card = await getHome(heba.token).expect(200)

      expect(card.body.certificate).toEqual({ enabled: false, code: null })
      expect(
        (await recordOf(heba.token)).participations[0]!.certificate.canIssue,
      ).toBe(false)
    })

    it('cannot be enabled without a signer', async () => {
      const refused = await settings({ certificatesEnabled: true }).expect(422)

      expect(JSON.stringify(refused.body)).toContain('certificateSignerNameAr')

      const saved = await settings({
        certificatesEnabled: true,
        certificateSignerNameAr: 'مصطفى الأحمد',
        certificateSignerTitleAr: 'مدير المشروع',
      }).expect(200)

      expect(saved.body.settings).toMatchObject({
        certificatesEnabled: true,
        certificateSignerNameAr: 'مصطفى الأحمد',
        certificateSignerTitleAr: 'مدير المشروع',
        certificateCount: 0,
      })

      // حفظ استمارة التقييم وحدها لا يمحو إعدادات الشهادة.
      const again = await settings({}).expect(200)

      expect(again.body.settings).toMatchObject({
        certificatesEnabled: true,
        certificateSignerNameAr: 'مصطفى الأحمد',
      })
    })

    it('is not issued to someone who never came', async () => {
      const refused = await certificate(samer.token).expect(409)

      expect(refused.body.detail).toContain('بعد أن يُسجَّل حضورك')
    })

    it('is issued once, with what the attendance says', async () => {
      const first = await certificate(heba.token).expect(200)
      const issued = first.body as Certificate

      code = issued.code

      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/)
      expect(issued).toMatchObject({
        fullNameAr: 'هبة الأحمد',
        initiativeNameAr: 'حملة الميدان التجريبية',
        days: 2,
        hours: 10.5,
        signer: { nameAr: 'مصطفى الأحمد', titleAr: 'مدير المشروع' },
      })
      expect(issued.verifyUrl.endsWith(`/verify?code=${code}`)).toBe(true)

      const second = await certificate(heba.token).expect(200)

      expect(second.body.code).toBe(code)
      expect(
        await db
          .select()
          .from(participantCertificates)
          .where(eq(participantCertificates.participantId, heba.participantId)),
      ).toHaveLength(1)
      expect(
        await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.action, 'field.certificate_issued')),
      ).toHaveLength(1)
    })

    it('shows on the card, the record and the coordinator’s count', async () => {
      const card = await getHome(heba.token).expect(200)

      expect(card.body.certificate).toEqual({ enabled: true, code })
      expect(
        (await recordOf(heba.token)).participations[0]!.certificate,
      ).toEqual({ code, canIssue: true })

      const field = await request(app)
        .get(adminField(stage.initiativeId))
        .set('authorization', bearer(stage.director))
        .expect(200)

      expect(field.body.settings.certificateCount).toBe(1)
    })

    it('is verified by anyone who holds its code, and says no more than the paper', async () => {
      const verified = await verify(code).expect(200)

      expect(verified.body.data).toMatchObject({
        code,
        fullNameAr: 'هبة الأحمد',
        initiativeNameAr: 'حملة الميدان التجريبية',
        days: 2,
        hours: 10.5,
        signer: { nameAr: 'مصطفى الأحمد' },
      })
      expect(Object.keys(verified.body.data).sort()).toEqual(
        [
          'code',
          'days',
          'firstDay',
          'fullNameAr',
          'hours',
          'initiativeNameAr',
          'issuedAt',
          'lastDay',
          'programNameAr',
          'signer',
          'sites',
        ].sort(),
      )

      const text = JSON.stringify(verified.body)

      expect(text).not.toContain(heba.participantId)
      expect(text).not.toContain('0944')

      // الرمز يُكتب من ورقة: حروفه الصغيرة تُقرأ كبيرة.
      await verify(code.toLowerCase()).expect(200)
    })

    it('answers the same for a code that was never issued', async () => {
      const other = code.startsWith('2') ? `3${code.slice(1)}` : `2${code.slice(1)}`
      const unknown = await verify(other).expect(404)

      expect(unknown.body.detail).toBe('لا شهادة بهذا الرمز.')

      // ما ليس بشكل رمز لا يصل القاعدة.
      const malformed = await verify('not-a-code')

      expect([400, 404, 422]).toContain(malformed.status)
    })

    it('follows the attendance after it was issued', async () => {
      const extra = await attend(morning, heba.participantId, daysAgo(2)).expect(
        200,
      )

      expect((await verify(code).expect(200)).body.data).toMatchObject({
        days: 3,
        hours: 14.5,
      })

      await fieldPost(stage.lead.token, `/groups/${morning}/attendance/undo`, {
        attendanceId: extra.body.id,
      }).expect(200)

      expect((await verify(code).expect(200)).body.data).toMatchObject({
        days: 2,
        hours: 10.5,
      })
    })

    /**
     * تُرجع عن حضوره كله في الحملة: الورقة لم تعد تشهد بشيء، فصفحة التحقق
     * تقول ما يقوله السجل.
     */
    it('stops standing once nothing is left to certify', async () => {
      const rows = await db
        .select({ id: attendance.id, groupId: attendance.groupId })
        .from(attendance)
        .where(
          and(
            eq(attendance.participantId, heba.participantId),
            inArray(attendance.groupId, [morning, evening]),
            isNull(attendance.undoneAt),
          ),
        )

      expect(rows.length).toBeGreaterThan(0)

      for (const row of rows) {
        await fieldPost(
          stage.lead.token,
          `/groups/${row.groupId}/attendance/undo`,
          { attendanceId: row.id },
        ).expect(200)
      }

      await verify(code).expect(404)
      await certificate(heba.token).expect(409)

      const record = await recordOf(heba.token)

      expect(record.participations.map((item) => item.initiativeNameAr)).toEqual(
        ['حملة الربيع'],
      )
    })
  })
})
