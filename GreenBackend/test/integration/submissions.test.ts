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

describe.runIf(ready)('reading submissions', () => {
  let token = ''
  let formId = ''

  const field = (body: Record<string, unknown>) =>
    request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({ isRequired: false, options: [], ...body })
      .expect(201)

  const publish = () =>
    request(app)
      .post(`/api/admin/forms/${formId}/publish`)
      .set('authorization', bearer(token))
      .expect(200)

  const open = () =>
    request(app)
      .patch(`/api/admin/forms/${formId}`)
      .set('authorization', bearer(token))
      .send({ isAccepting: true })
      .expect(200)

  const submit = (answers: Record<string, unknown>) =>
    request(app)
      .post('/api/public/forms/join/submissions')
      .send({ answers })
      .expect(202)

  const list = (query = '') =>
    request(app)
      .get(`/api/admin/forms/${formId}/submissions${query}`)
      .set('authorization', bearer(token))
      .expect(200)

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })

    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    token = (await login('lead@greencities.test')).accessToken

    const created = await request(app)
      .post('/api/admin/forms')
      .set('authorization', bearer(token))
      .send({ slug: 'join', nameAr: 'استمارة الانضمام' })
      .expect(201)

    formId = created.body.data.id

    await field({
      key: 'full_name',
      labelAr: 'الاسم الكامل',
      type: 'TEXT',
      isRequired: true,
      contactRole: 'NAME',
    })
    await field({
      key: 'email',
      labelAr: 'البريد',
      type: 'EMAIL',
      isRequired: true,
      contactRole: 'EMAIL',
    })

    await publish()
    await open()
  })

  it('lists an application with the contact columns pulled out of it', async () => {
    await submit({ full_name: 'سارة المتطوعة', email: 'sara@example.com' })

    const response = await list()

    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      status: 'NEW',
      applicantNameAr: 'سارة المتطوعة',
      applicantEmail: 'sara@example.com',
      formVersion: 1,
    })
    expect(response.body.nextBefore).toBeNull()
  })

  it('filters by status and searches the extracted columns', async () => {
    await submit({ full_name: 'سارة المتطوعة', email: 'sara@example.com' })
    await submit({ full_name: 'ليان العمر', email: 'lian@example.com' })

    expect((await list('?q=ليان')).body.data).toHaveLength(1)
    expect((await list('?q=example.com')).body.data).toHaveLength(2)
    expect((await list('?status=ACCEPTED')).body.data).toHaveLength(0)
    expect((await list('?status=NEW')).body.data).toHaveLength(2)
  })

  /**
   * الأسئلة تتغيّر بين إصدار وآخر، وقراءة إجابة قديمة بسؤال جديد تنسب إلى
   * المتقدّم ما لم يُسأل عنه. الطلب يُقرأ بإصداره هو.
   */
  it('reads answers with the labels of the version they were sent on', async () => {
    await submit({ full_name: 'سارة المتطوعة', email: 'sara@example.com' })

    const before = (await list()).body.data[0]

    // إصدار جديد يعيد تسمية السؤال نفسه
    const detail = await request(app)
      .get(`/api/admin/forms/${formId}`)
      .set('authorization', bearer(token))
      .expect(200)

    const draftField = (
      detail.body.data.draft.fields as Array<{ id: string; key: string }>
    ).find((one) => one.key === 'full_name')!

    await request(app)
      .patch(`/api/admin/forms/${formId}/fields/${draftField.id}`)
      .set('authorization', bearer(token))
      .send({
        key: 'full_name',
        labelAr: 'الاسم الثلاثي كما في الهوية',
        type: 'TEXT',
        isRequired: true,
        options: [],
        contactRole: 'NAME',
      })
      .expect(200)

    await publish()

    const response = await request(app)
      .get(`/api/admin/forms/${formId}/submissions/${before.id}`)
      .set('authorization', bearer(token))
      .expect(200)

    const labels = (
      response.body.data.answers as Array<{ labelAr: string; valueAr: string }>
    ).map((one) => one.labelAr)

    expect(labels).toContain('الاسم الكامل')
    expect(labels).not.toContain('الاسم الثلاثي كما في الهوية')
    expect(response.body.data.formVersion).toBe(1)
  })

  it('moves a submission between states, and back', async () => {
    await submit({ full_name: 'سارة المتطوعة', email: 'sara@example.com' })

    const { id } = (await list()).body.data[0]

    const move = (status: string) =>
      request(app)
        .patch(`/api/admin/forms/${formId}/submissions/${id}`)
        .set('authorization', bearer(token))
        .send({ status })
        .expect(200)

    expect((await move('IN_REVIEW')).body.data.status).toBe('IN_REVIEW')
    expect((await move('REJECTED')).body.data.status).toBe('REJECTED')
    // العودة مسموحة: طلب يُدفن بنقرة خاطئة أسوأ من رسم انتقالات صارم.
    expect((await move('IN_REVIEW')).body.data.status).toBe('IN_REVIEW')
  })

  it('keeps the applications of one form out of another', async () => {
    await submit({ full_name: 'سارة المتطوعة', email: 'sara@example.com' })

    const other = await request(app)
      .post('/api/admin/forms')
      .set('authorization', bearer(token))
      .send({ slug: 'partners', nameAr: 'استمارة الشراكات' })
      .expect(201)

    const { id } = (await list()).body.data[0]

    await request(app)
      .get(`/api/admin/forms/${other.body.data.id}/submissions/${id}`)
      .set('authorization', bearer(token))
      .expect(404)

    const empty = await request(app)
      .get(`/api/admin/forms/${other.body.data.id}/submissions`)
      .set('authorization', bearer(token))
      .expect(200)

    expect(empty.body.data).toHaveLength(0)
  })

  it('turns away anonymous readers', async () => {
    await request(app)
      .get(`/api/admin/forms/${formId}/submissions`)
      .expect(401)
  })
})
