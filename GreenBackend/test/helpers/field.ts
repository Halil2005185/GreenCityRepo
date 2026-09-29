import request from 'supertest'

import { app } from '../../src/app.js'
import { runSeed } from '../../src/db/seed.js'
import {
  TEST_PASSWORD,
  bearer,
  createStaffUser,
  login,
} from './auth.js'
import { resetDatabase } from './database.js'
import { addSite, createInitiative, programIdBySlug } from './operational.js'

export type FieldStage = {
  director: string
  initiativeId: string
  siteId: string
  /** قائد يحمل دور «قائد مجموعة ميداني» وحده. */
  lead: { token: string; userId: string }
}

/**
 * مسرح الاختبارات الميدانية: حملة جارية بموقع واحد وقائد مدعوّ.
 *
 * سياسة المطابقة `NONE` كي تُطلق الحملة بلا أهداف — الاختبار عن الميدان
 * لا عن بوابة البدء، ولها ملفها.
 */
export async function bootstrapField(): Promise<FieldStage> {
  await resetDatabase()
  await runSeed({
    adminEmail: 'director@greencities.test',
    adminPassword: TEST_PASSWORD,
  })

  const director = (await login('director@greencities.test')).accessToken
  const program = await programIdBySlug('tree-planting')

  const initiative = await createInitiative(director, {
    programId: program.id,
    nameAr: 'حملة الميدان التجريبية',
    targetRollup: 'NONE',
  })
  const initiativeId = initiative['id'] as string
  const site = await addSite(director, initiativeId, { nameAr: 'حديقة تشرين' })

  await request(app)
    .post(`/api/admin/initiatives/${initiativeId}/launch`)
    .set('authorization', bearer(director))
    .expect(200)

  return {
    director,
    initiativeId,
    siteId: site.id,
    lead: await createLead('lead@greencities.test', 'قائد الحديقة'),
  }
}

export async function createLead(email: string, fullNameAr: string) {
  const created = await createStaffUser({
    email,
    fullNameAr,
    roleSlug: 'FIELD_LEAD',
    officeSlug: 'operations-execution',
  })

  return {
    userId: created.userId,
    token: (await login(email)).accessToken,
  }
}

type Group = { id: string; nameAr: string; leadUserId: string | null }

/**
 * مسارات الكتابة تعيد ميدان المبادرة كاملًا، فالمجموعة الجديدة تُلتقط من
 * القائمة باسمها — كما يُلتقط الموقع في `operational.ts`.
 */
export async function createGroup(
  token: string,
  initiativeId: string,
  body: { siteId: string; nameAr: string } & Record<string, unknown>,
) {
  const response = await request(app)
    .post(`/api/admin/initiatives/${initiativeId}/field/groups`)
    .set('authorization', bearer(token))
    .send(body)
    .expect(201)

  const group = (response.body.groups as Group[]).find(
    (candidate) => candidate.nameAr === body.nameAr,
  )

  if (!group) throw new Error(`Group "${body.nameAr}" missing from the response.`)

  return group
}

export function getSheet(token: string, groupId: string) {
  return request(app)
    .get(`/api/field/groups/${groupId}`)
    .set('authorization', bearer(token))
}

export function getHome(token: string) {
  return request(app).get('/api/field/me').set('authorization', bearer(token))
}
