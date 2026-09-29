import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import { attachments, participantLinks } from '../../src/db/schema/field.js'
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
  getSheet,
  newClientId,
} from '../helpers/field.js'
import {
  addSite,
  metricIdBySlug,
  recordVerifiedImpact,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

type IssuedLink = {
  participantId: string
  fullNameAr: string
  url: string
  messageAr: string
  whatsappUrl: string | null
  emailed: boolean
}

type Membership = {
  memberId: string
  rsvp: string
  group: {
    id: string
    nameAr: string
    leadNameAr: string | null
    contactPhone: string | null
  }
  site: { id: string; nameAr: string; lat: number | null }
  attendedOn: string[]
  impact: Array<{ metricNameAr: string; value: number }>
  photos: Array<{ id: string; url: string }>
}

/** الرمز من جزء العنوان، كما يقرؤه التطبيق من الرابط. */
const tokenOf = (url: string) => url.slice(url.indexOf('#') + 1)

const issue = (
  token: string,
  initiativeId: string,
  body: Record<string, unknown>,
) =>
  request(app)
    .post(adminField(initiativeId, '/links'))
    .set('authorization', bearer(token))
    .send(body)

const card = (linkToken: string) => getHome(linkToken)

describe.runIf(ready)('personal links', () => {
  let stage: FieldStage
  let groupId: string
  let members: Awaited<ReturnType<typeof addPeople>>['members']

  beforeAll(async () => {
    stage = await bootstrapField()
    groupId = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الروابط',
        leadUserId: stage.lead.userId,
        contactPhone: '0944 000 111',
        meetsAt: new Date(Date.now() + 86_400_000).toISOString(),
        meetingPointAr: 'البوابة الشرقية',
      })
    ).id

    members = (
      await addPeople(stage.director, stage.initiativeId, groupId, [
        { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
        { fullNameAr: 'سامر عيسى', phone: '+90 555 123 4567' },
        { fullNameAr: 'لينا حداد', email: 'lina@example.test' },
      ])
    ).members
  })

  const memberNamed = (name: string) => {
    const found = members.find((member) => member.fullNameAr === name)

    if (!found) throw new Error(`Member "${name}" is missing.`)

    return found
  }

  it('issues one link per member, shown once and stored hashed', async () => {
    const response = await issue(stage.director, stage.initiativeId, {
      groupId,
    }).expect(200)

    const links = response.body.links as IssuedLink[]

    expect(links).toHaveLength(3)

    for (const link of links) {
      expect(link.url).toMatch(/\/app\/link#plk_[A-Za-z0-9_-]{40,}$/)
      expect(link.messageAr).toContain(link.url)
      expect(link.messageAr).toContain(link.fullNameAr)
    }

    const stored = await db
      .select({ tokenHash: participantLinks.tokenHash })
      .from(participantLinks)
      .where(eq(participantLinks.initiativeId, stage.initiativeId))

    expect(stored).toHaveLength(3)

    // لا رمز في القاعدة: من قرأها لا يفتح بطاقة أحد.
    for (const row of stored) {
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(links.some((link) => link.url.includes(row.tokenHash))).toBe(false)
    }
  })

  it('builds a WhatsApp link only for numbers it can dial', async () => {
    const response = await issue(stage.director, stage.initiativeId, {
      groupId,
    }).expect(200)

    const links = response.body.links as IssuedLink[]
    const byName = (name: string) =>
      links.find((link) => link.fullNameAr === name)!

    expect(byName('هبة الأحمد').whatsappUrl).toMatch(
      /^https:\/\/wa\.me\/963944123456\?text=/,
    )
    expect(byName('سامر عيسى').whatsappUrl).toMatch(
      /^https:\/\/wa\.me\/905551234567\?text=/,
    )
    expect(byName('لينا حداد').whatsappUrl).toBeNull()
  })

  it('opens the card with the link and nothing else', async () => {
    const heba = memberNamed('هبة الأحمد')
    const response = await issue(stage.director, stage.initiativeId, {
      participantIds: [heba.participantId],
    }).expect(200)

    const token = tokenOf((response.body.links as IssuedLink[])[0]!.url)

    const redeemed = await request(app)
      .post('/api/field/links/redeem')
      .send({ token })
      .expect(200)

    expect(redeemed.body).toMatchObject({
      participant: { id: heba.participantId, fullNameAr: 'هبة الأحمد' },
      initiative: { id: stage.initiativeId },
    })

    const opened = await card(token).expect(200)

    expect(opened.body.kind).toBe('PARTICIPANT')
    expect(opened.body.participant.fullNameAr).toBe('هبة الأحمد')

    const [membership] = opened.body.memberships as Membership[]

    expect(membership).toMatchObject({
      rsvp: 'UNKNOWN',
      group: {
        id: groupId,
        nameAr: 'مجموعة الروابط',
        leadNameAr: 'قائد الحديقة',
        contactPhone: '0944 000 111',
      },
      site: { id: stage.siteId, nameAr: 'حديقة تشرين' },
      attendedOn: [],
    })

    // البطاقة لا تحمل وسيلة تواصل غير التي اختارها المنسّق، ولا أعضاء غيره.
    expect(JSON.stringify(opened.body)).not.toContain('سامر عيسى')
    expect(JSON.stringify(opened.body)).not.toContain('lina@example.test')
  })

  it('replaces the previous link when a new one is issued', async () => {
    const samer = memberNamed('سامر عيسى')
    const body = { participantIds: [samer.participantId] }

    const first = await issue(stage.director, stage.initiativeId, body).expect(200)
    const second = await issue(stage.director, stage.initiativeId, body).expect(200)

    const oldToken = tokenOf((first.body.links as IssuedLink[])[0]!.url)
    const newToken = tokenOf((second.body.links as IssuedLink[])[0]!.url)

    await card(oldToken).expect(401)
    await card(newToken).expect(200)

    const active = await db
      .select({ id: participantLinks.id })
      .from(participantLinks)
      .where(
        and(
          eq(participantLinks.participantId, samer.participantId),
          eq(participantLinks.initiativeId, stage.initiativeId),
        ),
      )

    // القديم يبقى صفًّا مُبطَلًا: «متى أُبطل ومن أبطله» معلومة.
    expect(active.length).toBeGreaterThanOrEqual(2)
  })

  it('refuses revoked, expired and made-up links with one answer', async () => {
    const lina = memberNamed('لينا حداد')
    const response = await issue(stage.director, stage.initiativeId, {
      participantIds: [lina.participantId],
    }).expect(200)

    const token = tokenOf((response.body.links as IssuedLink[])[0]!.url)

    await card(token).expect(200)

    const revoked = await request(app)
      .post(adminField(stage.initiativeId, '/links/revoke'))
      .set('authorization', bearer(stage.director))
      .send({ participantIds: [lina.participantId] })
      .expect(200)

    expect(revoked.body.revoked).toBe(1)

    const afterRevoke = await card(token).expect(401)
    const madeUp = await card(`plk_${'a'.repeat(43)}`).expect(401)

    expect(afterRevoke.body.detail).toBe(madeUp.body.detail)

    await request(app)
      .post('/api/field/links/redeem')
      .send({ token })
      .expect(401)

    // منتهٍ: رابط جديد يُؤخَّر موعد انتهائه إلى الماضي.
    const fresh = await issue(stage.director, stage.initiativeId, {
      participantIds: [lina.participantId],
    }).expect(200)
    const expiring = tokenOf((fresh.body.links as IssuedLink[])[0]!.url)

    await db
      .update(participantLinks)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(
        and(
          eq(participantLinks.participantId, lina.participantId),
          eq(participantLinks.initiativeId, stage.initiativeId),
        ),
      )

    const expired = await card(expiring).expect(401)

    expect(expired.body.detail).toBe(madeUp.body.detail)
  })

  it('keeps a volunteer out of the lead routes and a lead out of RSVP', async () => {
    const heba = memberNamed('هبة الأحمد')
    const response = await issue(stage.director, stage.initiativeId, {
      participantIds: [heba.participantId],
    }).expect(200)
    const token = tokenOf((response.body.links as IssuedLink[])[0]!.url)

    await getSheet(token, groupId).expect(403)

    await fieldPost(token, `/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId: heba.participantId,
    }).expect(403)

    await fieldPost(stage.lead.token, '/me/rsvp', {
      memberId: heba.id,
      coming: true,
    }).expect(403)

    // وعضو الفريق ما زال يأخذ مجموعاته من المسار نفسه.
    const home = await getHome(stage.lead.token).expect(200)

    expect(home.body.kind).toBe('STAFF')
  })

  it('records the RSVP and shows it to the coordinator', async () => {
    const heba = memberNamed('هبة الأحمد')
    const samer = memberNamed('سامر عيسى')
    const response = await issue(stage.director, stage.initiativeId, {
      participantIds: [heba.participantId],
    }).expect(200)
    const token = tokenOf((response.body.links as IssuedLink[])[0]!.url)

    const coming = await fieldPost(token, '/me/rsvp', {
      memberId: heba.id,
      coming: true,
    }).expect(200)

    expect((coming.body.memberships as Membership[])[0]!.rsvp).toBe('COMING')

    // عضوية غيره جوابها كغير الموجودة.
    await fieldPost(token, '/me/rsvp', {
      memberId: samer.id,
      coming: true,
    }).expect(404)

    const listed = await request(app)
      .get(adminField(stage.initiativeId, `/groups/${groupId}/members`))
      .set('authorization', bearer(stage.director))
      .expect(200)

    const row = (
      listed.body.members as Array<{
        id: string
        rsvp: string
        rsvpAt: string | null
        link: { status: string; lastUsedAt: string | null } | null
      }>
    ).find((member) => member.id === heba.id)!

    expect(row.rsvp).toBe('COMING')
    expect(row.rsvpAt).not.toBeNull()
    expect(row.link).toMatchObject({ status: 'ACTIVE' })
    expect(row.link?.lastUsedAt).not.toBeNull()

    const field = await request(app)
      .get(adminField(stage.initiativeId))
      .set('authorization', bearer(stage.director))
      .expect(200)

    const group = (
      field.body.groups as Array<{
        id: string
        comingCount: number
        linkedCount: number
        contactPhone: string | null
      }>
    ).find((candidate) => candidate.id === groupId)!

    expect(group).toMatchObject({ comingCount: 1, contactPhone: '0944 000 111' })
    expect(group.linkedCount).toBeGreaterThanOrEqual(1)

    const apology = await fieldPost(token, '/me/rsvp', {
      memberId: heba.id,
      coming: false,
    }).expect(200)

    expect((apology.body.memberships as Membership[])[0]!.rsvp).toBe(
      'NOT_COMING',
    )
  })

  it('mails the link only to those who have an address', async () => {
    await db.delete(outboxJobs)

    const response = await issue(stage.director, stage.initiativeId, {
      groupId,
      email: true,
    }).expect(200)

    const links = response.body.links as IssuedLink[]

    expect(links.filter((link) => link.emailed).map((link) => link.fullNameAr)).toEqual(
      ['لينا حداد'],
    )

    const jobs = await db.select().from(outboxJobs)

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      templateKey: 'field-link',
      recipient: 'lina@example.test',
    })
    expect(jobs[0]!.payload).toMatchObject({
      fullNameAr: 'لينا حداد',
      groupNameAr: 'مجموعة الروابط',
      siteNameAr: 'حديقة تشرين',
      meetingPointAr: 'البوابة الشرقية',
    })
  })

  it('writes who issued and revoked, and never the link itself', async () => {
    const entries = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, stage.initiativeId))

    const actions = entries.map((entry) => entry.action)

    expect(actions).toContain('field.links_created')
    expect(actions).toContain('field.links_revoked')
    expect(JSON.stringify(entries)).not.toContain('plk_')
  })

  it('refuses links for people outside the initiative', async () => {
    const response = await issue(stage.director, stage.initiativeId, {
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    }).expect(422)

    expect(response.body.detail).toContain('ليسوا أعضاء')

    await issue(stage.lead.token, stage.initiativeId, { groupId }).expect(403)
    await issue(stage.director, stage.initiativeId, {}).expect(422)
  })
})

describe.runIf(ready)('the card after the day', () => {
  let stage: FieldStage
  let groupId: string
  let token: string
  let member: { id: string; participantId: string }

  beforeAll(async () => {
    stage = await bootstrapField()
    groupId = (
      await createGroup(stage.director, stage.initiativeId, {
        siteId: stage.siteId,
        nameAr: 'مجموعة الأثر',
        leadUserId: stage.lead.userId,
      })
    ).id

    const added = await addPeople(stage.director, stage.initiativeId, groupId, [
      { fullNameAr: 'نور العمر', phone: '0955 000 222' },
    ])

    member = added.members[0]!

    const issued = await issue(stage.director, stage.initiativeId, {
      groupId,
    }).expect(200)

    token = tokenOf((issued.body.links as IssuedLink[])[0]!.url)
  })

  it('shows the days the volunteer attended', async () => {
    await fieldPost(stage.lead.token, `/groups/${groupId}/attendance`, {
      clientId: newClientId(),
      participantId: member.participantId,
    }).expect(200)

    const opened = await card(token).expect(200)
    const [membership] = opened.body.memberships as Membership[]

    expect(membership!.attendedOn).toEqual([opened.body.day])
  })

  it('shows verified numbers only', async () => {
    const trees = await metricIdBySlug('trees-planted')

    // رقم القائد من الميدان غير موثَّق حتى يتحقق منه المنسّق.
    await fieldPost(stage.lead.token, `/groups/${groupId}/impact`, {
      clientId: newClientId(),
      metricId: trees,
      value: 30,
    }).expect(200)

    const before = await card(token).expect(200)

    expect((before.body.memberships as Membership[])[0]!.impact).toEqual([])

    await recordVerifiedImpact(stage.director, {
      metricId: trees,
      siteId: stage.siteId,
      value: 45,
    })

    const after = await card(token).expect(200)

    expect((after.body.memberships as Membership[])[0]!.impact).toMatchObject([
      { value: 45 },
    ])
  })

  it('shows only the photos the coordinator allowed', async () => {
    const photo = (suffix: string, publicUseAllowed: boolean) => ({
      siteId: stage.siteId,
      groupId,
      url: `https://media.test/field/photos/${suffix}.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      publicUseAllowed,
      publicUseAllowedAt: publicUseAllowed ? new Date() : null,
    })

    await db
      .insert(attachments)
      .values([photo('internal', false), photo('published', true)])

    const opened = await card(token).expect(200)
    const photos = (opened.body.memberships as Membership[])[0]!.photos

    expect(photos.map((entry) => entry.url)).toEqual([
      'https://media.test/field/photos/published.jpg',
    ])
  })

  it('offers the feedback form only while it accepts answers', async () => {
    expect((await card(token).expect(200)).body.feedback).toBeNull()

    const form = await createJoinForm(stage.director, 'after-the-day')

    const candidates = await request(app)
      .get(adminField(stage.initiativeId, '/feedback-forms'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    expect(
      (candidates.body.data as Array<{ formId: string }>).map((row) => row.formId),
    ).toContain(form.formId)

    const saved = await request(app)
      .put(adminField(stage.initiativeId, '/settings'))
      .set('authorization', bearer(stage.director))
      .send({ feedbackFormId: form.formId })
      .expect(200)

    expect(saved.body.settings).toMatchObject({
      feedbackFormId: form.formId,
      feedbackFormUrl: expect.stringMatching(/\/join\/after-the-day$/),
    })

    const opened = await card(token).expect(200)

    expect(opened.body.feedback.url).toMatch(/\/join\/after-the-day$/)

    await request(app)
      .patch(`/api/admin/forms/${form.formId}`)
      .set('authorization', bearer(stage.director))
      .send({ isAccepting: false })
      .expect(200)

    expect((await card(token).expect(200)).body.feedback).toBeNull()

    const cleared = await request(app)
      .put(adminField(stage.initiativeId, '/settings'))
      .set('authorization', bearer(stage.director))
      .send({ feedbackFormId: null })
      .expect(200)

    expect(cleared.body.settings.feedbackFormId).toBeNull()
  })

  it('keeps the card to the initiative of the link', async () => {
    const otherSite = await addSite(stage.director, stage.initiativeId, {
      nameAr: 'مدرسة الأمل',
    })
    const otherGroup = await createGroup(stage.director, stage.initiativeId, {
      siteId: otherSite.id,
      nameAr: 'مجموعة المدرسة',
    })

    await request(app)
      .post(adminField(stage.initiativeId, `/groups/${otherGroup.id}/members`))
      .set('authorization', bearer(stage.director))
      .send({ participantIds: [member.participantId] })
      .expect(200)

    const opened = await card(token).expect(200)
    const names = (opened.body.memberships as Membership[]).map(
      (membership) => membership.group.nameAr,
    )

    expect(names.sort()).toEqual(['مجموعة الأثر', 'مجموعة المدرسة'].sort())
  })

  it('stops RSVP once the campaign is closed', async () => {
    await request(app)
      .post(`/api/admin/initiatives/${stage.initiativeId}/complete`)
      .set('authorization', bearer(stage.director))
      .expect(200)

    await fieldPost(token, '/me/rsvp', {
      memberId: member.id,
      coming: true,
    }).expect(409)

    // والبطاقة نفسها تبقى مقروءة: ما بعد اليوم هو ما جاء لأجله.
    await card(token).expect(200)
  })
})
