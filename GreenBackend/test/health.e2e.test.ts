import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from '../src/app.js'

describe('health API', () => {
  it('returns liveness information', async () => {
    const response = await request(app).get('/api/health').expect(200)

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'green-cities-api',
    })
    expect(response.headers['x-request-id']).toBeTypeOf('string')
  })

  it('returns RFC 9457-style JSON for missing routes', async () => {
    const response = await request(app).get('/api/missing').expect(404)

    expect(response.type).toBe('application/problem+json')
    expect(response.body).toMatchObject({
      title: 'ROUTE_NOT_FOUND',
      status: 404,
      instance: '/api/missing',
    })
  })
})
