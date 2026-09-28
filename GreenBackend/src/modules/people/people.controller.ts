import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import { memberships } from '../../db/schema/access.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import type { AuthContext } from '../access/access.service.js'
import { canGrantRole } from '../access/capabilities.js'
import { requestTrace, recordAudit } from '../audit/audit.service.js'
import type {
  AddMembershipBody,
  ListPeopleQuery,
  UpdateMembershipBody,
} from './people.schemas.js'

function readId(
  request: Request,
  key = 'id',
  notFoundMessage = 'العضو غير موجود.',
) {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound(notFoundMessage)
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

/**
 * حارسا العضويات فوق `roles.manage` على مستوى المسار. تلك القدرة يحملها
 * المدير العام ومسؤول القسم التقني معًا، فلا تكفي وحدها:
 *
 * - لا يعدّل أحد عضوياته بنفسه — لا يرفع نفسه، ولا يُنهي عضويته الوحيدة
 *   فيُغلق اللوحة على نفسه.
 * - لا يمنح دورًا أوسع مما يحمله، ولا يمسّ عضوية بدور كهذا (`canGrantRole`).
 */
function assertNotSelf(actor: AuthContext, userId: string) {
  if (actor.userId === userId) {
    throw errors.forbidden('لا يمكنك تعديل عضوياتك بنفسك؛ يتولاها مسؤول آخر.')
  }
}

function assertCanGrant(
  actor: AuthContext,
  role: { nameAr: string; capabilities: readonly string[] },
) {
  if (!canGrantRole(actor.capabilities, role.capabilities)) {
    throw errors.forbidden(
      `دور «${role.nameAr}» يحمل صلاحيات لا تملكها، فلا يمكنك منحه ولا تعديل عضويته.`,
    )
  }
}

/**
 * عضوية إضافية لعضو قائم — لا تنشئ حسابًا ولا تُنهي عضوية أخرى، فتصلح
 * لتوسيع صلاحيات عضو بعد قبوله دعوته الأولى.
 */
export const postAddMembership: RequestHandler = async (request, response) => {
  const id = readId(request)
  const body = request.body as AddMembershipBody
  const actor = request.auth!

  assertNotSelf(actor, id)

  const [person] = await db
    .select({ id: users.id, kind: users.kind })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  if (!person || person.kind !== 'STAFF') throw errors.notFound('العضو غير موجود.')

  const [office] = await db
    .select({ id: offices.id, nameAr: offices.nameAr, isActive: offices.isActive })
    .from(offices)
    .where(eq(offices.id, body.officeId))
    .limit(1)

  if (!office) throw errors.unprocessable('المكتب المحدد غير موجود.')
  if (!office.isActive) throw errors.unprocessable('المكتب المحدد غير مفعّل.')

  const [role] = await db
    .select({
      id: roles.id,
      scope: roles.scope,
      nameAr: roles.nameAr,
      capabilities: roles.capabilities,
    })
    .from(roles)
    .where(eq(roles.id, body.roleId))
    .limit(1)

  if (!role) throw errors.unprocessable('الدور المحدد غير موجود.')
  if (role.scope !== 'STAFF') {
    throw errors.unprocessable('الدور يجب أن يكون من أدوار الفريق.')
  }

  assertCanGrant(actor, role)

  const [existingActive] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, id),
        eq(memberships.officeId, body.officeId),
        eq(memberships.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (existingActive) {
    throw errors.conflict('العضو لديه عضوية نشطة في هذا المكتب بالفعل.')
  }

  const trace = requestTrace(request)

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(memberships)
      .values({
        userId: id,
        officeId: body.officeId,
        roleId: body.roleId,
        isPrimary: false,
      })
      .returning({ id: memberships.id })

    if (!row) throw new Error('Failed to create membership row.')

    await recordAudit(
      {
        action: 'membership.added',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'user',
        entityId: id,
        summaryAr: `إضافة عضوية بدور ${role.nameAr} في ${office.nameAr}`,
        metadata: { officeId: office.id, roleId: role.id },
        ...trace,
      },
      tx,
    )

    return row
  })

  response.status(201).json({ data: { id: created.id } })
}

/**
 * تعديل مكتب أو دور عضوية نشطة قائمة. لا يمسّ `isPrimary` ولا العضويات
 * الأخرى؛ منتهية لا تُعدَّل — تُنهى عضوية وتُضاف غيرها بدل تحريفها.
 */
