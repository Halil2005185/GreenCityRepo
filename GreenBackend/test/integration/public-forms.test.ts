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
})
