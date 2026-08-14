import { eq } from 'drizzle-orm'
import request from 'supertest'

import { app } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { db } from '../../src/db/client.js'
import { memberships } from '../../src/db/schema/access.js'
import { users } from '../../src/db/schema/identity.js'
import { offices, roles } from '../../src/db/schema/org.js'
import { hashPassword } from '../../src/modules/auth/password.service.js'

/** كلمة مرور موحّدة للاختبارات — تتجاوز حد الاثني عشر محرفًا. */
export const TEST_PASSWORD = 'correct-horse-battery-staple'

export async function createStaffUser(options: {
  email: string
  roleSlug: string
  officeSlug?: string
  password?: string
  fullNameAr?: string
  status?: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
}) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, options.roleSlug))
    .limit(1)

  if (!role) throw new Error(`Seed role "${options.roleSlug}" is missing.`)

  const [office] = await db
    .select({ id: offices.id })
    .from(offices)
    .where(eq(offices.slug, options.officeSlug ?? 'tech'))
    .limit(1)

  if (!office) throw new Error(`Seed office "${options.officeSlug}" is missing.`)

  const passwordHash = await hashPassword(options.password ?? TEST_PASSWORD)

  const [user] = await db
    .insert(users)
    .values({
      email: options.email,
      passwordHash,
      fullNameAr: options.fullNameAr ?? 'عضو اختبار',
      kind: 'STAFF',
      status: options.status ?? 'ACTIVE',
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id })

  if (!user) throw new Error('Failed to create the test user.')

  await db.insert(memberships).values({
    userId: user.id,
    officeId: office.id,
    roleId: role.id,
    isPrimary: true,
  })

  return { userId: user.id, email: options.email, roleId: role.id, officeId: office.id }
}

export type LoggedIn = {
  accessToken: string
  refreshCookie: string
  body: {
    accessToken: string
    expiresInSeconds: number
    user: {
      id: string
      email: string
      fullNameAr: string
      kind: string
      capabilities: string[]
      memberships: unknown[]
    }
  }
}

/** يستخرج كوكي التحديث من الرد ليعاد إرساله في الطلبات التالية. */
export function extractRefreshCookie(setCookie: string[] | undefined) {
  const raw = setCookie?.find((cookie) =>
    cookie.startsWith(`${env.AUTH_COOKIE_NAME}=`),
  )

  if (!raw) throw new Error('Refresh cookie is missing from the response.')

  return raw.split(';')[0] ?? ''
}

export async function login(
  email: string,
  password = TEST_PASSWORD,
): Promise<LoggedIn> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200)

  return {
    accessToken: response.body.accessToken,
    refreshCookie: extractRefreshCookie(
      response.headers['set-cookie'] as unknown as string[] | undefined,
    ),
    body: response.body,
  }
}

export const bearer = (token: string) => `Bearer ${token}`
