import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { runSeed } from '../../src/db/seed.js'
import { bearer, createStaffUser, login } from '../helpers/auth.js'
import {
  closeTestDatabase,
  ensureTestDatabase,
  resetDatabase,
} from '../helpers/database.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

describe.runIf(ready)('signing an upload', () => {
  let director = ''
  let people = ''

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({
      adminEmail: 'director@greencities.test',
      adminPassword: 'correct-horse-battery-staple',
    })

    await createStaffUser({
      email: 'people@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    director = (await login('director@greencities.test')).accessToken
    people = (await login('people@greencities.test')).accessToken
  })

  const sign = (token: string, body: Record<string, unknown>) =>
    request(app)
      .post('/api/admin/uploads/sign')
      .set('authorization', bearer(token))
      .send(body)

  it('refuses a purpose the caller has no capability for', async () => {
    // مكتب شؤون الفريق يحرّر الاستمارات ولا يدير المبادرات.
    await sign(people, {
      purpose: 'INITIATIVE_COVER',
      contentType: 'image/png',
      size: 1024,
    }).expect(403)
  })

  it('refuses a type outside the allow list before touching storage', async () => {
    await sign(director, {
      purpose: 'FORM_COVER',
      contentType: 'image/svg+xml',
      size: 1024,
    }).expect(422)
  })

  it('refuses a file past the cap', async () => {
    await sign(director, {
      purpose: 'FORM_COVER',
      contentType: 'image/png',
      size: 5 * 1024 * 1024 + 1,
    }).expect(422)
  })

  /**
   * بيئة الاختبار بلا مفاتيح تخزين عمدًا: الرفع ميزة، وغيابها يجب أن يقول
   * ذلك صراحةً لا أن يُسقط الخادم أو يُرجع خطأ غامضًا.
   */
  it('says storage is unconfigured instead of failing obscurely', async () => {
    const response = await sign(director, {
      purpose: 'FORM_COVER',
      contentType: 'image/png',
      size: 1024,
    })

    expect([201, 422]).toContain(response.status)

    if (response.status === 422) {
      expect(response.body.detail).toContain('تخزين الملفات غير مهيّأ')
    } else {
      expect(response.body.data.uploadUrl).toContain('http')
    }
  })

  it('turns away anonymous callers', async () => {
    await request(app)
      .post('/api/admin/uploads/sign')
      .send({ purpose: 'FORM_COVER', contentType: 'image/png', size: 1024 })
      .expect(401)
  })
})
