import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import {
  membershipCapabilityOverrides,
  memberships,
} from '../../db/schema/access.js'
import { users } from '../../db/schema/identity.js'
import { offices, roles } from '../../db/schema/org.js'
import { CATALOG_BOUND_ROLE_SLUGS } from '../../db/seed-data.js'
import { type AuthContext, loadOverrides } from '../access/access.service.js'
import {
  type CapabilityOverride,
  effectiveCapabilities,
  isCapability,
} from '../access/capabilities.js'
import {
  assertCanDelegate,
  assertCanDelegateAll,
  assertCanManageOffice,
  assertNotSelf,
  canManageOffice,
  undelegable,
} from '../access/delegation.js'
import { type OfficeScope, officeScope } from '../access/scope.js'
import { requestTrace, recordAudit } from '../audit/audit.service.js'
import type {
  AddMembershipBody,
  CandidatesQuery,
  ListPeopleQuery,
  SetMembershipCapabilitiesBody,
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
  roleCapabilities: roles.capabilities,
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
  const byUser = new Map<
    string,
    Array<Omit<Awaited<ReturnType<typeof selectMemberships>>[number], 'userId'>>
  >()

  if (userIds.length === 0) return byUser

  for (const { userId, ...membership } of await selectMemberships(
    userIds,
    includeEnded,
  )) {
    const list = byUser.get(userId) ?? []
    list.push(membership)
    byUser.set(userId, list)
  }

  return byUser
}

function selectMemberships(userIds: string[], includeEnded: boolean) {
  return (
    db
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
  )
}

/**
 * من يرى من في الدليل: حامل `users.view` يرى الفريق كله، ومدير الفريق
 * بلا `users.view` يرى من له عضوية نشطة في فرقه وأقسامها وحدها.
 */
function directoryScope(actor: AuthContext): OfficeScope {
  return actor.capabilities.includes('users.view')
    ? 'ALL'
    : officeScope(actor, 'team.manage')
}

function withinScope(scope: OfficeScope) {
  if (scope === 'ALL') return undefined
  if (scope.size === 0) return sql`false`

  return inArray(
    users.id,
    db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          inArray(memberships.officeId, [...scope]),
          eq(memberships.status, 'ACTIVE'),
        ),
      ),
  )
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
    withinScope(directoryScope(request.auth!)),
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
    memberships: (byUser.get(row.id) ?? []).map(
      ({ roleCapabilities: _roleCapabilities, ...membership }) => membership,
    ),
  }))

  response.status(200).json({ data })
}

/**
 * هل يستطيع المستخدم الحالي أن يمسّ هذه العضوية؟ القرار نفسه الذي تتخذه
 * مسارات الكتابة، يُحسب هنا لتعرض الواجهة الأفعال الممكنة وحدها بدل أن
 * تعيد كتابة القواعد.
 */
function canTouch(
  actor: AuthContext,
  userId: string,
  membership: { officeId: string; status: string },
  effective: readonly string[],
) {
  return (
    membership.status === 'ACTIVE' &&
    actor.userId !== userId &&
    canManageOffice(actor, membership.officeId) &&
    undelegable(actor, effective, membership.officeId).length === 0
  )
}

export const getPerson: RequestHandler = async (request, response) => {
  const id = readId(request)
  const actor = request.auth!

  const [row] = await db
    .select(userColumns)
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.kind, 'STAFF'),
        withinScope(directoryScope(actor)),
      ),
    )
    .limit(1)

  if (!row) throw errors.notFound('العضو غير موجود.')

  const list = (await membershipsFor([row.id], true)).get(row.id) ?? []
  const overrides = await loadOverrides(list.map((membership) => membership.id))

  const data = {
    ...row,
    memberships: list.map(({ roleCapabilities, ...membership }) => {
      const own = (overrides.get(membership.id) ?? []).filter((override) =>
        isCapability(override.capability),
      )
      const effective = effectiveCapabilities(roleCapabilities, own)
      const canManage = canTouch(actor, row.id, membership, effective)

      return {
        ...membership,
        roleCapabilities: roleCapabilities.filter(isCapability).sort(),
        overrides: own,
        effective,
        canManage,
        canCustomize:
          canManage && !CATALOG_BOUND_ROLE_SLUGS.includes(membership.roleSlug),
      }
    }),
  }

  response.status(200).json({ data })
}

/**
 * مرشّحو الإضافة إلى فريق: الاسم والبريد وحدهما.
 *
 * مدير الفريق لا يرى الدليل كله (`users.view`)، لكنه يحتاج أن يجد زميلًا
 * ليضمّه إلى فريقه. البحث إلزامي وبحد أدنى، فلا يصير المسار نسخة من
 * الدليل بلا حارسه.
 */
export const getCandidates: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as CandidatesQuery

  const rows = await db
    .select({ id: users.id, fullNameAr: users.fullNameAr, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.kind, 'STAFF'),
        eq(users.status, 'ACTIVE'),
        or(
          ilike(users.fullNameAr, `%${query.q}%`),
          ilike(users.email, `%${query.q}%`),
        ),
      ),
    )
    .orderBy(asc(users.fullNameAr))
    .limit(20)

  response.status(200).json({ data: rows })
}

