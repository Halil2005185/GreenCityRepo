import { randomUUID } from 'node:crypto'

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

export const adminField = (initiativeId: string, suffix = '') =>
  `/api/admin/initiatives/${initiativeId}/field${suffix}`

type Member = {
  id: string
  participantId: string
  fullNameAr: string
  phone: string | null
  attendance: { id: string } | null
}

/** يضيف أعضاء بالاسم والهاتف ويعيدهم كما عادوا من الخادم. */
export async function addPeople(
  token: string,
  initiativeId: string,
  groupId: string,
  people: Array<{ fullNameAr: string; phone?: string; email?: string }>,
) {
  const response = await request(app)
    .post(adminField(initiativeId, `/groups/${groupId}/members`))
    .set('authorization', bearer(token))
    .send({ people })
    .expect(200)

  return response.body as {
    members: Member[]
    summary: { added: number; alreadyMembers: number; newParticipants: number }
  }
}

/** كتابة ميدانية بمعرّف مُرسِل جديد، كما يولّده الهاتف لكل فعل. */
export function fieldPost(
  token: string,
  path: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/field${path}`)
    .set('authorization', bearer(token))
    .send(body)
}

export const newClientId = () => randomUUID()

/**
 * استمارة منشورة مفتوحة بسؤالَي الاسم والهاتف موسومَين بدوريهما، وطلبات
 * تُقدَّم من السطح العام ثم تُقبل — كما تصل الطلبات فعلًا.
 */
export async function createJoinForm(token: string, slug = 'volunteers') {
  const created = await request(app)
    .post('/api/admin/forms')
    .set('authorization', bearer(token))
    .send({ slug, nameAr: 'استمارة المتطوعين' })
    .expect(201)

  const formId = created.body.data.id as string

  const field = (body: Record<string, unknown>) =>
    request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({ isRequired: false, options: [], ...body })
      .expect(201)

  await field({
    key: 'full_name',
    labelAr: 'الاسم الكامل',
    type: 'TEXT',
    isRequired: true,
    contactRole: 'NAME',
  })
  await field({
    key: 'phone',
    labelAr: 'الهاتف',
    type: 'PHONE',
    contactRole: 'PHONE',
  })

  await request(app)
    .post(`/api/admin/forms/${formId}/publish`)
    .set('authorization', bearer(token))
    .expect(200)

  await request(app)
    .patch(`/api/admin/forms/${formId}`)
    .set('authorization', bearer(token))
    .send({ isAccepting: true })
    .expect(200)

  return { formId, slug }
}

export async function submitAndDecide(
  token: string,
  form: { formId: string; slug: string },
  answers: Record<string, unknown>,
  status: 'ACCEPTED' | 'REJECTED' | 'NEW' = 'ACCEPTED',
) {
  await request(app)
    .post(`/api/public/forms/${form.slug}/submissions`)
    .send({ answers })
    .expect(202)

  const listed = await request(app)
    .get(`/api/admin/forms/${form.formId}/submissions`)
    .set('authorization', bearer(token))
    .expect(200)

  const submission = (
    listed.body.data as Array<{ id: string; applicantNameAr: string | null }>
  ).find((row) => row.applicantNameAr === answers['full_name'])

  if (!submission) throw new Error('The submission did not arrive.')

  if (status !== 'NEW') {
    await request(app)
      .patch(`/api/admin/forms/${form.formId}/submissions/${submission.id}`)
      .set('authorization', bearer(token))
      .send({ status })
      .expect(200)
  }

  return submission.id
}
