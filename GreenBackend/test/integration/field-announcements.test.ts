import { desc, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import {
  fieldAnnouncements,
  pushJobs,
  pushSubscriptions,
} from '../../src/db/schema/field-notify.js'
import {
  PushDeliveryError,
  type PushSender,
  isPushServiceEndpoint,
  processPushBatch,
  pushKey,
} from '../../src/modules/field/field-push.service.js'
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

type Announcement = {
  id: string
  titleAr: string
  groupNameAr: string | null
  devices: { targeted: number; sent: number; pending: number; failed: number }
}

const tokenOf = (url: string) => url.slice(url.indexOf('#') + 1)

/** اشتراك كما يعطيه المتصفح. المفاتيح بشكلها الصحيح، ولا يُشفَّر بها شيء هنا. */
const subscriptionOf = (device: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${device}`,
  expirationTime: null,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
})

const subscribe = (token: string, device: string) =>
  fieldPost(token, '/push/subscriptions', subscriptionOf(device))

const announce = (
  token: string,
  initiativeId: string,
  body: Record<string, unknown>,
) =>
  request(app)
    .post(adminField(initiativeId, '/announcements'))
    .set('authorization', bearer(token))
    .send(body)

async function issueLink(stage: FieldStage, participantId: string) {
  const response = await request(app)
    .post(adminField(stage.initiativeId, '/links'))
    .set('authorization', bearer(stage.director))
    .send({ participantIds: [participantId] })
    .expect(200)

  return tokenOf((response.body.links as Array<{ url: string }>)[0]!.url)
}

const jobsOf = (announcementId: string) =>
  db
    .select()
    .from(pushJobs)
    .where(eq(pushJobs.announcementId, announcementId))

describe.runIf(ready)('field announcements and push', () => {
  let stage: FieldStage
  let pines: string
  let olives: string
  let otherLead: Awaited<ReturnType<typeof createLead>>
  let heba: string
  let samer: string
  let lina: string

  beforeAll(async () => {
    stage = await bootstrapField()
    otherLead = await createLead('olives@greencities.test', 'قائد الزيتون')

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
        leadUserId: otherLead.userId,
      })
    ).id

    const inPines = await addPeople(stage.director, stage.initiativeId, pines, [
      { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
      { fullNameAr: 'سامر عيسى', phone: '0944 222 333' },
    ])
    const inOlives = await addPeople(
      stage.director,
      stage.initiativeId,
      olives,
      [{ fullNameAr: 'لينا حداد', phone: '0944 555 666' }],
    )

    const linkFor = async (
      members: typeof inPines.members,
      fullNameAr: string,
    ) =>
      issueLink(
        stage,
        members.find((member) => member.fullNameAr === fullNameAr)!
          .participantId,
      )

    heba = await linkFor(inPines.members, 'هبة الأحمد')
    samer = await linkFor(inPines.members, 'سامر عيسى')
    lina = await linkFor(inOlives.members, 'لينا حداد')
  })

  beforeEach(async () => {
    await db.delete(fieldAnnouncements)
    await db.delete(pushSubscriptions)
  })

  describe('subscribing a device', () => {
    it('hands the public key to a lead and to a volunteer, and to no one else', async () => {
      const forLead = await request(app)
        .get('/api/field/push/key')
        .set('authorization', bearer(stage.lead.token))
        .expect(200)

      expect(forLead.body).toEqual({
        enabled: true,
        publicKey: env.VAPID_PUBLIC_KEY,
      })

      await request(app)
        .get('/api/field/push/key')
        .set('authorization', bearer(heba))
        .expect(200)

      await request(app).get('/api/field/push/key').expect(401)
    })

    it('never leaks the private key', async () => {
      const response = await request(app)
        .get('/api/field/push/key')
        .set('authorization', bearer(heba))
        .expect(200)

      expect(JSON.stringify(response.body)).not.toContain(
        env.VAPID_PRIVATE_KEY!,
      )
    })

    it('stores the device under whoever holds the session', async () => {
      await subscribe(stage.lead.token, 'lead-phone').expect(200)
      await subscribe(heba, 'heba-phone').expect(200)

      const rows = await db.select().from(pushSubscriptions)
      const lead = rows.find((row) => row.endpoint.endsWith('lead-phone'))!
      const volunteer = rows.find((row) => row.endpoint.endsWith('heba-phone'))!

      expect(lead).toMatchObject({
        userId: stage.lead.userId,
        participantId: null,
        initiativeId: null,
      })
      expect(volunteer.userId).toBeNull()
      expect(volunteer.participantId).not.toBeNull()
      expect(volunteer.initiativeId).toBe(stage.initiativeId)
    })

    it('keeps one row per device, owned by whoever signed in last', async () => {
      await subscribe(heba, 'shared-phone').expect(200)
      await subscribe(heba, 'shared-phone').expect(200)
      await subscribe(stage.lead.token, 'shared-phone').expect(200)

      const rows = await db.select().from(pushSubscriptions)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        userId: stage.lead.userId,
        participantId: null,
      })
    })

    /**
     * الخادم يرسل طلبًا إلى عنوان الاشتراك. عنوان يكتبه مهاجم يجعل الخادم
     * يطرق ما داخل شبكته، فلا يُقبل إلا عنوان خدمة إشعار معروفة.
     */
    it('refuses an endpoint that is not a known push service', async () => {
      for (const endpoint of [
        'https://internal.greencities.test/admin',
        'https://169.254.169.254/latest/meta-data',
        'https://fcm.googleapis.com.attacker.test/fcm/send/x',
        'https://fcm.googleapis.com:8443/fcm/send/x',
        'http://fcm.googleapis.com/fcm/send/x',
      ]) {
        await fieldPost(heba, '/push/subscriptions', {
          ...subscriptionOf('x'),
          endpoint,
        }).expect(422)
      }

      expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
    })

    it('knows the push services browsers use', () => {
      for (const endpoint of [
        'https://fcm.googleapis.com/fcm/send/abc',
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://wns2-par02p.notify.windows.com/w/?token=abc',
        'https://web.push.apple.com/abc',
      ]) {
        expect(isPushServiceEndpoint(endpoint)).toBe(true)
      }
    })

    it('removes only a device its holder owns', async () => {
      await subscribe(heba, 'heba-phone').expect(200)

      await fieldPost(samer, '/push/subscriptions/remove', {
        endpoint: subscriptionOf('heba-phone').endpoint,
      }).expect(200)

      expect(await db.select().from(pushSubscriptions)).toHaveLength(1)

      await fieldPost(heba, '/push/subscriptions/remove', {
        endpoint: subscriptionOf('heba-phone').endpoint,
      }).expect(200)

      expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
    })

    /**
     * مفتاح لُصق بعلامتَي تنصيصه، أو نصفه: الإشعارات تتعطّل وحدها، والخادم
     * يبقى يخدم كل ما عداها.
     */
    it('turns itself off on a malformed key instead of failing', () => {
      const original = {
        publicKey: env.VAPID_PUBLIC_KEY,
        subject: env.VAPID_SUBJECT,
      }

      try {
        env.VAPID_PUBLIC_KEY = `"${original.publicKey}"`
        expect(pushKey()).toEqual({ enabled: false, publicKey: null })

        env.VAPID_PUBLIC_KEY = original.publicKey
        env.VAPID_SUBJECT = 'push@greencities.test'
        expect(pushKey()).toEqual({ enabled: false, publicKey: null })

        env.VAPID_SUBJECT = undefined
        expect(pushKey()).toEqual({ enabled: false, publicKey: null })
      } finally {
        env.VAPID_PUBLIC_KEY = original.publicKey
        env.VAPID_SUBJECT = original.subject
      }

      expect(pushKey().enabled).toBe(true)
    })

    it('says so when the server has no keys', async () => {
      const key = env.VAPID_PRIVATE_KEY

      env.VAPID_PRIVATE_KEY = undefined

      try {
        const state = await request(app)
          .get('/api/field/push/key')
          .set('authorization', bearer(heba))
          .expect(200)

        expect(state.body).toEqual({ enabled: false, publicKey: null })

        await subscribe(heba, 'heba-phone').expect(409)

        // الإعلان يبقى يعمل: يظهر في التطبيق ولا يُدرج له إشعار.
        const created = await announce(stage.director, stage.initiativeId, {
          titleAr: 'تغيّر الموعد',
          bodyAr: 'نلتقي عند التاسعة لا الثامنة.',
        }).expect(201)

        expect(created.body.pushEnabled).toBe(false)
        expect(created.body.announcements).toHaveLength(1)
        expect(await db.select().from(pushJobs)).toHaveLength(0)
      } finally {
        env.VAPID_PRIVATE_KEY = key
      }
    })
  })

  describe('announcing', () => {
    beforeEach(async () => {
      await subscribe(stage.lead.token, 'pines-lead').expect(200)
      await subscribe(otherLead.token, 'olives-lead').expect(200)
      await subscribe(heba, 'heba-phone').expect(200)
      await subscribe(samer, 'samer-phone').expect(200)
      await subscribe(lina, 'lina-phone').expect(200)
    })

    const targetsOf = async (announcementId: string) => {
      const jobs = await db
        .select({ endpoint: pushSubscriptions.endpoint })
        .from(pushJobs)
        .innerJoin(
          pushSubscriptions,
          eq(pushJobs.subscriptionId, pushSubscriptions.id),
        )
        .where(eq(pushJobs.announcementId, announcementId))

      return jobs.map((job) => job.endpoint.split('/').pop()).sort()
    }

    it('reaches every device in the initiative by default', async () => {
      const response = await announce(stage.director, stage.initiativeId, {
        titleAr: 'تغيّر الموعد',
        bodyAr: 'نلتقي عند التاسعة لا الثامنة.',
      }).expect(201)

      const [created] = response.body.announcements as Announcement[]

      expect(created).toMatchObject({
        titleAr: 'تغيّر الموعد',
        groupNameAr: null,
        devices: { targeted: 5, sent: 0, pending: 5, failed: 0 },
      })
      expect(await targetsOf(created!.id)).toEqual([
        'heba-phone',
        'lina-phone',
        'olives-lead',
        'pines-lead',
        'samer-phone',
      ])

      const [job] = await jobsOf(created!.id)

      expect(job!.payload).toEqual({
        title: 'تغيّر الموعد',
        body: 'نلتقي عند التاسعة لا الثامنة.',
        url: '/app/home',
        tag: created!.id,
      })
    })

    it('narrows to one group and to one audience', async () => {
      const toPines = await announce(stage.director, stage.initiativeId, {
        groupId: pines,
        titleAr: 'المعاول عند البوابة',
        bodyAr: 'خذوها قبل الدخول.',
      }).expect(201)

      const pinesOnly = (toPines.body.announcements as Announcement[])[0]!

      expect(pinesOnly.groupNameAr).toBe('مجموعة الصنوبر')
      expect(await targetsOf(pinesOnly.id)).toEqual([
        'heba-phone',
        'pines-lead',
        'samer-phone',
      ])

      const toLeads = await announce(stage.director, stage.initiativeId, {
        audience: 'LEADS',
        titleAr: 'اجتماع القادة',
        bodyAr: 'بعد الانتهاء، عند المدخل.',
      }).expect(201)

      expect(
        await targetsOf((toLeads.body.announcements as Announcement[])[0]!.id),
      ).toEqual(['olives-lead', 'pines-lead'])

      const toVolunteers = await announce(stage.director, stage.initiativeId, {
        groupId: olives,
        audience: 'VOLUNTEERS',
        titleAr: 'أحضروا قبعات',
        bodyAr: 'الشمس قوية اليوم.',
      }).expect(201)

      expect(
        await targetsOf(
          (toVolunteers.body.announcements as Announcement[])[0]!.id,
        ),
      ).toEqual(['lina-phone'])
    })

    it('does not reach a device that opened a link of another initiative', async () => {
      const program = await programIdBySlug('tree-planting')
      const second = await createInitiative(stage.director, {
        programId: program.id,
        nameAr: 'حملة ثانية',
        targetRollup: 'NONE',
      })
      const secondId = second['id'] as string
      const site = await addSite(stage.director, secondId, {
        nameAr: 'حديقة ثانية',
      })
      const group = await createGroup(stage.director, secondId, {
        siteId: site.id,
        nameAr: 'مجموعة الحملة الثانية',
      })

      // هبة نفسها عضو في الحملة الثانية، وهاتفها مشترك برابط الأولى.
      await addPeople(stage.director, secondId, group.id, [
        { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
      ])

      const response = await announce(stage.director, secondId, {
        titleAr: 'إعلان الحملة الثانية',
        bodyAr: 'لا يصل إلا من فتح رابطها.',
      }).expect(201)

      expect(
        (response.body.announcements as Announcement[])[0]!.devices.targeted,
      ).toBe(0)
    })

    it('refuses a group of another initiative', async () => {
      await announce(stage.director, stage.initiativeId, {
        groupId: '00000000-0000-4000-8000-000000000000',
        titleAr: 'تغيّر الموعد',
        bodyAr: 'نلتقي عند التاسعة.',
      }).expect(422)

      expect(await db.select().from(fieldAnnouncements)).toHaveLength(0)
    })

    it('is the coordinator’s to make, not the lead’s', async () => {
      await announce(stage.lead.token, stage.initiativeId, {
        titleAr: 'تغيّر الموعد',
        bodyAr: 'نلتقي عند التاسعة.',
      }).expect(403)

      await request(app)
        .get(adminField(stage.initiativeId, '/announcements'))
        .set('authorization', bearer(stage.lead.token))
        .expect(403)
    })

    it('is written to the audit log without its recipients', async () => {
      await announce(stage.director, stage.initiativeId, {
        titleAr: 'تغيّر الموعد',
        bodyAr: 'نلتقي عند التاسعة.',
      }).expect(201)

      // السجل لا يُفرَّغ بين الاختبارات: الأحدث هو إعلان هذا الاختبار.
      const [entry] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'field.announcement_created'))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)

      expect(entry).toMatchObject({
        entityType: 'initiative',
        entityId: stage.initiativeId,
      })
      expect(entry!.metadata).toMatchObject({
        audience: 'ALL',
        targetedDevices: 5,
      })
      expect(JSON.stringify(entry!.metadata)).not.toContain('fcm.googleapis')
    })
  })

  describe('reading in the app', () => {
    beforeEach(async () => {
      await announce(stage.director, stage.initiativeId, {
        titleAr: 'للجميع',
        bodyAr: 'إعلان لكل مجموعات الحملة.',
      }).expect(201)
      await announce(stage.director, stage.initiativeId, {
        audience: 'LEADS',
        titleAr: 'للقادة',
        bodyAr: 'إعلان للقادة وحدهم.',
      }).expect(201)
      await announce(stage.director, stage.initiativeId, {
        audience: 'VOLUNTEERS',
        groupId: pines,
        titleAr: 'لمتطوعي الصنوبر',
        bodyAr: 'إعلان لمتطوعي مجموعة واحدة.',
      }).expect(201)
      await announce(stage.director, stage.initiativeId, {
        groupId: olives,
        titleAr: 'لمجموعة الزيتون',
        bodyAr: 'إعلان لمجموعة أخرى.',
      }).expect(201)
    })

    const titles = (body: { announcements: Array<{ titleAr: string }> }) =>
      body.announcements.map((item) => item.titleAr)

    it('shows a lead what was meant for leads of his group', async () => {
      const sheet = await getSheet(stage.lead.token, pines).expect(200)

      // الأحدث أولًا.
      expect(titles(sheet.body)).toEqual(['للقادة', 'للجميع'])
    })

    it('shows a volunteer what was meant for volunteers of his groups', async () => {
      const card = await getHome(heba).expect(200)

      expect(titles(card.body)).toEqual(['لمتطوعي الصنوبر', 'للجميع'])
      expect(card.body.announcements[0]).toMatchObject({
        groupNameAr: 'مجموعة الصنوبر',
        bodyAr: 'إعلان لمتطوعي مجموعة واحدة.',
      })

      const other = await getHome(lina).expect(200)

      expect(titles(other.body)).toEqual(['لمجموعة الزيتون', 'للجميع'])
    })

    it('reaches those who never subscribed', async () => {
      expect(await db.select().from(pushSubscriptions)).toHaveLength(0)

      const card = await getHome(samer).expect(200)

      expect(titles(card.body)).toContain('للجميع')
    })

    it('disappears from the app when deleted', async () => {
      const listed = await request(app)
        .get(adminField(stage.initiativeId, '/announcements'))
        .set('authorization', bearer(stage.director))
        .expect(200)

      const target = (listed.body.announcements as Announcement[]).find(
        (item) => item.titleAr === 'للجميع',
      )!

      const after = await request(app)
        .delete(adminField(stage.initiativeId, `/announcements/${target.id}`))
        .set('authorization', bearer(stage.director))
        .expect(200)

      expect(titles(after.body)).not.toContain('للجميع')
      expect(titles((await getHome(heba).expect(200)).body)).toEqual([
        'لمتطوعي الصنوبر',
      ])

      await request(app)
        .delete(adminField(stage.initiativeId, `/announcements/${target.id}`))
        .set('authorization', bearer(stage.director))
        .expect(404)
    })
  })

  describe('delivering', () => {
    let announcementId: string

    beforeEach(async () => {
      await subscribe(heba, 'heba-phone').expect(200)
      await subscribe(samer, 'samer-phone').expect(200)

      const response = await announce(stage.director, stage.initiativeId, {
        audience: 'VOLUNTEERS',
        titleAr: 'تغيّر الموعد',
        bodyAr: 'نلتقي عند التاسعة.',
      }).expect(201)

      announcementId = (response.body.announcements as Announcement[])[0]!.id
    })

    const devices = async () => {
      const listed = await request(app)
        .get(adminField(stage.initiativeId, '/announcements'))
        .set('authorization', bearer(stage.director))
        .expect(200)

      return (listed.body.announcements as Announcement[]).find(
        (item) => item.id === announcementId,
      )!.devices
    }

    it('sends each job once and counts it', async () => {
      const sent: Array<{ endpoint: string; payload: string; ttl: number }> = []
      const send: PushSender = async (target, payload, options) => {
        sent.push({
          endpoint: target.endpoint,
          payload,
          ttl: options.ttlSeconds,
        })
      }

      expect(await processPushBatch(send)).toMatchObject({
        claimed: 2,
        sent: 2,
      })
      // ما أُرسل لا يُلتقط ثانية.
      expect(await processPushBatch(send)).toMatchObject({ claimed: 0 })

      expect(sent.map((item) => item.endpoint.split('/').pop()).sort()).toEqual([
        'heba-phone',
        'samer-phone',
      ])
      expect(JSON.parse(sent[0]!.payload)).toMatchObject({
        title: 'تغيّر الموعد',
        url: '/app/home',
      })
      expect(sent[0]!.ttl).toBeGreaterThan(60)
      expect(sent[0]!.ttl).toBeLessThanOrEqual(env.PUSH_TTL_MINUTES * 60)

      expect(await devices()).toEqual({
        targeted: 2,
        sent: 2,
        pending: 0,
        failed: 0,
      })
    })

    it('forgets a device its push service no longer knows', async () => {
      const send: PushSender = async (target) => {
        if (target.endpoint.endsWith('heba-phone')) {
          throw new PushDeliveryError('Gone', 410)
        }
      }

      expect(await processPushBatch(send)).toMatchObject({ sent: 1, gone: 1 })

      const remaining = await db.select().from(pushSubscriptions)

      expect(remaining.map((row) => row.endpoint.split('/').pop())).toEqual([
        'samer-phone',
      ])

      // المهمة تبقى بسببها بعد زوال صاحبها: «استُهدف ولم يصل» يُعدّ.
      expect(await devices()).toEqual({
        targeted: 2,
        sent: 1,
        pending: 0,
        failed: 1,
      })
    })

    it('retries what may pass later, and gives up on what will not', async () => {
      const send: PushSender = async (target) => {
        throw new PushDeliveryError(
          'refused',
          target.endpoint.endsWith('heba-phone') ? 503 : 403,
        )
      }

      expect(await processPushBatch(send)).toMatchObject({
        retried: 1,
        failed: 1,
      })

      const jobs = await jobsOf(announcementId)
      const retried = jobs.find((job) => job.status === 'PENDING')!

      expect(retried.attempts).toBe(1)
      expect(retried.availableAt.getTime()).toBeGreaterThan(Date.now())
      expect(jobs.find((job) => job.status === 'FAILED')!.lastError).toBe(
        'refused',
      )

      // موعد الإعادة لم يحن: لا تُلتقط قبله.
      expect(await processPushBatch(send)).toMatchObject({ claimed: 0 })

      // رفضٌ لا يُسقط الاشتراك: قد يكون العطل في إعداد الخادم لا في الجهاز.
      expect(await db.select().from(pushSubscriptions)).toHaveLength(2)
    })

    it('stops retrying after the last attempt', async () => {
      const send: PushSender = async () => {
        throw new PushDeliveryError('unavailable', 503)
      }

      for (let attempt = 0; attempt < env.OUTBOX_MAX_ATTEMPTS; attempt += 1) {
        await db
          .update(pushJobs)
          .set({ availableAt: new Date(Date.now() - 1000) })
          .where(eq(pushJobs.status, 'PENDING'))

        await processPushBatch(send)
      }

      expect(await devices()).toMatchObject({ pending: 0, failed: 2 })
    })

    it('does not send what has expired', async () => {
      let calls = 0
      const send: PushSender = async () => {
        calls += 1
      }

      await db
        .update(pushJobs)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(pushJobs.announcementId, announcementId))

      expect(await processPushBatch(send)).toMatchObject({
        claimed: 2,
        failed: 2,
      })
      expect(calls).toBe(0)
    })

    it('drops what was not sent when the announcement is deleted', async () => {
      await request(app)
        .delete(
          adminField(stage.initiativeId, `/announcements/${announcementId}`),
        )
        .set('authorization', bearer(stage.director))
        .expect(200)

      expect(await db.select().from(pushJobs)).toHaveLength(0)
    })
  })

  describe('a revoked link', () => {
    it('takes its devices with it', async () => {
      await subscribe(heba, 'heba-phone').expect(200)
      await subscribe(samer, 'samer-phone').expect(200)

      const [hebaRow] = await db
        .select({ participantId: pushSubscriptions.participantId })
        .from(pushSubscriptions)
        .where(
          eq(
            pushSubscriptions.endpoint,
            subscriptionOf('heba-phone').endpoint,
          ),
        )

      await request(app)
        .post(adminField(stage.initiativeId, '/links/revoke'))
        .set('authorization', bearer(stage.director))
        .send({ participantIds: [hebaRow!.participantId] })
        .expect(200)

      const remaining = await db
        .select({ endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.initiativeId, stage.initiativeId))

      expect(remaining.map((row) => row.endpoint.split('/').pop())).toEqual([
        'samer-phone',
      ])

      // يعود الرابط لبقية الاختبارات إن أُعيد ترتيبها.
      heba = await issueLink(stage, hebaRow!.participantId!)
    })
  })
})