async function loadActiveOffice(officeId: string) {
  const [office] = await db
    .select({ id: offices.id, nameAr: offices.nameAr, isActive: offices.isActive })
    .from(offices)
    .where(eq(offices.id, officeId))
    .limit(1)

  if (!office) throw errors.unprocessable('المكتب المحدد غير موجود.')
  if (!office.isActive) throw errors.unprocessable('المكتب المحدد غير مفعّل.')

  return office
}

async function loadStaffRole(roleId: string) {
  const [role] = await db
    .select({
      id: roles.id,
      scope: roles.scope,
      nameAr: roles.nameAr,
      capabilities: roles.capabilities,
    })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1)

  if (!role) throw errors.unprocessable('الدور المحدد غير موجود.')
  if (role.scope !== 'STAFF') {
    throw errors.unprocessable('الدور يجب أن يكون من أدوار الفريق.')
  }

  return role
}

const roleDenied = (nameAr: string) =>
  `دور «${nameAr}» يحمل صلاحيات لا تملك منحها في هذا الفريق.`

const MEMBERSHIP_DENIED =
  'هذه العضوية تحمل صلاحيات لا تملك منحها، فلا يمكنك تعديلها.'

/** العضوية مع حزمة دورها واستثناءاتها وقدراتها الفعلية. */
async function loadMembership(userId: string, membershipId: string) {
  const [row] = await db
    .select({
      id: memberships.id,
      officeId: memberships.officeId,
      officeNameAr: offices.nameAr,
      roleId: memberships.roleId,
      roleSlug: roles.slug,
      roleCapabilities: roles.capabilities,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(offices, eq(memberships.officeId, offices.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.userId, userId)))
    .limit(1)

  if (!row) throw errors.notFound('العضوية غير موجودة.')

  const overrides = (await loadOverrides([row.id])).get(row.id) ?? []

  return {
    ...row,
    overrides,
    effective: effectiveCapabilities(row.roleCapabilities, overrides),
  }
}

/**
 * قبل أي تعديل على عضوية قائمة: المنفّذ يدير فريقها، وقدراتها **الفعلية**
 * مما يستطيع تفويضه — فلا يمسّ مدير فريق زميلًا مديرًا، ولا يمسّ أحد
 * عضوية المدير العام إلا مدير عام.
 */
function assertCanTouch(
  actor: AuthContext,
  membership: { officeId: string; effective: readonly string[] },
) {
  assertCanManageOffice(actor, membership.officeId)
  assertCanDelegateAll(actor, membership.effective, membership.officeId, MEMBERSHIP_DENIED)
}

/**
 * عضوية إضافية لعضو قائم — لا تنشئ حسابًا ولا تُنهي عضوية أخرى. هكذا
 * يضمّ مدير الفريق زميلًا إلى فريقه.
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

  const office = await loadActiveOffice(body.officeId)

  assertCanManageOffice(actor, office.id)

  const role = await loadStaffRole(body.roleId)

  assertCanDelegateAll(actor, role.capabilities, office.id, roleDenied(role.nameAr))

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
        metadata: { membershipId: row.id, officeId: office.id, roleId: role.id },
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
 *
 * الاستثناءات الفردية تعديل على منصب في فريق بعينه، فتسقط حين يتغيّر
 * أحدهما: ما نُزع من «مسؤول الإعلام» لا معنى له على «عضو العمليات».
 */
export const patchMembership: RequestHandler = async (request, response) => {
  const id = readId(request)
  const membershipId = readId(request, 'membershipId', 'العضوية غير موجودة.')
  const body = request.body as UpdateMembershipBody
  const actor = request.auth!

  assertNotSelf(actor, id)

  const membership = await loadMembership(id, membershipId)

  if (membership.status !== 'ACTIVE') {
    throw errors.unprocessable('لا يمكن تعديل عضوية منتهية.')
  }

  assertCanTouch(actor, membership)

  const nextOffice =
    body.officeId && body.officeId !== membership.officeId
      ? await loadActiveOffice(body.officeId)
      : null

  // النقل إلى فريق آخر يتطلب إدارة الفريقين معًا.
  if (nextOffice) assertCanManageOffice(actor, nextOffice.id)

  const nextRole =
    body.roleId && body.roleId !== membership.roleId
      ? await loadStaffRole(body.roleId)
      : null

  const nextOfficeId = nextOffice?.id ?? membership.officeId
  const nextRoleId = nextRole?.id ?? membership.roleId

  if (!nextOffice && !nextRole) {
    response.status(200).json({ data: { id: membershipId } })
    return
  }

  assertCanDelegateAll(
    actor,
    nextRole?.capabilities ?? membership.roleCapabilities,
    nextOfficeId,
    nextRole ? roleDenied(nextRole.nameAr) : MEMBERSHIP_DENIED,
  )

  if (nextOffice) {
    const [conflict] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, id),
          eq(memberships.officeId, nextOffice.id),
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

    if (membership.overrides.length > 0) {
      await tx
        .delete(membershipCapabilityOverrides)
        .where(eq(membershipCapabilityOverrides.membershipId, membershipId))
    }

    await recordAudit(
      {
        action: 'membership.updated',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'user',
        entityId: id,
        summaryAr: [
          nextOffice ? `المكتب إلى ${nextOffice.nameAr}` : null,
          nextRole ? `الدور إلى ${nextRole.nameAr}` : null,
          membership.overrides.length > 0 ? 'وسقطت الاستثناءات الفردية' : null,
        ]
          .filter(Boolean)
          .join('، '),
        metadata: {
          membershipId,
          from: { officeId: membership.officeId, roleId: membership.roleId },
          to: { officeId: nextOfficeId, roleId: nextRoleId },
          clearedOverrides: membership.overrides,
        },
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

  const membership = await loadMembership(id, membershipId)

  if (membership.status !== 'ACTIVE') {
    throw errors.unprocessable('العضوية منتهية بالفعل.')
  }

  assertCanTouch(actor, membership)

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
        summaryAr: `إنهاء عضوية في ${membership.officeNameAr}`,
        metadata: { membershipId },
        ...trace,
      },
      tx,
    )
  })

  response.status(204).end()
}

