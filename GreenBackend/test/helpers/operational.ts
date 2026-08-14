import { eq } from 'drizzle-orm'
import request from 'supertest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { metrics } from '../../src/db/schema/metrics.js'
import { programs } from '../../src/db/schema/programs.js'
import { bearer } from './auth.js'

export async function programIdBySlug(slug: string) {
  const [row] = await db
    .select({ id: programs.id, rollup: programs.defaultTargetRollup })
    .from(programs)
    .where(eq(programs.slug, slug))
    .limit(1)

  if (!row) throw new Error(`Seed program "${slug}" is missing.`)

  return row
}

export async function metricIdBySlug(slug: string) {
  const [row] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(eq(metrics.slug, slug))
    .limit(1)

  if (!row) throw new Error(`Seed metric "${slug}" is missing.`)

  return row.id
}

export async function createInitiative(
  token: string,
  body: Record<string, unknown>,
) {
  const response = await request(app)
    .post('/api/admin/initiatives')
    .set('authorization', bearer(token))
    .send(body)
    .expect(201)

  return response.body as Record<string, any>
}

/**
 * كل مسارات الكتابة تعيد ملف المبادرة الكامل لا المورد المُنشأ، تمامًا كما
 * في وحدة الشركاء. فالموقع الجديد يُلتقط من القائمة العائدة باسمه — وأخذ
 * `body.id` مباشرة يعطي معرّف المبادرة لا الموقع.
 */
export async function addSite(
  token: string,
  initiativeId: string,
  body: { nameAr: string } & Record<string, unknown>,
) {
  const response = await request(app)
    .post(`/api/admin/initiatives/${initiativeId}/sites`)
    .set('authorization', bearer(token))
    .send(body)
    .expect(201)

  const site = (
    response.body.sites as Array<{ id: string; nameAr: string }>
  ).find((candidate) => candidate.nameAr === body.nameAr)

  if (!site) throw new Error(`Site "${body.nameAr}" missing from the response.`)

  return site
}

export function setInitiativeTarget(
  token: string,
  initiativeId: string,
  metricId: string,
  value: number,
) {
  return request(app)
    .put(`/api/admin/initiatives/${initiativeId}/targets`)
    .set('authorization', bearer(token))
    .send({ metricId, value })
}

export function setSiteTarget(
  token: string,
  initiativeId: string,
  siteId: string,
  metricId: string,
  value: number,
) {
  return request(app)
    .put(`/api/admin/initiatives/${initiativeId}/sites/${siteId}/targets`)
    .set('authorization', bearer(token))
    .send({ metricId, value })
}

export function recordImpact(
  token: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post('/api/admin/impact/entries')
    .set('authorization', bearer(token))
    .send(body)
}

/** يسجّل قيدًا ثم يوثّقه، لأن غير الموثّق لا يدخل المجاميع. */
export async function recordVerifiedImpact(
  token: string,
  body: Record<string, unknown>,
) {
  const created = await recordImpact(token, body).expect(201)
  const id = created.body.id as string

  await request(app)
    .post(`/api/admin/impact/entries/${id}/verify`)
    .set('authorization', bearer(token))
    .expect(200)

  return id
}

export function getInitiative(token: string, initiativeId: string) {
  return request(app)
    .get(`/api/admin/initiatives/${initiativeId}`)
    .set('authorization', bearer(token))
}
