import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import { runSeed } from '../../src/db/seed.js'
import { bearer, createStaffUser, login } from '../helpers/auth.js'
import {
  closeTestDatabase,
  ensureTestDatabase,
  resetDatabase,
} from '../helpers/database.js'
import { lookupValueId } from '../helpers/lookups.js'
import { createPartner } from '../helpers/partners.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

async function sessionFor(email: string, roleSlug: string, officeSlug: string) {
  await createStaffUser({ email, roleSlug, officeSlug })

  return (await login(email)).accessToken
}

type ValueRow = {
  id: string
  code: string
  nameAr: string
  isActive: boolean
  isLocked: boolean
  isSystem: boolean
  usageCount: number | null
}

async function values(token: string, code: string, query = '') {
  const response = await request(app)
    .get(`/api/admin/lookups/${code}${query}`)
    .set('authorization', bearer(token))
    .expect(200)

  return response.body.values as ValueRow[]
}

/**
 * تعريفات النظام: القائمة المنسدلة تقرأ قيمها برمز التعريف، ومن يعدّل
 * السجلات يضيف إليها من زر «+»، والقاعدة ترفض حذف ما صُنّف به سجل.
 */
describe.runIf(ready)('system lookups', () => {
  let relations: string
  let media: string
  let tech: string

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })

    relations = await sessionFor(
      'relations@greencities.test',
      'RELATIONSHIPS',
      'relations',
    )
    media = await sessionFor('media@greencities.test', 'MEDIA', 'media')
    tech = await sessionFor('tech@greencities.test', 'TECH', 'tech')
  })

  it('lists every definition with what the viewer may edit', async () => {
    const response = await request(app)
      .get('/api/admin/lookups')
      .set('authorization', bearer(media))
      .expect(200)

    const byCode = Object.fromEntries(
      response.body.data.map((list: { code: string }) => [list.code, list]),
    )

    expect(Object.keys(byCode)).toHaveLength(9)
    expect(byCode.ORGANIZATION_KIND).toMatchObject({
      nameAr: 'نوع الجهة',
      valueCount: 9,
      activeCount: 9,
      canEdit: false,
    })
    // مكتب الإعلام يعدّل الإعلاميين، فيحرّر محاور تصنيفهم.
    expect(byCode.MEDIA_CHANNEL).toMatchObject({ canEdit: true })
  })

  it('serves active values in their order, and inactive ones on request', async () => {
    const priorities = await values(relations, 'CONTACT_PRIORITY')

    expect(priorities.map((value) => value.code)).toEqual(['HIGH', 'MEDIUM', 'LOW'])
    expect(priorities.find((value) => value.code === 'MEDIUM')).toMatchObject({
      isLocked: true,
      isSystem: false,
      usageCount: null,
    })

    await request(app)
      .get('/api/admin/lookups/NOT_A_LIST')
      .set('authorization', bearer(relations))
      .expect(404)
  })

  it('adds a value from the dropdown that is usable at once', async () => {
    const created = await request(app)
      .post('/api/admin/lookups/ORGANIZATION_KIND/values')
      .set('authorization', bearer(relations))
      .send({ nameAr: 'نادٍ رياضي' })
      .expect(201)

    expect(created.body).toMatchObject({
      nameAr: 'نادٍ رياضي',
      isActive: true,
      isLocked: false,
    })
    expect(created.body.code).toMatch(/^CUSTOM_[0-9A-F]{8}$/)

    const kinds = await values(relations, 'ORGANIZATION_KIND')

    // تُضاف في آخر الترتيب، فلا تزحزح ما رتّبه الفريق.
    expect(kinds.at(-1)?.id).toBe(created.body.id)

    const partner = await createPartner(relations, {
      organizationKindId: created.body.id,
    })

    expect(partner['organizationKind']).toMatchObject({
      id: created.body.id,
      nameAr: 'نادٍ رياضي',
    })

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'lookup_value.created'))

    expect(audit).toMatchObject({ entityId: created.body.id })
  })

  it('lets only editors of the records add to a definition', async () => {
    // الإعلام لا يعدّل الشركاء، فلا يضيف إلى «نوع الجهة».
    await request(app)
      .post('/api/admin/lookups/ORGANIZATION_KIND/values')
      .set('authorization', bearer(media))
      .send({ nameAr: 'نادٍ رياضي' })
      .expect(403)

    // ويضيف إلى أشكال العمل الإعلامي لأنه يعدّل الإعلاميين.
    await request(app)
      .post('/api/admin/lookups/MEDIA_CHANNEL/values')
      .set('authorization', bearer(media))
      .send({ nameAr: 'مدوّنة صوتية' })
      .expect(201)

    // و`lookups.manage` يحرّر كل التعريفات.
    await request(app)
      .post('/api/admin/lookups/ORGANIZATION_KIND/values')
      .set('authorization', bearer(tech))
      .send({ nameAr: 'نادٍ رياضي', code: 'SPORTS_CLUB' })
      .expect(201)
  })

  it('refuses a name already in the definition, however it is spelled', async () => {
    const response = await request(app)
      .post('/api/admin/lookups/ORGANIZATION_KIND/values')
      .set('authorization', bearer(relations))
      .send({ nameAr: 'جمعيه او منظمة اهلية' })
      .expect(409)

    expect(response.body.details[0]).toMatchObject({ path: 'nameAr' })

    await request(app)
      .post('/api/admin/lookups/ORGANIZATION_KIND/values')
      .set('authorization', bearer(tech))
      .send({ nameAr: 'نادٍ رياضي', code: 'COMPANY' })
      .expect(409)
  })

  it('hides a deactivated value without unsetting the records that use it', async () => {
    const donor = await lookupValueId('ORGANIZATION_KIND', 'DONOR')
    const partner = await createPartner(relations, { organizationKindId: donor })

    await request(app)
      .patch(`/api/admin/lookups/ORGANIZATION_KIND/values/${donor}`)
      .set('authorization', bearer(relations))
      .send({ isActive: false })
      .expect(200)

    expect(
      (await values(relations, 'ORGANIZATION_KIND')).some((value) => value.id === donor),
    ).toBe(false)

    // إسناد جديد يُرفض برسالة على حقله…
    const refused = await request(app)
      .post('/api/admin/partners')
      .set('authorization', bearer(relations))
      .send({ legalNameAr: 'صندوق التنمية', organizationKindId: donor })
      .expect(422)

    expect(refused.body.details[0]).toMatchObject({ path: 'organizationKindId' })

    // …والجهة التي صُنّفت بها تبقى عليها وتُعدَّل دون إجبار على تغييرها.
    const updated = await request(app)
      .patch(`/api/admin/partners/${partner.id}`)
      .set('authorization', bearer(relations))
      .send({ organizationKindId: donor, summaryAr: 'جهة مانحة قديمة' })
      .expect(200)

    expect(updated.body.organizationKind).toMatchObject({
      id: donor,
      isActive: false,
    })
  })

  it('refuses a value from another definition', async () => {
    const form = await lookupValueId('SUPPORT_FORM', 'MORAL_MEDIA')

    const response = await request(app)
      .post('/api/admin/partners')
      .set('authorization', bearer(relations))
      .send({ legalNameAr: 'شركة الشام', organizationKindId: form })
      .expect(422)

    expect(response.body.details[0]).toMatchObject({
      path: 'organizationKindId',
      message: 'القيمة ليست من «نوع الجهة».',
    })
  })

  it('keeps the values the code writes', async () => {
    const medium = await lookupValueId('CONTACT_PRIORITY', 'MEDIUM')
    const stageChange = await lookupValueId('INTERACTION_KIND', 'STAGE_CHANGE')

    await request(app)
      .patch(`/api/admin/lookups/CONTACT_PRIORITY/values/${medium}`)
      .set('authorization', bearer(tech))
      .send({ isActive: false })
      .expect(409)

    // تُعاد تسميتها؛ الرمز وحده ما يقرؤه الكود.
    await request(app)
      .patch(`/api/admin/lookups/CONTACT_PRIORITY/values/${medium}`)
      .set('authorization', bearer(tech))
      .send({ nameAr: 'عادية' })
      .expect(200)

    await request(app)
      .delete(`/api/admin/lookups/INTERACTION_KIND/values/${stageChange}`)
      .set('authorization', bearer(tech))
      .expect(409)

    // الجهة بلا أولوية مرسلة تأخذ القيمة المقفلة باسمها الجديد.
    const partner = await createPartner(relations)

    expect(partner['contactPriority']).toMatchObject({
      code: 'MEDIUM',
      nameAr: 'عادية',
    })
  })

  it('refuses system values from users', async () => {
    const partner = await createPartner(relations)
    const stageChange = await lookupValueId('INTERACTION_KIND', 'STAGE_CHANGE')

    const response = await request(app)
      .post(`/api/admin/partners/${partner.id}/interactions`)
      .set('authorization', bearer(relations))
      .send({ kindId: stageChange, summaryAr: 'نقل يدوي' })
      .expect(422)

    expect(response.body.details[0]).toMatchObject({ path: 'kindId' })

    const call = await lookupValueId('INTERACTION_KIND', 'CALL')
    const recorded = await request(app)
      .post(`/api/admin/partners/${partner.id}/interactions`)
      .set('authorization', bearer(relations))
      .send({ kindId: call, summaryAr: 'اتصال للتعارف' })
      .expect(201)

    // سجل الإنشاء نفسه نقل مرحلة كتبه النظام.
    expect(
      recorded.body.interactions.map((item: { kind: { code: string } }) => item.kind.code),
    ).toEqual(expect.arrayContaining(['CALL', 'STAGE_CHANGE']))
  })

  it('deletes an unused value and refuses a used one', async () => {
    const donor = await lookupValueId('ORGANIZATION_KIND', 'DONOR')
    const other = await lookupValueId('ORGANIZATION_KIND', 'OTHER')

    await createPartner(relations, { organizationKindId: donor })

    const refused = await request(app)
      .delete(`/api/admin/lookups/ORGANIZATION_KIND/values/${donor}`)
      .set('authorization', bearer(relations))
      .expect(409)

    expect(refused.body.detail).toContain('مستعملة في 1 من الشركاء')

    const kinds = await values(relations, 'ORGANIZATION_KIND', '?includeUsage=true')

    expect(kinds.find((value) => value.id === donor)?.usageCount).toBe(1)
    expect(kinds.find((value) => value.id === other)?.usageCount).toBe(0)

    await request(app)
      .delete(`/api/admin/lookups/ORGANIZATION_KIND/values/${other}`)
      .set('authorization', bearer(relations))
      .expect(204)
  })

  it('reorders a whole definition and no less', async () => {
    const priorities = await values(relations, 'CONTACT_PRIORITY')
    const reversed = priorities.map((value) => value.id).reverse()

    await request(app)
      .post('/api/admin/lookups/CONTACT_PRIORITY/values/reorder')
      .set('authorization', bearer(relations))
      .send({ ids: reversed.slice(1) })
      .expect(422)

    const response = await request(app)
      .post('/api/admin/lookups/CONTACT_PRIORITY/values/reorder')
      .set('authorization', bearer(relations))
      .send({ ids: reversed })
      .expect(200)

    expect(response.body.values.map((value: ValueRow) => value.code)).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
    ])
  })

  it('renames a definition for lookups.manage only, never its code', async () => {
    await request(app)
      .patch('/api/admin/lookups/ORGANIZATION_KIND')
      .set('authorization', bearer(relations))
      .send({ nameAr: 'فئة الجهة' })
      .expect(403)

    const response = await request(app)
      .patch('/api/admin/lookups/ORGANIZATION_KIND')
      .set('authorization', bearer(tech))
      .send({ nameAr: 'فئة الجهة', code: 'PARTNER_KIND' })
      .expect(200)

    expect(response.body).toMatchObject({
      code: 'ORGANIZATION_KIND',
      nameAr: 'فئة الجهة',
    })
  })
})
