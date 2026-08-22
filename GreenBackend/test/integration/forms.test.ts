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

type Field = {
  id: string
  key: string
  displayOrder: number
  condition: { fieldKey: string; op: string; value?: unknown } | null
}

describe.runIf(ready)('form builder', () => {
  let token = ''

  async function createForm(slug = 'join') {
    const response = await request(app)
      .post('/api/admin/forms')
      .set('authorization', bearer(token))
      .send({ slug, nameAr: 'استمارة الانضمام' })
      .expect(201)

    return response.body.data
  }

  async function addField(
    formId: string,
    body: Record<string, unknown>,
    expected = 201,
  ) {
    return request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({ isRequired: false, options: [], ...body })
      .expect(expected)
  }

  beforeEach(async () => {
    await resetDatabase()
    await runSeed({ quiet: true })

    await createStaffUser({
      email: 'lead@greencities.test',
      roleSlug: 'PEOPLE',
      officeSlug: 'people',
    })

    token = (await login('lead@greencities.test')).accessToken
  })

  it('refuses a member without forms.view', async () => {
    await createStaffUser({ email: 'plain@greencities.test', roleSlug: 'MEMBER' })

    const session = await login('plain@greencities.test')

    await request(app)
      .get('/api/admin/forms')
      .set('authorization', bearer(session.accessToken))
      .expect(403)
  })

  it('opens a draft version with the form', async () => {
    const form = await createForm()

    expect(form.draft).toMatchObject({ version: 1, status: 'DRAFT' })
    expect(form.draft.fields).toEqual([])
    expect(form.publishedVersion).toBeNull()
  })

  it('rejects a duplicate slug', async () => {
    await createForm('join')

    await request(app)
      .post('/api/admin/forms')
      .set('authorization', bearer(token))
      .send({ slug: 'join', nameAr: 'أخرى' })
      .expect(409)
  })

  it('rejects a condition pointing at a later question', async () => {
    const form = await createForm()

    await addField(form.id, { key: 'full_name', labelAr: 'الاسم', type: 'TEXT' })

    // `city` لم يُضَف بعد، فالشرط عليه يشير إلى ما لا يسبقه.
    const response = await addField(
      form.id,
      {
        key: 'university',
        labelAr: 'الجامعة',
        type: 'TEXT',
        condition: { fieldKey: 'city', op: 'notEmpty' },
      },
      409,
    )

    expect(response.body.detail).toContain('غير موجود')
  })

  it('accepts a condition on an earlier question', async () => {
    const form = await createForm()

    await addField(form.id, {
      key: 'status',
      labelAr: 'الحالة',
      type: 'SINGLE_SELECT',
      options: [
        { value: 'STUDENT', labelAr: 'طالب' },
        { value: 'WORKING', labelAr: 'موظف' },
      ],
    })

    const response = await addField(form.id, {
      key: 'university',
      labelAr: 'الجامعة',
      type: 'TEXT',
      condition: { fieldKey: 'status', op: 'eq', value: 'STUDENT' },
    })

    expect(response.body.data.condition).toEqual({
      fieldKey: 'status',
      op: 'eq',
      value: 'STUDENT',
    })
    expect(response.body.data.displayOrder).toBe(2)
  })

  it('requires options for a select and forbids them elsewhere', async () => {
    const form = await createForm()

    await addField(
      form.id,
      { key: 'bad_select', labelAr: 'قائمة', type: 'SINGLE_SELECT' },
      422,
    )

    await addField(
      form.id,
      {
        key: 'bad_text',
        labelAr: 'نص',
        type: 'TEXT',
        options: [{ value: 'x', labelAr: 'س' }],
      },
      422,
    )
  })

  it('reorders questions and keeps the order unique', async () => {
    const form = await createForm()

    await addField(form.id, { key: 'q_a', labelAr: 'أ', type: 'TEXT' })
    await addField(form.id, { key: 'q_b', labelAr: 'ب', type: 'TEXT' })
    await addField(form.id, { key: 'q_c', labelAr: 'ج', type: 'TEXT' })

    const response = await request(app)
      .post(`/api/admin/forms/${form.id}/fields/reorder`)
      .set('authorization', bearer(token))
      .send({ keys: ['q_c', 'q_a', 'q_b'] })
      .expect(200)

    expect(
      response.body.data.map((field: Field) => [
        field.key,
        field.displayOrder,
      ]),
    ).toEqual([
      ['q_c', 1],
      ['q_a', 2],
      ['q_b', 3],
    ])
  })

  it('refuses a reorder that would break a condition', async () => {
    const form = await createForm()

    await addField(form.id, { key: 'first', labelAr: 'الأول', type: 'TEXT' })
    await addField(form.id, {
      key: 'second',
      labelAr: 'الثاني',
      type: 'TEXT',
      condition: { fieldKey: 'first', op: 'notEmpty' },
    })

    // قلب الترتيب يجعل الشرط يشير إلى سؤال صار بعده.
    await request(app)
      .post(`/api/admin/forms/${form.id}/fields/reorder`)
      .set('authorization', bearer(token))
      .send({ keys: ['second', 'first'] })
      .expect(409)
  })

  it('refuses deleting a question another one depends on', async () => {
    const form = await createForm()

    const first = await addField(form.id, {
      key: 'first',
      labelAr: 'الأول',
      type: 'TEXT',
    })

    await addField(form.id, {
      key: 'second',
      labelAr: 'الثاني',
      type: 'TEXT',
      condition: { fieldKey: 'first', op: 'notEmpty' },
    })

    await request(app)
      .delete(`/api/admin/forms/${form.id}/fields/${first.body.data.id}`)
      .set('authorization', bearer(token))
      .expect(409)
  })

  it('refuses opening intake before anything is published', async () => {
    const form = await createForm()

    const response = await request(app)
      .patch(`/api/admin/forms/${form.id}`)
      .set('authorization', bearer(token))
      .send({ isAccepting: true })
      .expect(409)

    expect(response.body.detail).toContain('نشر')
  })
})
