import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
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
import { lookupValueId } from '../helpers/lookups.js'
import {
  createPartner,
  onboardPartnerRepresentative,
  publishCharter,
  satisfyActivationRequirements,
} from '../helpers/partners.js'

const ready = await ensureTestDatabase()

/**
 * إغلاق واحد على مستوى الملف لا داخل كل describe: `afterAll` داخل
 * describe يعمل عند انتهائه هو، فيقفل الـpool على الكتل التي بعده.
 */
afterAll(async () => {
  await closeTestDatabase()
})

async function roleId(slug: string) {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, slug))
    .limit(1)

  if (!row) throw new Error(`Seed role "${slug}" is missing.`)

  return row.id
}

describe.runIf(ready)('partner lifecycle', () => {
  let relations: string

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({
      adminEmail: 'director@greencities.test',
      adminPassword: TEST_PASSWORD,
    })

    await createStaffUser({
      email: 'relations@greencities.test',
      roleSlug: 'RELATIONSHIPS',
      officeSlug: 'relations',
    })
    relations = (await login('relations@greencities.test')).accessToken
  })

  it('creates a prospect at the start of the pipeline', async () => {
    const partner = await createPartner(relations, {
      legalNameAr: 'شركة الشام للمقاولات',
      displayNameAr: 'الشام للمقاولات',
      organizationKindId: await lookupValueId('ORGANIZATION_KIND', 'COMPANY'),
    })

    expect(partner).toMatchObject({
      legalNameAr: 'شركة الشام للمقاولات',
      displayNameAr: 'الشام للمقاولات',
      stage: 'NEW',
      isSuspended: false,
      publicNameConsent: false,
    })
    expect(partner['activation']).toMatchObject({ satisfied: false })
  })

  it('falls back to the legal name when no display name is given', async () => {
    const partner = await createPartner(relations, {
      legalNameAr: 'مبادرة شباب حلب',
      organizationKindId: await lookupValueId(
        'ORGANIZATION_KIND',
        'COMMUNITY_INITIATIVE',
      ),
    })

    expect(partner['displayNameAr']).toBe('مبادرة شباب حلب')
  })

  /** «يمكن أن يحمل الشريك أكثر من صفة شراكة» — نص الميثاق. */
  it('lets one partner hold several partnership types', async () => {
    const partner = await createPartner(relations)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'EXECUTIVE' })
      .expect(201)

    const withTwo = await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'MEDIA' })
      .expect(201)

    expect(withTwo.body.partnerships).toHaveLength(2)

    // النوع نفسه مرتين مرفوض.
    await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'MEDIA' })
      .expect(409)
  })

  /** شراكة الفعالية ترتبط بمبادرة، والمبادرات في المرحلة الثالثة. */
  it('refuses an event partnership until initiatives exist', async () => {
    const partner = await createPartner(relations)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'EVENT' })
      .expect(422)
  })

  it('keeps a second primary contact from displacing the first silently', async () => {
    const partner = await createPartner(relations)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/contacts`)
      .set('authorization', bearer(relations))
      .send({ fullNameAr: 'الأول', email: 'first@partner.test', isPrimary: true })
      .expect(201)

    const second = await request(app)
      .post(`/api/admin/partners/${partner.id}/contacts`)
      .set('authorization', bearer(relations))
      .send({ fullNameAr: 'الثاني', email: 'second@partner.test', isPrimary: true })
      .expect(201)

    const primaries = second.body.contacts.filter(
      (contact: { isPrimary: boolean }) => contact.isPrimary,
    )

    expect(primaries).toHaveLength(1)
    expect(primaries[0].fullNameAr).toBe('الثاني')
  })

  it('rejects a contact with neither email nor phone', async () => {
    const partner = await createPartner(relations)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/contacts`)
      .set('authorization', bearer(relations))
      .send({ fullNameAr: 'بلا وسيلة تواصل' })
      .expect(422)
  })
})