/**
 * الاستثناءات الفردية لعضوية: يُرسَل الوضع المطلوب كاملًا لا فروقه، فلا
 * يصل طلبان متتاليان بحالة نصف محفوظة.
 *
 * ما لا أثر له لا يُحفظ — منح قدرة في الدور أصلًا، أو نزع ما ليس فيه —
 * فيبقى الجدول سجلًا لما يخالف الحزمة فعلًا.
 */
export const putMembershipCapabilities: RequestHandler = async (
  request,
  response,
) => {
  const id = readId(request)
  const membershipId = readId(request, 'membershipId', 'العضوية غير موجودة.')
  const body = request.body as SetMembershipCapabilitiesBody
  const actor = request.auth!

  assertNotSelf(actor, id)

  const membership = await loadMembership(id, membershipId)

  if (membership.status !== 'ACTIVE') {
    throw errors.unprocessable('لا تُخصَّص صلاحيات عضوية منتهية.')
  }

  if (CATALOG_BOUND_ROLE_SLUGS.includes(membership.roleSlug)) {
    throw errors.unprocessable('عضوية المدير العام تحمل الصلاحيات كلها ولا تُخصَّص.')
  }

  assertCanTouch(actor, membership)

  const inRole = new Set(membership.roleCapabilities)
  const next: CapabilityOverride[] = [
    ...body.grants
      .filter((capability) => !inRole.has(capability))
      .map((capability) => ({ capability, effect: 'GRANT' as const })),
    ...body.revokes
      .filter((capability) => inRole.has(capability))
      .map((capability) => ({ capability, effect: 'REVOKE' as const })),
  ]

  const key = (override: CapabilityOverride) =>
    `${override.effect}:${override.capability}`
  const before = new Set(membership.overrides.map(key))
  const after = new Set(next.map(key))

  // كل قدرة يتغيّر وضعها — منحًا جديدًا أو نزعًا أو تراجعًا عنهما — تُفوَّض.
  const changed = new Set(
    [
      ...membership.overrides.filter((override) => !after.has(key(override))),
      ...next.filter((override) => !before.has(key(override))),
    ].map((override) => override.capability),
  )

  for (const capability of changed) {
    if (isCapability(capability)) {
      assertCanDelegate(actor, capability, membership.officeId)
    }
  }

  const effective = effectiveCapabilities(membership.roleCapabilities, next)

  if (changed.size > 0) {
    const trace = requestTrace(request)
    const grants = next
      .filter((override) => override.effect === 'GRANT')
      .map((override) => override.capability)
    const revokes = next
      .filter((override) => override.effect === 'REVOKE')
      .map((override) => override.capability)
    const newlyGranted = next.some(
      (override) => override.effect === 'GRANT' && !before.has(key(override)),
    )

    await db.transaction(async (tx) => {
      await tx
        .delete(membershipCapabilityOverrides)
        .where(eq(membershipCapabilityOverrides.membershipId, membershipId))

      if (next.length > 0) {
        await tx.insert(membershipCapabilityOverrides).values(
          next.map((override) => ({
            membershipId,
            capability: override.capability,
            effect: override.effect,
            createdById: actor.userId,
          })),
        )
      }

      await recordAudit(
        {
          action: 'membership.capabilities_updated',
          // توسيع الوصول يستحق التنبيه، وتضييقه وحده لا.
          severity: newlyGranted ? 'WARNING' : 'NOTICE',
          actorUserId: actor.userId,
          entityType: 'user',
          entityId: id,
          summaryAr: `تخصيص صلاحيات العضوية في ${membership.officeNameAr} — ${grants.length} ممنوحة و${revokes.length} منزوعة`,
          metadata: {
            membershipId,
            grants,
            revokes,
            previous: membership.overrides,
          },
          ...trace,
        },
        tx,
      )
    })
  }

  response.status(200).json({ data: { effective } })
}
