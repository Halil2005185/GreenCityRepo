import { createHash, randomBytes } from 'node:crypto'

import { SignJWT, jwtVerify } from 'jose'

import { errors } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'

const ISSUER = 'green-cities'
const AUDIENCE = 'green-cities-api'

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)

export type AccessTokenClaims = {
  userId: string
  kind: 'STAFF' | 'PARTNER'
  tokenVersion: number
}

/**
 * رمز الوصول يحمل الحد الأدنى: من هو، ونوعه، ونسخة رمزه.
 *
 * لا يحمل القدرات عمدًا. القدرات تُحل من القاعدة في كل طلب، وإلا بقي
 * موظفٌ سُحبت صلاحيته يعمل بها حتى انتهاء الرمز. وبما أن التحقق من
 * `tokenVersion` يستدعي قراءة المستخدم أصلًا، فحل القدرات معها لا يكلف
 * استعلامًا إضافيًا يُذكر.
 */
export async function signAccessToken(claims: AccessTokenClaims) {
  const expiresInSeconds = env.ACCESS_TOKEN_TTL_MINUTES * 60

  const token = await new SignJWT({
    kind: claims.kind,
    tv: claims.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(accessSecret)

  return { token, expiresInSeconds }
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    })

    const kind = payload['kind']
    const tokenVersion = payload['tv']

    if (
      typeof payload.sub !== 'string' ||
      (kind !== 'STAFF' && kind !== 'PARTNER') ||
      typeof tokenVersion !== 'number'
    ) {
      throw errors.unauthorized('رمز الوصول غير صالح.')
    }

    return { userId: payload.sub, kind, tokenVersion }
  } catch (error) {
    if (error instanceof Error && error.name === 'JWTExpired') {
      throw errors.unauthorized('انتهت صلاحية الجلسة. جدّد الدخول.')
    }

    throw errors.unauthorized('رمز الوصول غير صالح.')
  }
}

/**
 * رمز التحديث قيمة عشوائية معتمة لا JWT: إبطاله فوري بحذف صفه، بينما
 * إبطال JWT قبل انتهائه يحتاج قائمة سوداء تعادل الجدول نفسه.
 *
 * 256 بت من `randomBytes` — مولّد آمن تشفيريًا لا `Math.random`.
 */
export function generateOpaqueToken() {
  const token = randomBytes(32).toString('base64url')

  return { token, tokenHash: hashToken(token) }
}

/**
 * SHA-256 لا Argon2 هنا. الرمز عشوائي بإنتروبيا 256 بت لا كلمة مرور
 * بشرية، فلا يوجد ما يُخمَّن بالقوة الغاشمة، والبحث في القاعدة يحتاج
 * جزءًا حتميًا. Argon2 بملحه العشوائي يمنع البحث بالفهرس أصلًا.
 */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiry(from = new Date()) {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000)
}

export function invitationExpiry(from = new Date()) {
  return new Date(from.getTime() + env.INVITATION_TTL_HOURS * 3_600_000)
}

export function passwordResetExpiry(from = new Date()) {
  return new Date(from.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60_000)
}
