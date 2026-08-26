import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { runSeed } from '../../src/db/seed.js'
import { TEST_PASSWORD, bearer, login } from '../helpers/auth.js'
import {
  closeTestDatabase,
  ensureTestDatabase,
  resetDatabase,
} from '../helpers/database.js'
import {
  addSite,
  createInitiative,
  programIdBySlug,
} from '../helpers/operational.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

async function bootstrap() {
  await resetDatabase()
  await runSeed({
    adminEmail: 'director@greencities.test',
    adminPassword: TEST_PASSWORD,
  })

  return (await login('director@greencities.test')).accessToken
}

function listPoints(token: string) {
  return request(app)
    .get('/api/admin/map/points')
    .set('authorization', bearer(token))
    .expect(200)
}

function listAreas(token: string) {
  return request(app)
    .get('/api/admin/map/areas')
    .set('authorization', bearer(token))
    .expect(200)
}

describe.runIf(ready)('map deletion and hiding', () => {
  let director: string

  beforeEach(async () => {
    director = await bootstrap()
  })

  it('erases a green point documented by mistake, and its count with it', async () => {
    const areas = await listAreas(director)
    const area = areas.body.data[0] as { id: string; greenPointCount: number }
    const metric = await request(app)
      .get('/api/admin/metrics')
      .set('authorization', bearer(director))
      .expect(200)

    const created = await request(app)
      .post('/api/admin/map/green-points')
      .set('authorization', bearer(director))
      .send({
        nameAr: 'تشجير مدخل الحي',
        contributorNameAr: 'فريق أصدقاء الحي',
        areaId: area.id,
        lat: 33.5,
        lng: 36.3,
        metricId: (metric.body.data as Array<{ id: string }>)[0]?.id,
        metricValue: 40,
      })
      .expect(201)

    const before = await listPoints(director)

    expect(
      (before.body.data as Array<{ siteId: string }>).some(
        (point) => point.siteId === created.body.siteId,
      ),
    ).toBe(true)

    await request(app)
      .delete(`/api/admin/map/green-points/${created.body.siteId}`)
      .set('authorization', bearer(director))
      .expect(204)

    const after = await listPoints(director)

    expect(
      (after.body.data as Array<{ siteId: string }>).some(
        (point) => point.siteId === created.body.siteId,
      ),
    ).toBe(false)

    // العدّاد يقرأ ما تقرأه الخريطة: لو بقي مرتفعًا لظهرت محافظة بنقاط لا تُرى.
    const areasAfter = await listAreas(director)
    const areaAfter = (
      areasAfter.body.data as Array<{ id: string; greenPointCount: number }>
    ).find((row) => row.id === area.id)

    expect(areaAfter?.greenPointCount).toBe(area.greenPointCount)
  })

  it('refuses to erase a campaign site through the green point route', async () => {
    const program = await programIdBySlug('tree-planting')
    const initiative = await createInitiative(director, {
      programId: program.id,
      nameAr: 'حملة تشجير الميدان',
    })
    const site = await addSite(director, initiative.id, {
      nameAr: 'حديقة تشرين',
      lat: 33.52,
      lng: 36.28,
    })

    await request(app)
      .delete(`/api/admin/map/green-points/${site.id}`)
      .set('authorization', bearer(director))
      .expect(422)
  })

  it('drops a cancelled initiative off the map without erasing it', async () => {
    const program = await programIdBySlug('tree-planting')
    const initiative = await createInitiative(director, {
      programId: program.id,
      nameAr: 'حملة تشجير المزة',
    })
    const site = await addSite(director, initiative.id, {
      nameAr: 'ساحة المزة',
      lat: 33.51,
      lng: 36.24,
    })

    const before = await listPoints(director)

    expect(
      (before.body.data as Array<{ siteId: string }>).some(
        (point) => point.siteId === site.id,
      ),
    ).toBe(true)

    await request(app)
      .post(`/api/admin/initiatives/${initiative.id}/cancel`)
      .set('authorization', bearer(director))
      .expect(200)

    const after = await listPoints(director)

    expect(
      (after.body.data as Array<{ siteId: string }>).some(
        (point) => point.siteId === site.id,
      ),
    ).toBe(false)

    // مخفيةٌ لا ممحوّة: السجل يبقى لمن يقرأ التاريخ.
    await request(app)
      .get(`/api/admin/initiatives/${initiative.id}`)
      .set('authorization', bearer(director))
      .expect(200)
  })
})
