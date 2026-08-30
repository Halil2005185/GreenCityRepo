import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { outboxJobs } from '../../src/db/schema/outbox.js'
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

describe.runIf(ready)('public intake', () => {
  let token = ''
  let formId = ''

  const field = (body: Record<string, unknown>) =>
    request(app)
      .post(`/api/admin/forms/${formId}/fields`)
      .set('authorization', bearer(token))
      .send({ isRequired: false, options: [], ...body })
      .expect(201)

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
    await field({
      key: 'status',
      labelAr: 'وضعك',
      type: 'SINGLE_SELECT',
      isRequired: true,
      options: [
        { value: 'STUDENT', labelAr: 'طالب' },
        { value: 'WORKING', labelAr: 'موظف' },
      ],
    })
    await field({
      key: 'university',
      labelAr: 'جامعتك',
      type: 'TEXT',
      condition: { fieldKey: 'status', op: 'eq', value: 'STUDENT' },
    })
  })

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

  const submit = (answers: Record<string, unknown>, expected: number) =>
    request(app)
      .post('/api/public/forms/join/submissions')
      .send({ answers })
      .expect(expected)

  const submitAsking = (answers: Record<string, unknown>) =>
    request(app)
      .post('/api/public/forms/join/submissions')
      .send({ answers, sendCopy: true })
      .expect(202)

  const copies = () =>
    db.select().from(outboxJobs).then((rows) =>
      rows.filter((row) => row.templateKey === 'form-copy'),
    )

  const valid = {
    full_name: 'سارة المتطوعة',
    email: 'Sara@Example.COM',
    status: 'STUDENT',
    university: 'جامعة دمشق',
  }

  it('hides an unpublished form behind the same 404 as a missing one', async () => {
    await request(app).get('/api/public/forms/join').expect(404)
    await request(app).get('/api/public/forms/does-not-exist').expect(404)
  })

  it('serves the published form without internal identifiers', async () => {
    await publish()

    const response = await request(app)
      .get('/api/public/forms/join')
      .expect(200)

    expect(response.body.data.nameAr).toBe('استمارة الانضمام')
    expect(response.body.data.fields).toHaveLength(4)
    expect(response.body.data.fields[0]).not.toHaveProperty('id')
    expect(JSON.stringify(response.body)).not.toContain(formId)
  })

  it('refuses submissions while intake is closed', async () => {
    await publish()

    await submit(valid, 409)
  })

  it('accepts a valid submission with 202 and no body', async () => {
    await publish()
    await open()

    const response = await submit(valid, 202)

    expect(response.text).toBe('')
  })

  it('extracts the contact columns and normalises the email', async () => {
    await publish()
    await open()
    await submit(valid, 202)

    const list = await request(app)
      .get('/api/public/forms/join')
      .expect(200)

    expect(list.body.data.isAccepting).toBe(true)
  })

  it('rejects a missing required answer', async () => {
    await publish()
    await open()

    const response = await submit(
      { email: 'a@b.co', status: 'STUDENT' },
      422,
    )

    expect(
      response.body.details.some(
        (issue: { path: string }) => issue.path === 'full_name',
      ),
    ).toBe(true)
  })

  it('rejects an answer to a hidden question instead of ignoring it', async () => {
    await publish()
    await open()

    const response = await submit(
      { ...valid, status: 'WORKING', university: 'جامعة حلب' },
      422,
    )

    expect(
      response.body.details.some(
        (issue: { path: string }) => issue.path === 'university',
      ),
    ).toBe(true)
  })

  it('rejects a choice outside the published options', async () => {
    await publish()
    await open()

    await submit({ ...valid, status: 'RETIRED', university: undefined }, 422)
  })

  it('rejects a key that belongs to no question', async () => {
    await publish()
    await open()

    const response = await submit({ ...valid, salary: 999 }, 422)

    expect(
      response.body.details.some(
        (issue: { path: string }) => issue.path === 'salary',
      ),
    ).toBe(true)
  })

  it('rejects a malformed email', async () => {
    await publish()
    await open()

    await submit({ ...valid, email: 'not-an-email' }, 422)
  })

  it('sends catalog options with reference questions', async () => {
    await field({
      key: 'governorate',
      labelAr: 'المحافظة',
      type: 'AREA_REF',
    })
    await publish()

    const response = await request(app)
      .get('/api/public/forms/join')
      .expect(200)

    const reference = (
      response.body.data.fields as Array<{
        key: string
        type: string
        options: Array<{ value: string; labelAr: string }>
      }>
    ).find((one) => one.key === 'governorate')

    /**
     * بلا هذه الخيارات يصير سؤال المحافظة حقل نصّ حرّ أمام الزائر بينما هو
     * قائمة في معاينة اللوحة — وهو ما كان يحدث.
     */
    expect(reference?.type).toBe('AREA_REF')
    expect(reference!.options.length).toBeGreaterThan(0)
    expect(reference!.options[0]!.value).toMatch(/^[0-9a-f-]{36}$/)
    expect(reference!.options.map((one) => one.labelAr)).toContain('دمشق')
  })

  it('marks the contact email so the page knows a copy is possible', async () => {
    await publish()

    const response = await request(app)
      .get('/api/public/forms/join')
      .expect(200)

    const fields = response.body.data.fields as Array<{
      type: string
      isContactEmail: boolean
    }>

    expect(fields.find((one) => one.type === 'EMAIL')?.isContactEmail).toBe(true)
    expect(fields.filter((one) => one.isContactEmail)).toHaveLength(1)
  })

  it('queues a copy to the applicant when asked, with readable answers', async () => {
    await publish()
    await open()
    await submitAsking(valid)

    const queued = await copies()

    expect(queued).toHaveLength(1)
    // العنوان المطبَّع لا ما كُتب: النسخة تذهب إلى ما حُفظ في الطلب.
    expect(queued[0]!.recipient).toBe('sara@example.com')

    const payload = queued[0]!.payload as {
      formNameAr: string
      items: Array<{ labelAr: string; valueAr: string }>
    }

    expect(payload.formNameAr).toBe('استمارة الانضمام')
    // نص السؤال ونص الخيار لا مفتاحيهما: الرسالة تُقرأ لا تُفكّك.
    expect(payload.items).toContainEqual({
      labelAr: 'الاسم الكامل',
      valueAr: 'سارة المتطوعة',
    })
  })

  it('queues nothing when the applicant did not ask for a copy', async () => {
    await publish()
    await open()
    await submit(valid, 202)

    expect(await copies()).toHaveLength(0)
  })
})
