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

describe.runIf(ready)('publishing', () => {
  let token = ''

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

  async function seedForm() {
    const created = await request(app)
      .post('/api/admin/forms')
      .set('authorization', bearer(token))
      .send({ slug: 'join', nameAr: 'الانضمام' })
      .expect(201)

    const formId = created.body.data.id as string

    await request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({
        key: 'full_name',
        labelAr: 'الاسم',
        type: 'TEXT',
        isRequired: true,
        options: [],
      })
      .expect(201)

    return formId
  }

  const publish = (formId: string, expected = 200) =>
    request(app)
      .post(`/api/admin/forms/${formId}/publish`)
      .set('authorization', bearer(token))
      .expect(expected)

  it('refuses publishing a draft with no questions', async () => {
    const created = await request(app)
      .post('/api/admin/forms')
      .set('authorization', bearer(token))
      .send({ slug: 'empty', nameAr: 'فارغة' })
      .expect(201)

    await publish(created.body.data.id, 409)
  })

  it('freezes the draft and opens the next one with copied questions', async () => {
    const formId = await seedForm()

    const response = await publish(formId)

    expect(response.body.data.published).toMatchObject({
      version: 1,
      status: 'PUBLISHED',
    })
    expect(response.body.data.published.fields).toHaveLength(1)

    // المسوّدة التالية مفتوحة فورًا بنسخة من الأسئلة.
    expect(response.body.data.draft).toMatchObject({
      version: 2,
      status: 'DRAFT',
    })
    expect(response.body.data.draft.fields[0].key).toBe('full_name')
  })

  it('keeps the published version untouched when the new draft changes', async () => {
    const formId = await seedForm()

    await publish(formId)

    const detail = await request(app)
      .get(`/api/admin/forms/${formId}`)
      .set('authorization', bearer(token))
      .expect(200)

    const draftFieldId = detail.body.data.draft.fields[0].id as string

    await request(app)
      .patch(`/api/admin/forms/${formId}/fields/${draftFieldId}`)
      .set('authorization', bearer(token))
      .send({
        key: 'full_name',
        labelAr: 'الاسم الكامل بعد التعديل',
        type: 'TEXT',
        isRequired: true,
        options: [],
      })
      .expect(200)

    const after = await request(app)
      .get(`/api/admin/forms/${formId}`)
      .set('authorization', bearer(token))
      .expect(200)

    expect(after.body.data.draft.fields[0].labelAr).toBe(
      'الاسم الكامل بعد التعديل',
    )
    // المجمَّد لا يتأثر — وهذا كل الغرض من الإصدارات.
    expect(after.body.data.published.fields[0].labelAr).toBe('الاسم')
  })

  it('archives the previous version on a second publish', async () => {
    const formId = await seedForm()

    await publish(formId)
    const second = await publish(formId)

    expect(second.body.data.published.version).toBe(2)
    expect(second.body.data.draft.version).toBe(3)
  })

  it('opens intake only after something is published', async () => {
    const formId = await seedForm()

    await request(app)
      .patch(`/api/admin/forms/${formId}`)
      .set('authorization', bearer(token))
      .send({ isAccepting: true })
      .expect(409)

    await publish(formId)

    const opened = await request(app)
      .patch(`/api/admin/forms/${formId}`)
      .set('authorization', bearer(token))
      .send({ isAccepting: true })
      .expect(200)

    expect(opened.body.data.isAccepting).toBe(true)
  })
})