describe.runIf(ready)('activation gate', () => {
  let director: string
  let relations: string

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({
      adminEmail: 'director@greencities.test',
      adminPassword: TEST_PASSWORD,
    })

    director = (await login('director@greencities.test')).accessToken

    await createStaffUser({
      email: 'relations@greencities.test',
      roleSlug: 'RELATIONSHIPS',
      officeSlug: 'relations',
    })
    relations = (await login('relations@greencities.test')).accessToken

    await publishCharter(director)
  })

  it('lists exactly which requirements are missing', async () => {
    const partner = await createPartner(relations)

    const response = await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(422)

    const missing = response.body.details.map(
      (item: { key: string }) => item.key,
    )

    expect(missing).toEqual([
      'PRIMARY_CONTACT',
      'APPROVED_PARTNERSHIP',
      'CHARTER_ACKNOWLEDGEMENT',
    ])
  })

  it('still refuses when only the charter acknowledgement is missing', async () => {
    const partner = await createPartner(relations)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/contacts`)
      .set('authorization', bearer(relations))
      .send({ fullNameAr: 'سامي', email: 'sami@partner.test', isPrimary: true })
      .expect(201)

    const created = await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'TECHNICAL' })
      .expect(201)

    await request(app)
      .patch(
        `/api/admin/partners/${partner.id}/partnerships/${created.body.partnerships[0].id}`,
      )
      .set('authorization', bearer(director))
      .send({ status: 'APPROVED' })
      .expect(200)

    const response = await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(422)

    expect(
      response.body.details.map((item: { key: string }) => item.key),
    ).toEqual(['CHARTER_ACKNOWLEDGEMENT'])
  })

  /** «المدير العام وحده يعتمد الشراكة النهائية» — محضر 02-08. */
  it('lets only the general director activate', async () => {
    const partner = await createPartner(relations)
    await satisfyActivationRequirements(director, partner.id)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(relations))
      .expect(403)

    const activated = await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(activated.body).toMatchObject({ stage: 'ACTIVE' })
    expect(activated.body.activatedAt).toBeTypeOf('string')
    expect(activated.body.activation.satisfied).toBe(true)

    const [entry] = await db
      .select({ severity: auditLogs.severity })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'partner.activated'))
      .limit(1)

    expect(entry?.severity).toBe('WARNING')
  })

  it('lets only the general director approve a partnership type', async () => {
    const partner = await createPartner(relations)

    const created = await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'STRATEGIC' })
      .expect(201)

    const partnershipId = created.body.partnerships[0].id

    await request(app)
      .patch(`/api/admin/partners/${partner.id}/partnerships/${partnershipId}`)
      .set('authorization', bearer(relations))
      .send({ status: 'APPROVED' })
      .expect(403)

    // تعليق اقتراح لم يُعتمد لا معنى له، ويُرفض بـ409 لا بخطأ خادم.
    await request(app)
      .patch(`/api/admin/partners/${partner.id}/partnerships/${partnershipId}`)
      .set('authorization', bearer(relations))
      .send({ status: 'PAUSED' })
      .expect(409)

    // سحب الاقتراح في متناول مكتب العلاقات — الاعتماد وحده محجوز.
    const withdrawn = await request(app)
      .patch(`/api/admin/partners/${partner.id}/partnerships/${partnershipId}`)
      .set('authorization', bearer(relations))
      .send({ status: 'ENDED' })
      .expect(200)

    expect(withdrawn.body.partnerships[0].status).toBe('ENDED')
  })

  it('lets the director pause a partnership after approving it', async () => {
    const partner = await createPartner(relations)

    const created = await request(app)
      .post(`/api/admin/partners/${partner.id}/partnerships`)
      .set('authorization', bearer(relations))
      .send({ type: 'MEDIA' })
      .expect(201)

    const partnershipId = created.body.partnerships[0].id

    await request(app)
      .patch(`/api/admin/partners/${partner.id}/partnerships/${partnershipId}`)
      .set('authorization', bearer(director))
      .send({ status: 'APPROVED' })
      .expect(200)

    const paused = await request(app)
      .patch(`/api/admin/partners/${partner.id}/partnerships/${partnershipId}`)
      .set('authorization', bearer(relations))
      .send({ status: 'PAUSED' })
      .expect(200)

    expect(paused.body.partnerships[0]).toMatchObject({
      status: 'PAUSED',
      approvedByNameAr: 'المدير العام',
    })
  })

  /** الميثاق يجعل موافقة الإظهار مستقلة، فلا تمنع التفعيل ولا تُشترط له. */
  it('activates without any display consent', async () => {
    const partner = await createPartner(relations)
    await satisfyActivationRequirements(director, partner.id)

    const activated = await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(activated.body.publicNameConsent).toBe(false)
    expect(activated.body.publicLogoConsent).toBe(false)
    expect(activated.body.stage).toBe('ACTIVE')
  })

  it('refuses to activate twice', async () => {
    const partner = await createPartner(relations)
    await satisfyActivationRequirements(director, partner.id)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(409)
  })

  it('mirrors every consent decision into an append-only event', async () => {
    const partner = await createPartner(relations)

    const granted = await request(app)
      .post(`/api/admin/partners/${partner.id}/consent`)
      .set('authorization', bearer(relations))
      .send({ consentType: 'PUBLIC_NAME', action: 'GRANTED' })
      .expect(200)

    expect(granted.body.publicNameConsent).toBe(true)

    const revoked = await request(app)
      .post(`/api/admin/partners/${partner.id}/consent`)
      .set('authorization', bearer(relations))
      .send({ consentType: 'PUBLIC_NAME', action: 'REVOKED' })
      .expect(200)

    expect(revoked.body.publicNameConsent).toBe(false)
    // الحدثان محفوظان: السحب لم يمحُ المنح.
    expect(revoked.body.consentEvents).toHaveLength(2)
    expect(
      revoked.body.consentEvents.map((event: { action: string }) => event.action),
    ).toEqual(['REVOKED', 'GRANTED'])
  })
})

describe.runIf(ready)('partner portal isolation', () => {
  let director: string
  let partnerRoleId: string

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({
      adminEmail: 'director@greencities.test',
      adminPassword: TEST_PASSWORD,
    })

    director = (await login('director@greencities.test')).accessToken
    partnerRoleId = await roleId('PARTNER_ADMIN')

    await publishCharter(director)
  })

  it('refuses a representative invitation before the partnership is approved', async () => {
    const partner = await createPartner(director)

    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(director))
      .send({
        email: 'rep@partner.test',
        roleId: partnerRoleId,
        partnerId: partner.id,
      })
      .expect(422)
  })

  it('refuses a partner-scope invitation with no partner', async () => {
    await request(app)
      .post('/api/admin/invitations')
      .set('authorization', bearer(director))
      .send({ email: 'rep@partner.test', roleId: partnerRoleId })
      .expect(422)
  })

  it('runs the whole path from prospect to a representative seeing their org', async () => {
    const partner = await createPartner(director, {
      legalNameAr: 'جمعية أصدقاء البيئة',
    })

    await satisfyActivationRequirements(director, partner.id, 'rep@partner.test')

    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    const rep = await onboardPartnerRepresentative(
      director,
      partner.id,
      'rep@partner.test',
      TEST_PASSWORD,
      partnerRoleId,
    )

    expect(rep.user).toMatchObject({ kind: 'PARTNER' })
    expect(rep.user.partner).toMatchObject({
      id: partner.id,
      displayNameAr: 'جمعية أصدقاء البيئة',
      roleSlug: 'PARTNER_ADMIN',
    })
    expect(rep.user.capabilities).toContain('partner.profile.manage')
    expect(rep.user.capabilities).not.toContain('partners.view')

    const self = await request(app)
      .get('/api/partner/me')
      .set('authorization', bearer(rep.accessToken))
      .expect(200)

    expect(self.body).toMatchObject({
      id: partner.id,
      displayNameAr: 'جمعية أصدقاء البيئة',
      stage: 'ACTIVE',
    })
    // لا تخرج الملاحظات الداخلية ولا ملاحظات القرار إلى البوابة إطلاقًا.
    expect(self.body).not.toHaveProperty('internalNotesAr')
    expect(self.body).not.toHaveProperty('decisionNoteAr')
    expect(self.body).not.toHaveProperty('accountManagerId')

    // جهة الاتصال التي طابق بريدها الدعوة صارت مرتبطة بحساب.
    const detail = await request(app)
      .get(`/api/admin/partners/${partner.id}`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(
      detail.body.contacts.find(
        (contact: { email: string }) => contact.email === 'rep@partner.test',
      ).hasAccount,
    ).toBe(true)
  })

  it('locks a representative out of every staff route', async () => {
    const partner = await createPartner(director)
    await satisfyActivationRequirements(director, partner.id, 'rep@partner.test')
    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    const rep = await onboardPartnerRepresentative(
      director,
      partner.id,
      'rep@partner.test',
      TEST_PASSWORD,
      partnerRoleId,
    )

    for (const path of [
      '/api/admin/partners',
      `/api/admin/partners/${partner.id}`,
      '/api/admin/invitations',
      '/api/admin/offices',
      '/api/admin/charter/versions',
    ]) {
      await request(app)
        .get(path)
        .set('authorization', bearer(rep.accessToken))
        .expect(403)
    }
  })

  /**
   * جوهر العزل: لا يوجد معرّف جهة في أي مسار من البوابة، فممثل جهة لا
   * يملك سطحًا يطلب به جهة أخرى — ولا حتى بالتخمين.
   */
  it('gives each representative only their own organization', async () => {
    const first = await createPartner(director, { legalNameAr: 'الجهة الأولى' })
    const second = await createPartner(director, { legalNameAr: 'الجهة الثانية' })

    for (const [partner, email] of [
      [first, 'rep-a@partner.test'],
      [second, 'rep-b@partner.test'],
    ] as const) {
      await satisfyActivationRequirements(director, partner.id, email)
      await request(app)
        .post(`/api/admin/partners/${partner.id}/activate`)
        .set('authorization', bearer(director))
        .expect(200)
    }

    const repA = await onboardPartnerRepresentative(
      director,
      first.id,
      'rep-a@partner.test',
      TEST_PASSWORD,
      partnerRoleId,
    )
    const repB = await onboardPartnerRepresentative(
      director,
      second.id,
      'rep-b@partner.test',
      TEST_PASSWORD,
      partnerRoleId,
    )

    const seenByA = await request(app)
      .get('/api/partner/me')
      .set('authorization', bearer(repA.accessToken))
      .expect(200)

    const seenByB = await request(app)
      .get('/api/partner/me')
      .set('authorization', bearer(repB.accessToken))
      .expect(200)

    expect(seenByA.body.id).toBe(first.id)
    expect(seenByA.body.legalNameAr).toBe('الجهة الأولى')
    expect(seenByB.body.id).toBe(second.id)
    expect(seenByB.body.legalNameAr).toBe('الجهة الثانية')
  })

  it('lets a representative manage their own display consent', async () => {
    const partner = await createPartner(director)
    await satisfyActivationRequirements(director, partner.id, 'rep@partner.test')
    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    const rep = await onboardPartnerRepresentative(
      director,
      partner.id,
      'rep@partner.test',
      TEST_PASSWORD,
      partnerRoleId,
    )

    const updated = await request(app)
      .patch('/api/partner/me/display-consent')
      .set('authorization', bearer(rep.accessToken))
      .send({ publicNameConsent: true, publicLogoConsent: false })
      .expect(200)

    expect(updated.body.publicNameConsent).toBe(true)
    expect(updated.body.publicLogoConsent).toBe(false)

    // الحدث سُجِّل بمصدر الشريك لا الإدارة.
    const detail = await request(app)
      .get(`/api/admin/partners/${partner.id}`)
      .set('authorization', bearer(director))
      .expect(200)

    /**
     * القراران سُجّلا في المعاملة نفسها فطابعهما الزمني واحد، ولا ترتيب
     * دلاليًّا بينهما. البحث عن الحدث المقصود أصدق من افتراض موقعه.
     */
    const nameEvent = detail.body.consentEvents.find(
      (event: { consentType: string }) => event.consentType === 'PUBLIC_NAME',
    )

    expect(nameEvent).toMatchObject({
      source: 'PARTNER_SELF',
      action: 'GRANTED',
    })
    expect(detail.body.consentEvents).toHaveLength(2)
  })

  it('refuses profile writes from a suspended organization but still shows why', async () => {
    const partner = await createPartner(director)
    await satisfyActivationRequirements(director, partner.id, 'rep@partner.test')
    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(director))
      .expect(200)

    const rep = await onboardPartnerRepresentative(
      director,
      partner.id,
      'rep@partner.test',
      TEST_PASSWORD,
      partnerRoleId,
    )

    await request(app)
      .post(`/api/admin/partners/${partner.id}/suspend`)
      .set('authorization', bearer(director))
      .send({ suspensionReasonAr: 'مراجعة إدارية' })
      .expect(200)

    await request(app)
      .patch('/api/partner/me')
      .set('authorization', bearer(rep.accessToken))
      .send({ summaryAr: 'محاولة تعديل' })
      .expect(403)

    const self = await request(app)
      .get('/api/partner/me')
      .set('authorization', bearer(rep.accessToken))
      .expect(200)

    expect(self.body.isSuspended).toBe(true)
    expect(self.body.suspensionReasonAr).toBe('مراجعة إدارية')
  })
})

describe.runIf(ready)('internal notes visibility', () => {
  beforeEach(async () => {
    await resetDatabase()
    await runSeed({
      adminEmail: 'director@greencities.test',
      adminPassword: TEST_PASSWORD,
    })
  })

  it('hides internal notes from staff without the capability', async () => {
    const director = (await login('director@greencities.test')).accessToken

    const partner = await createPartner(director, {
      internalNotesAr: 'الجهة مترددة بشأن التمويل — لا يُذكر أمامها.',
    })

    const asDirector = await request(app)
      .get(`/api/admin/partners/${partner.id}`)
      .set('authorization', bearer(director))
      .expect(200)

    expect(asDirector.body.internalNotesAr).toContain('مترددة')

    // العمليات ترى الجهة لكن لا ترى ملاحظات مكتب العلاقات الداخلية.
    await createStaffUser({
      email: 'ops@greencities.test',
      roleSlug: 'OPERATIONS',
      officeSlug: 'operations',
    })
    const ops = (await login('ops@greencities.test')).accessToken

    const asOps = await request(app)
      .get(`/api/admin/partners/${partner.id}`)
      .set('authorization', bearer(ops))
      .expect(200)

    expect(asOps.body.internalNotesAr).toBeNull()
    expect(asOps.body.displayNameAr).toBeTypeOf('string')
  })
})
