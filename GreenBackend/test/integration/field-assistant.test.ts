import { and, desc, eq, isNull } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import {
  attendance,
  fieldGroups,
  participants,
} from '../../src/db/schema/field.js'
import { checkinCode } from '../../src/modules/field/field-checkin.service.js'
import { bearer } from '../helpers/auth.js'
import { closeTestDatabase, ensureTestDatabase } from '../helpers/database.js'
import {
  type FieldStage,
  addPeople,
  adminField,
  bootstrapField,
  createGroup,
  createLead,
  fieldPost,
  getHome,
  getSheet,
  newClientId,
} from '../helpers/field.js'
import {
  addSite,
  createInitiative,
  metricIdBySlug,
  programIdBySlug,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

type Person = { memberId: string; participantId: string; token: string }

type SheetMember = {
  participantId: string
  fullNameAr: string
  phone: string | null
  attendance: { id: string; method: string } | null
}

type Sheet = {
  permissions: { canApproveTasks: boolean; attendanceOnly: boolean }
  checkin: { secret: string; periodSeconds: number; digits: number }
  members: SheetMember[]
  tasks: unknown[]
  targets: unknown[]
  photos: unknown[]
  announcements: unknown[]
}

type Membership = { group: { id: string }; attendedOn: string[] }

const tokenOf = (url: string) => url.slice(url.indexOf('#') + 1)

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

describe.runIf(ready)('assistant lead and self check-in', () => {
  let stage: FieldStage
  let pines: string
  let olives: string
  let heba: Person
  let samer: Person
  let lina: Person
  let reem: Person

  async function enroll(
    groupId: string,
    people: Array<{ fullNameAr: string; phone?: string }>,
  ) {
    const { members } = await addPeople(
      stage.director,
      stage.initiativeId,
      groupId,
      people,
    )

    const issued = await request(app)
      .post(adminField(stage.initiativeId, '/links'))
      .set('authorization', bearer(stage.director))
      .send({ groupId })
      .expect(200)

    const links = issued.body.links as Array<{
      participantId: string
      url: string
    }>

    return (fullNameAr: string): Person => {
      const member = members.find((row) => row.fullNameAr === fullNameAr)!

      return {
        memberId: member.id,
        participantId: member.participantId,
        token: tokenOf(
          links.find((link) => link.participantId === member.participantId)!
            .url,
        ),
      }
    }
  }

  const promote = (groupId: string, person: Person) =>
    request(app)
      .patch(
        adminField(
          stage.initiativeId,
          `/groups/${groupId}/members/${person.memberId}`,
        ),
      )
      .set('authorization', bearer(stage.director))
      .send({ role: 'ASSISTANT' })
      .expect(200)

  beforeAll(async () => {
    stage = await bootstrapField()

    pines = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الصنوبر',
        leadUserId: stage.lead.userId,
      })
    ).id
    olives = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الزيتون',
      })
    ).id

    const inPines = await enroll(pines, [
      { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
      { fullNameAr: 'سامر عيسى', phone: '0944 222 333' },
      { fullNameAr: 'لينا حداد', phone: '0944 555 666' },
    ])
    const inOlives = await enroll(olives, [
      { fullNameAr: 'ريم العلي', phone: '0944 777 888' },
    ])

    heba = inPines('هبة الأحمد')
    samer = inPines('سامر عيسى')
    lina = inPines('لينا حداد')
    reem = inOlives('ريم العلي')

    await promote(pines, heba)
    await promote(olives, reem)
  })

  beforeEach(async () => {
    await db.delete(attendance)
  })

  const active = (participantId: string) =>
    db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.participantId, participantId),
          isNull(attendance.undoneAt),
        ),
      )

  describe('the assistant', () => {
    it('opens the sheet of the group she assists, as an attendance sheet', async () => {
      const response = await getSheet(heba.token, pines).expect(200)
      const sheet = response.body as Sheet

      expect(sheet.permissions).toEqual({
        canApproveTasks: false,
        attendanceOnly: true,
      })
      expect(sheet.members.map((member) => member.fullNameAr).sort()).toEqual(
        ['سامر عيسى', 'لينا حداد', 'هبة الأحمد'].sort(),
      )
      expect(sheet.tasks).toEqual([])
      expect(sheet.targets).toEqual([])
      expect(sheet.photos).toEqual([])

      // ما لا يُعرض لا يُرسَل: الهواتف ليست في الجواب، لا مخفيّة في الواجهة.
      expect(sheet.members.every((member) => member.phone === null)).toBe(true)
      expect(JSON.stringify(response.body)).not.toContain('0944')
    })

    it('shares the check-in secret with the lead of her group', async () => {
      const hers = (await getSheet(heba.token, pines).expect(200)).body as Sheet
      const his = (await getSheet(stage.lead.token, pines).expect(200))
        .body as Sheet

      expect(hers.checkin).toEqual({
        secret: expect.stringMatching(/^[0-9a-f]{40}$/),
        periodSeconds: 60,
        digits: 6,
      })
      expect(his.checkin.secret).toBe(hers.checkin.secret)

      // القائد يبقى على ورقته كاملة.
      expect(his.permissions.attendanceOnly).toBe(false)
      expect(his.members.some((member) => member.phone !== null)).toBe(true)
    })

    it('is the only volunteer who opens it', async () => {
      // عضو عادي في المجموعة نفسها.
      await getSheet(samer.token, pines).expect(404)
      // مساعدة في مجموعة أخرى.
      await getSheet(reem.token, pines).expect(404)
      await getSheet(heba.token, olives).expect(404)
    })

    it('stops opening it once she is a member again', async () => {
      await request(app)
        .patch(
          adminField(
            stage.initiativeId,
            `/groups/${olives}/members/${reem.memberId}`,
          ),
        )
        .set('authorization', bearer(stage.director))
        .send({ role: 'MEMBER' })
        .expect(200)

      await getSheet(reem.token, olives).expect(404)

      await promote(olives, reem)
      await getSheet(reem.token, olives).expect(200)
    })

    it('records attendance in her own name', async () => {
      const recorded = await fieldPost(heba.token, `/groups/${pines}/attendance`, {
        clientId: newClientId(),
        participantId: samer.participantId,
      }).expect(200)

      expect(recorded.body).toMatchObject({
        participantId: samer.participantId,
        method: 'LEAD_TAP',
      })

      const [row] = await active(samer.participantId)

      expect(row).toMatchObject({
        checkedInById: null,
        checkedInByParticipantId: heba.participantId,
      })

      const [entry] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'field.attendance_recorded'))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)

      expect(entry!.actorUserId).toBeNull()
      expect(entry!.metadata).toMatchObject({
        byAssistantParticipantId: heba.participantId,
      })
    })

    it('adds whoever came unregistered', async () => {
      await fieldPost(heba.token, `/groups/${pines}/attendance`, {
        clientId: newClientId(),
        walkIn: { fullNameAr: 'ضيف الصباح', phone: '0955 000 111' },
      }).expect(200)

      const [guest] = await db
        .select()
        .from(participants)
        .where(eq(participants.fullNameAr, 'ضيف الصباح'))

      expect(guest).toMatchObject({ createdById: null })
      expect(await active(guest!.id)).toHaveLength(1)
    })

    it('undoes a check-in, and her name is on the undo', async () => {
      const clientId = newClientId()

      await fieldPost(heba.token, `/groups/${pines}/attendance`, {
        clientId,
        participantId: lina.participantId,
      }).expect(200)

      await fieldPost(heba.token, `/groups/${pines}/attendance/undo`, {
        attendanceClientId: clientId,
      }).expect(200)

      expect(await active(lina.participantId)).toHaveLength(0)

      const [row] = await db
        .select()
        .from(attendance)
        .where(eq(attendance.clientId, clientId))

      expect(row).toMatchObject({
        undoneById: null,
        undoneByParticipantId: heba.participantId,
      })
    })

    it('records nothing but attendance', async () => {
      const trees = await metricIdBySlug('trees-planted')

      await fieldPost(heba.token, `/groups/${pines}/impact`, {
        clientId: newClientId(),
        metricId: trees,
        value: 5,
      }).expect(403)

      await fieldPost(heba.token, `/groups/${pines}/photos/sign`, {
        contentType: 'image/jpeg',
        size: 1000,
      }).expect(403)

      await request(app)
        .patch(`/api/field/groups/${pines}/site`)
        .set('authorization', bearer(heba.token))
        .send({ status: 'IN_PROGRESS' })
        .expect(403)

      await fieldPost(
        heba.token,
        '/tasks/00000000-0000-4000-8000-000000000000/status',
        { groupId: pines, status: 'DONE' },
      ).expect(403)
    })

    it('cannot record on a group she does not assist', async () => {
      await fieldPost(heba.token, `/groups/${olives}/attendance`, {
        clientId: newClientId(),
        participantId: reem.participantId,
      }).expect(404)
    })
  })

  describe('self check-in', () => {
    let secret: string

    beforeAll(async () => {
      secret = ((await getSheet(stage.lead.token, pines).expect(200)).body as Sheet)
        .checkin.secret
    })

    const checkIn = (person: Person, body: Record<string, unknown>) =>
      fieldPost(person.token, '/me/checkin', {
        clientId: newClientId(),
        groupId: pines,
        ...body,
      })

    it('marks the volunteer present with the code his lead shows', async () => {
      const response = await checkIn(samer, {
        code: checkinCode(secret, new Date()),
      }).expect(200)

      const [membership] = response.body.memberships as Membership[]

      expect(response.body.kind).toBe('PARTICIPANT')
      expect(membership!.attendedOn).toEqual([response.body.day])

      const [row] = await active(samer.participantId)

      expect(row).toMatchObject({
        method: 'SELF',
        checkedInById: null,
        checkedInByParticipantId: samer.participantId,
      })
    })

    it('shows him present on the lead’s sheet, as self-registered', async () => {
      await checkIn(samer, { code: checkinCode(secret, new Date()) }).expect(200)

      const sheet = (await getSheet(stage.lead.token, pines).expect(200))
        .body as Sheet
      const row = sheet.members.find(
        (member) => member.participantId === samer.participantId,
      )!

      expect(row.attendance).toMatchObject({ method: 'SELF' })

      // القائد لا يراه عند نقطة اللقاء: يتراجع عن حضوره كأي حضور.
      await fieldPost(stage.lead.token, `/groups/${pines}/attendance/undo`, {
        attendanceId: row.attendance!.id,
      }).expect(200)

      expect(await active(samer.participantId)).toHaveLength(0)
    })

    it('refuses a wrong code and records nothing', async () => {
      const right = checkinCode(secret, new Date())
      const wrong = String((Number(right) + 1) % 1_000_000).padStart(6, '0')

      const response = await checkIn(samer, { code: wrong }).expect(422)

      expect(response.body.detail).toContain('الرمز غير صحيح')
      expect(await active(samer.participantId)).toHaveLength(0)

      await checkIn(samer, { code: '12345' }).expect(422)
      await checkIn(samer, { code: 'abcdef' }).expect(422)
    })

    it('refuses a code that was shown ten minutes ago', async () => {
      await checkIn(samer, {
        code: checkinCode(secret, minutesAgo(10)),
      }).expect(422)
    })

    /**
     * كتبه بلا شبكة قبل عشر دقائق ووصل الآن: الرمز يُفحص على وقت كتابته.
     */
    it('accepts what was typed offline at the time it was typed', async () => {
      const typedAt = minutesAgo(10)

      await checkIn(samer, {
        code: checkinCode(secret, typedAt),
        scannedAt: typedAt.toISOString(),
      }).expect(200)

      const [row] = await active(samer.participantId)

      expect(row!.checkedInAt.toISOString()).toBe(typedAt.toISOString())
    })

    it('refuses the code of another group', async () => {
      const theirs = ((await getSheet(reem.token, olives).expect(200)).body as Sheet)
        .checkin.secret

      await checkIn(samer, { code: checkinCode(theirs, new Date()) }).expect(422)
    })

    it('is only for members of the group', async () => {
      // ريم في مجموعة الزيتون، وتكتب رمز الصنوبر الصحيح.
      await checkIn(reem, { code: checkinCode(secret, new Date()) }).expect(404)

      await checkIn(samer, {
        groupId: '00000000-0000-4000-8000-000000000000',
        code: checkinCode(secret, new Date()),
      }).expect(404)
    })

    it('is for the volunteer, not for the team', async () => {
      await fieldPost(stage.lead.token, '/me/checkin', {
        clientId: newClientId(),
        groupId: pines,
        code: checkinCode(secret, new Date()),
      }).expect(403)
    })

    it('writes once however many times it is sent', async () => {
      const body = {
        clientId: newClientId(),
        groupId: pines,
        code: checkinCode(secret, new Date()),
      }

      await fieldPost(samer.token, '/me/checkin', body).expect(200)
      await fieldPost(samer.token, '/me/checkin', body).expect(200)
      // نقرة ثانية بمعرّف جديد: هو حاضر، ولا يُكتب له صف ثانٍ.
      await checkIn(samer, { code: checkinCode(secret, new Date()) }).expect(200)

      expect(await active(samer.participantId)).toHaveLength(1)
    })

    it('leaves a check-in the lead already made as it is', async () => {
      await fieldPost(stage.lead.token, `/groups/${pines}/attendance`, {
        clientId: newClientId(),
        participantId: samer.participantId,
      }).expect(200)

      await checkIn(samer, { code: checkinCode(secret, new Date()) }).expect(200)

      const rows = await active(samer.participantId)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        method: 'LEAD_TAP',
        checkedInById: stage.lead.userId,
      })
    })

    it('has no code to match before anyone opened the group sheet', async () => {
      const fresh = await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة بلا ورقة',
      })

      await request(app)
        .post(adminField(stage.initiativeId, `/groups/${fresh.id}/members`))
        .set('authorization', bearer(stage.director))
        .send({ participantIds: [samer.participantId] })
        .expect(200)

      const [row] = await db
        .select({ secret: fieldGroups.checkinSecret })
        .from(fieldGroups)
        .where(eq(fieldGroups.id, fresh.id))

      expect(row!.secret).toBeNull()

      await checkIn(samer, { groupId: fresh.id, code: '000000' }).expect(422)
    })

    it('is written to the audit log', async () => {
      await checkIn(samer, { code: checkinCode(secret, new Date()) }).expect(200)

      const [entry] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'field.self_check_in'))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)

      expect(entry).toMatchObject({ actorUserId: null, actorType: 'SYSTEM' })
      expect(entry!.metadata).toMatchObject({
        groupId: pines,
        participantId: samer.participantId,
      })
    })

    it('never shows the secret to a plain volunteer', async () => {
      const card = await getHome(samer.token).expect(200)

      expect(JSON.stringify(card.body)).not.toContain(secret)
    })
  })

  describe('a campaign that does not take entries', () => {
    it('refuses self check-in before it starts', async () => {
      const program = await programIdBySlug('tree-planting')
      const draft = await createInitiative(stage.director, {
        programId: program.id,
        nameAr: 'حملة لم تبدأ',
      })
      const site = await addSite(stage.director, draft['id'], {
        nameAr: 'موقع لم يبدأ',
      })
      const lead = await createLead('draft-lead@greencities.test', 'قائد ينتظر')
      const group = await createGroup(stage.director, draft['id'], {
        siteId: site.id,
        nameAr: 'مجموعة تنتظر',
        leadUserId: lead.userId,
      })
      const added = await addPeople(stage.director, draft['id'], group.id, [
        { fullNameAr: 'متطوع مبكر' },
      ])

      const issued = await request(app)
        .post(adminField(draft['id'], '/links'))
        .set('authorization', bearer(stage.director))
        .send({ participantIds: [added.members[0]!.participantId] })
        .expect(200)

      const token = tokenOf(issued.body.links[0].url)
      const sheet = (await getSheet(lead.token, group.id).expect(200))
        .body as Sheet

      await fieldPost(token, '/me/checkin', {
        clientId: newClientId(),
        groupId: group.id,
        code: checkinCode(sheet.checkin.secret, new Date()),
      }).expect(409)
    })
  })
})