export const patchMembership: RequestHandler = async (request, response) => {
  const id = readId(request)
  const membershipId = readId(request, 'membershipId', 'العضوية غير موجودة.')
  const body = request.body as UpdateMembershipBody
  const actor = request.auth!

  assertNotSelf(actor, id)

  const [membership] = await db
    .select({
      id: memberships.id,
      officeId: memberships.officeId,
      roleId: memberships.roleId,
      status: memberships.status,
      roleNameAr: roles.nameAr,
      roleCapabilities: roles.capabilities,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.userId, id)))
    .limit(1)

  if (!membership) throw errors.notFound('العضوية غير موجودة.')
  if (membership.status !== 'ACTIVE') {
    throw errors.unprocessable('لا يمكن تعديل عضوية منتهية.')
  }

  // خفض دور أوسع من صلاحياتك سحبٌ لما لا تملك أن تمنحه.
  assertCanGrant(actor, {
    nameAr: membership.roleNameAr,
    capabilities: membership.roleCapabilities,
  })

  let nextOfficeId = membership.officeId
  let officeNameAr: string | undefined

  if (body.officeId) {
    const [office] = await db
      .select({ id: offices.id, nameAr: offices.nameAr, isActive: offices.isActive })
      .from(offices)
      .where(eq(offices.id, body.officeId))
      .limit(1)

    if (!office) throw errors.unprocessable('المكتب المحدد غير موجود.')
    if (!office.isActive) throw errors.unprocessable('المكتب المحدد غير مفعّل.')

    nextOfficeId = office.id
    officeNameAr = office.nameAr
  }

  let nextRoleId = membership.roleId
  let roleNameAr: string | undefined

  if (body.roleId) {
    const [role] = await db
      .select({
        id: roles.id,
        scope: roles.scope,
        nameAr: roles.nameAr,
        capabilities: roles.capabilities,
      })
      .from(roles)
      .where(eq(roles.id, body.roleId))
      .limit(1)

    if (!role) throw errors.unprocessable('الدور المحدد غير موجود.')
    if (role.scope !== 'STAFF') {
      throw errors.unprocessable('الدور يجب أن يكون من أدوار الفريق.')
    }

    assertCanGrant(actor, role)

    nextRoleId = role.id
    roleNameAr = role.nameAr
  }

  if (nextOfficeId !== membership.officeId) {
    const [conflict] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, id),
          eq(memberships.officeId, nextOfficeId),
          eq(memberships.status, 'ACTIVE'),
        ),
      )
      .limit(1)

    if (conflict) {
      throw errors.conflict('العضو لديه عضوية نشطة في هذا المكتب بالفعل.')
    }
  }

  const trace = requestTrace(request)

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ officeId: nextOfficeId, roleId: nextRoleId })
      .where(eq(memberships.id, membershipId))

    await recordAudit(
      {
        action: 'membership.updated',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'user',
        entityId: id,
        summaryAr: [
          officeNameAr ? `المكتب إلى ${officeNameAr}` : null,
          roleNameAr ? `الدور إلى ${roleNameAr}` : null,
        ]
          .filter(Boolean)
          .join('، '),
        metadata: { membershipId, officeId: nextOfficeId, roleId: nextRoleId },
        ...trace,
      },
      tx,
    )
  })

  response.status(200).json({ data: { id: membershipId } })
}

/**
 * إنهاء عضوية نشطة — سحب صلاحيتها دون حذف سجلها، فيبقى في تاريخ العضو.
 */
export const postEndMembership: RequestHandler = async (request, response) => {
  const id = readId(request)
  const membershipId = readId(request, 'membershipId', 'العضوية غير موجودة.')
  const actor = request.auth!

  assertNotSelf(actor, id)

  const [membership] = await db
    .select({
      id: memberships.id,
      status: memberships.status,
      roleNameAr: roles.nameAr,
      roleCapabilities: roles.capabilities,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.userId, id)))
    .limit(1)

  if (!membership) throw errors.notFound('العضوية غير موجودة.')
  if (membership.status !== 'ACTIVE') {
    throw errors.unprocessable('العضوية منتهية بالفعل.')
  }

  assertCanGrant(actor, {
    nameAr: membership.roleNameAr,
    capabilities: membership.roleCapabilities,
  })

  const trace = requestTrace(request)

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ status: 'ENDED', endedAt: new Date() })
      .where(eq(memberships.id, membershipId))

    await recordAudit(
      {
        action: 'membership.ended',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'user',
        entityId: id,
        summaryAr: 'إنهاء عضوية',
        metadata: { membershipId },
        ...trace,
      },
      tx,
    )
  })

  response.status(204).end()
}
