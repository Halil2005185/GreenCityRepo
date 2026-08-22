import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import { memberships } from '../../db/schema/access.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import type { ListPeopleQuery } from './people.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العضو غير موجود.')
  }

  return value
}

const membershipColumns = {
  id: memberships.id,
  userId: memberships.userId,
  officeId: memberships.officeId,
  officeSlug: offices.slug,
  officeNameAr: offices.nameAr,
  roleId: memberships.roleId,
  roleSlug: roles.slug,
  roleNameAr: roles.nameAr,
  isPrimary: memberships.isPrimary,
  status: memberships.status,
  startedAt: memberships.startedAt,
  endedAt: memberships.endedAt,
}

const userColumns = {
  id: users.id,
  email: users.email,
  fullNameAr: users.fullNameAr,
  status: users.status,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
}

/**
 * العضويات في استعلام ثانٍ لا في ضمّ واحد.
 *
 * الضمّ يكرر صف المستخدم بعدد عضوياته، فيحتاج تجميعًا في SQL أو تفكيكًا
 * في الكود على كل حال — والاستعلامان أوضح ولا يخاطران بعدّ خاطئ حين
 * يُضاف ترقيم صفحات لاحقًا.
 */
async function membershipsFor(userIds: string[], includeEnded: boolean) {
  if (userIds.length === 0) return new Map<string, unknown[]>()

  const rows = await db
    .select(membershipColumns)
    .from(memberships)
    .innerJoin(offices, eq(memberships.officeId, offices.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        inArray(memberships.userId, userIds),
        includeEnded ? undefined : eq(memberships.status, 'ACTIVE'),
      ),
    )
    // الرئيسي أولًا ثم النشط ثم الأحدث بدءًا.
    .orderBy(
      desc(memberships.isPrimary),
      asc(memberships.status),
      desc(memberships.startedAt),
    )

  const byUser = new Map<string, Array<Omit<(typeof rows)[number], 'userId'>>>()

  for (const { userId, ...membership } of rows) {
    const list = byUser.get(userId) ?? []
    list.push(membership)
    byUser.set(userId, list)
  }

  return byUser
}

export const getPeople: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListPeopleQuery

  /**
   * `kind = STAFF` شرط ثابت لا مرشّح اختياري: ممثلو الشركاء مستخدمون
   * أيضًا، لكن نطاقهم جهتهم لا مكتبًا — وإظهارهم في دليل الفريق يخلط
   * سجلين مختلفي المعنى والصلاحية.
   */
  const conditions = [
    eq(users.kind, 'STAFF'),
    query.status ? eq(users.status, query.status) : undefined,
    query.q
      ? or(
          ilike(users.fullNameAr, `%${query.q}%`),
          ilike(users.email, `%${query.q}%`),
        )
      : undefined,
  ]

  // التصفية بالمكتب تمر عبر عضوية نشطة، فتحتاج وجودًا لا ضمًّا.
  const officeFilter = query.officeId
    ? db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.officeId, query.officeId),
            eq(memberships.status, 'ACTIVE'),
          ),
        )
    : null

  const rows = await db
    .select(userColumns)
    .from(users)
    .where(
      and(
        ...conditions,
        officeFilter ? inArray(users.id, officeFilter) : undefined,
      ),
    )
    .orderBy(asc(users.fullNameAr))

  const byUser = await membershipsFor(
    rows.map((row) => row.id),
    false,
  )

  const data = rows.map((row) => ({
    ...row,
    memberships: byUser.get(row.id) ?? [],
  }))

  response.status(200).json({ data })
}

export const getPerson: RequestHandler = async (request, response) => {
  const id = readId(request)

  const [row] = await db
    .select(userColumns)
    .from(users)
    .where(and(eq(users.id, id), eq(users.kind, 'STAFF')))
    .limit(1)

  if (!row) throw errors.notFound('العضو غير موجود.')

  const byUser = await membershipsFor([row.id], true)

  response
    .status(200)
    .json({ data: { ...row, memberships: byUser.get(row.id) ?? [] } })
}