describe.runIf(ready)('field limits', () => {
  let token = ''
  let formId = ''

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
      .send({ slug: 'join', nameAr: 'الانضمام' })
      .expect(201)

    formId = created.body.data.id
  })

  const post = (body: Record<string, unknown>, expected: number) =>
    request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({ isRequired: false, options: [], ...body })
      .expect(expected)

  const domains = [
    { value: 'ENG', labelAr: 'الهندسة' },
    { value: 'ENV', labelAr: 'البيئة' },
    { value: 'MEDIA', labelAr: 'الإعلام' },
  ]

  it('stores selection limits on a multi select', async () => {
    const response = await post(
      {
        key: 'skill_domains',
        labelAr: 'المجالات',
        type: 'MULTI_SELECT',
        options: domains,
        minSelections: 1,
        maxSelections: 2,
      },
      201,
    )

    expect(response.body.data).toMatchObject({
      minSelections: 1,
      maxSelections: 2,
    })
  })

  it('refuses selection limits on types that cannot use them', async () => {
    await post(
      { key: 'full_name', labelAr: 'الاسم', type: 'TEXT', minSelections: 1 },
      422,
    )
  })

  it('refuses a maximum below the minimum', async () => {
    await post(
      {
        key: 'skill_domains',
        labelAr: 'المجالات',
        type: 'MULTI_SELECT',
        options: domains,
        minSelections: 3,
        maxSelections: 2,
      },
      422,
    )
  })

  it('refuses a maximum larger than the option count', async () => {
    await post(
      {
        key: 'skill_domains',
        labelAr: 'المجالات',
        type: 'MULTI_SELECT',
        options: domains,
        maxSelections: 9,
      },
      422,
    )
  })

  it('stores a character limit on text and refuses it elsewhere', async () => {
    const response = await post(
      {
        key: 'green_city_idea',
        labelAr: 'ماذا ستغيّر؟',
        type: 'LONG_TEXT',
        maxLength: 500,
      },
      201,
    )

    expect(response.body.data.maxLength).toBe(500)

    await post(
      { key: 'joined_at', labelAr: 'التاريخ', type: 'DATE', maxLength: 500 },
      422,
    )
  })

  it('accepts the new URL type', async () => {
    const response = await post(
      {
        key: 'professional_links',
        labelAr: 'روابطك المهنية',
        type: 'URL',
      },
      201,
    )

    expect(response.body.data.type).toBe('URL')
  })

  it('carries the limits into the next draft on publish', async () => {
    await post(
      {
        key: 'skill_domains',
        labelAr: 'المجالات',
        type: 'MULTI_SELECT',
        options: domains,
        minSelections: 1,
        maxSelections: 2,
      },
      201,
    )

    const published = await request(app)
      .post(`/api/admin/forms/${formId}/publish`)
      .set('authorization', bearer(token))
      .expect(200)

    expect(published.body.data.draft.fields[0]).toMatchObject({
      minSelections: 1,
      maxSelections: 2,
    })
  })
})

describe.runIf(ready)('editing a question', () => {
  let token = ''
  let formId = ''

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
  })

  const addField = (body: Record<string, unknown>) =>
    request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({ isRequired: false, options: [], ...body })

  it('changes the contact role of a question that already exists', async () => {
    const created = await addField({
      key: 'email',
      labelAr: 'البريد',
      type: 'EMAIL',
    }).expect(201)

    expect(created.body.data.contactRole).toBeNull()

    const updated = await request(app)
      .patch(`/api/admin/forms/${formId}/fields/${created.body.data.id}`)
      .set('authorization', bearer(token))
      .send({
        key: 'email',
        labelAr: 'البريد الإلكتروني',
        type: 'EMAIL',
        isRequired: true,
        options: [],
        contactRole: 'EMAIL',
      })
      .expect(200)

    // الدور كان يسقط من التعديل، فلا يُضبط إلا عند الإنشاء.
    expect(updated.body.data.contactRole).toBe('EMAIL')

    const cleared = await request(app)
      .patch(`/api/admin/forms/${formId}/fields/${created.body.data.id}`)
      .set('authorization', bearer(token))
      .send({
        key: 'email',
        labelAr: 'البريد الإلكتروني',
        type: 'EMAIL',
        isRequired: true,
        options: [],
      })
      .expect(200)

    expect(cleared.body.data.contactRole).toBeNull()
  })

  it('refuses to hand one role to two questions, and names the holder', async () => {
    await addField({
      key: 'email',
      labelAr: 'البريد',
      type: 'EMAIL',
      contactRole: 'EMAIL',
    }).expect(201)

    const second = await addField({
      key: 'work_email',
      labelAr: 'بريد العمل',
      type: 'EMAIL',
      contactRole: 'EMAIL',
    }).expect(409)

    expect(second.body.detail).toContain('البريد')
  })
})
