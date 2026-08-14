import { describe, expect, it } from 'vitest'

import { AppError } from '../../src/common/errors/app-error.js'
import {
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/modules/auth/token.service.js'

describe('access tokens', () => {
  it('round-trips the claims it was signed with', async () => {
    const { token, expiresInSeconds } = await signAccessToken({
      userId: '11111111-2222-3333-4444-555555555555',
      kind: 'STAFF',
      tokenVersion: 7,
    })

    expect(expiresInSeconds).toBeGreaterThan(0)

    const claims = await verifyAccessToken(token)

    expect(claims).toEqual({
      userId: '11111111-2222-3333-4444-555555555555',
      kind: 'STAFF',
      tokenVersion: 7,
    })
  })

  it('rejects a tampered signature', async () => {
    const { token } = await signAccessToken({
      userId: '11111111-2222-3333-4444-555555555555',
      kind: 'STAFF',
      tokenVersion: 0,
    })

    const [header, payload] = token.split('.')
    const forged = `${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

    await expect(verifyAccessToken(forged)).rejects.toBeInstanceOf(AppError)
  })

  it('rejects a token that is not a JWT at all', async () => {
    await expect(verifyAccessToken('not-a-token')).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe('opaque refresh tokens', () => {
  it('produces a fresh value every call with a matching hash', () => {
    const first = generateOpaqueToken()
    const second = generateOpaqueToken()

    expect(first.token).not.toBe(second.token)
    expect(first.tokenHash).toBe(hashToken(first.token))
    // كل رمز 256 بت مُرمَّز base64url، فطوله 43 محرفًا.
    expect(first.token.length).toBe(43)
  })

  it('hashes to a stable 64-character hex digest', () => {
    expect(hashToken('sample')).toBe(hashToken('sample'))
    expect(hashToken('sample')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('sample')).not.toBe(hashToken('sample '))
  })
})
