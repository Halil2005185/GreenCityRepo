import { randomBytes } from 'node:crypto'

import { asc, count, eq, sql } from 'drizzle-orm'
import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import {
  invitationOfficeRoles,
  invitations,
  memberships,
} from '../../db/schema/access.js'
import { offices, roles } from '../../db/schema/org.js'
import { partnerMemberships } from '../../db/schema/partners.js'
import { CATALOG_BOUND_ROLE_SLUGS } from '../../db/seed-data.js'
import { CAPABILITY_CATALOG, isCapability } from '../access/capabilities.js'
import { assertCanEditBundle } from '../access/delegation.js'
import { requestTrace, recordAudit } from '../audit/audit.service.js'
import type {
  CreateRoleBody,
  ListRolesQuery,
  UpdateRoleBody,
} from './org.schemas.js'

export const getOffices: RequestHandler = async (_request, response) => {
  const data = await db
    .select({
      id: offices.id,
      parentId: offices.parentId,
      slug: offices.slug,
      nameAr: offices.nameAr,
      nameEn: offices.nameEn,
      descriptionAr: offices.descriptionAr,
      displayOrder: offices.displayOrder,
      isActive: offices.isActive,
    })
    .from(offices)
    .orderBy(asc(offices.displayOrder), asc(offices.nameAr))

  response.status(200).json({ data })
}

const activeMembers = db
  .select({ roleId: memberships.roleId, total: count().as('total') })
  .from(memberships)
  .where(eq(memberships.status, 'ACTIVE'))
  .groupBy(memberships.roleId)
  .as('active_members')

export const getRoles: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListRolesQuery

  const rows = await db
    .select({
      id: roles.id,
      slug: roles.slug,
      nameAr: roles.nameAr,
      nameEn: roles.nameEn,
      descriptionAr: roles.descriptionAr,
      scope: roles.scope,
      officeId: roles.officeId,
      capabilities: roles.capabilities,
      isSystem: roles.isSystem,
      customizedAt: roles.customizedAt,
      displayOrder: roles.displayOrder,
      activeMembers: sql<number>`coalesce(${activeMembers.total}, 0)::int`,
    })
    .from(roles)
    .leftJoin(activeMembers, eq(activeMembers.roleId, roles.id))
    .where(query.scope ? eq(roles.scope, query.scope) : undefined)
    .orderBy(asc(roles.displayOrder), asc(roles.nameAr))

  const data = rows.map((row) => ({
    ...row,
    isLocked: CATALOG_BOUND_ROLE_SLUGS.includes(row.slug),
  }))

  response.status(200).json({ data })
}

export const getCapabilities: RequestHandler = (_request, response) => {
  response.status(200).json({ data: CAPABILITY_CATALOG })
}

function readRoleId(request: Request) {
  const value = request.params['id']

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('الدور غير موجود.')
  }

  return value
}

async function assertOfficeExists(officeId: string | null | undefined) {
  if (!officeId) return

  const [office] = await db
    .select({ id: offices.id })
    .from(offices)
    .where(eq(offices.id, officeId))
    .limit(1)

  if (!office) throw errors.unprocessable('المكتب المحدد غير موجود.')
}

/**
 * الدور القابل للتحرير: دور فريق، وليس مقفلًا على الكتالوج. أدوار بوابة
 * الشريك خارج هذه الشاشة — قدراتها `partner.*` لا يحملها أحد من الفريق،
 * فلا أحد يستطيع تحريرها بقاعدة «لا تعطِ ما لا تملك» أصلًا.
 */
async function loadEditableRole(id: string) {
  const [role] = await db
    .select({
      id: roles.id,
      slug: roles.slug,
      nameAr: roles.nameAr,
      scope: roles.scope,
      officeId: roles.officeId,
      capabilities: roles.capabilities,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1)

  if (!role) throw errors.notFound('الدور غير موجود.')

  if (role.scope !== 'STAFF') {
    throw errors.unprocessable('أدوار بوابة الشريك لا تُحرَّر من هذه الشاشة.')
  }

  if (CATALOG_BOUND_ROLE_SLUGS.includes(role.slug)) {
    throw errors.unprocessable(
      'دور المدير العام يحمل الصلاحيات كلها دائمًا، فلا يُعدَّل ولا يُحذف.',
    )
  }

  return role
}

function diff(before: readonly string[], after: readonly string[]) {
  return {
    added: after.filter((capability) => !before.includes(capability)),
    removed: before.filter((capability) => !after.includes(capability)),
  }
}

export const postRole: RequestHandler = async (request, response) => {
  const body = request.body as CreateRoleBody
  const actor = request.auth!

  assertCanEditBundle(actor, [], body.capabilities)
  await assertOfficeExists(body.officeId)

  const trace = requestTrace(request)

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(roles)
      .values({
        // المعرّف النصي للكود وحده؛ الاسم يُعرض ويُحرَّر.
        slug: `CUSTOM_${randomBytes(4).toString('hex').toUpperCase()}`,
        nameAr: body.nameAr,
        descriptionAr: body.descriptionAr ?? null,
        scope: 'STAFF',
        officeId: body.officeId ?? null,
        capabilities: [...new Set(body.capabilities)].sort(),
        isSystem: false,
        customizedAt: new Date(),
        displayOrder: 100,
      })
      .returning({ id: roles.id })

    if (!row) throw new Error('Failed to create role row.')

    await recordAudit(
      {
        action: 'role.created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'role',
        entityId: row.id,
        entityLabel: body.nameAr,
        summaryAr: `إنشاء الدور ${body.nameAr} بـ${body.capabilities.length} صلاحية`,
        metadata: { capabilities: body.capabilities, officeId: body.officeId ?? null },
        ...trace,
      },
      tx,
    )

    return row
  })

  response.status(201).json({ data: { id: created.id } })
}

/**
 * تحرير حزمة دور يغيّر صلاحيات كل من يحمله، في كل فريق. لذلك تُسجَّل
 * الفروق في التدقيق، ويصير الدور ملك محرّره فلا تعيده المزامنة إلى البذرة.
 */
export const patchRole: RequestHandler = async (request, response) => {
  const id = readRoleId(request)
  const body = request.body as UpdateRoleBody
  const actor = request.auth!

  const role = await loadEditableRole(id)
  const nextCapabilities = body.capabilities
    ? [...new Set(body.capabilities)].sort()
    : role.capabilities

  assertCanEditBundle(actor, role.capabilities, nextCapabilities)

  if (body.officeId !== undefined) await assertOfficeExists(body.officeId)

  const { added, removed } = diff(
    role.capabilities.filter(isCapability),
    nextCapabilities,
  )
  const trace = requestTrace(request)

  await db.transaction(async (tx) => {
    await tx
      .update(roles)
      .set({
        ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
        ...(body.descriptionAr !== undefined
          ? { descriptionAr: body.descriptionAr }
          : {}),
        ...(body.officeId !== undefined ? { officeId: body.officeId } : {}),
        capabilities: nextCapabilities,
        customizedAt: new Date(),
      })
      .where(eq(roles.id, id))

    await recordAudit(
      {
        action: 'role.updated',
        // توسيع الوصول يستحق التنبيه، وتضييقه وحده لا.
        severity: added.length > 0 ? 'WARNING' : 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'role',
        entityId: id,
        entityLabel: body.nameAr ?? role.nameAr,
        summaryAr: `تحرير الدور ${body.nameAr ?? role.nameAr} — أُضيف ${added.length} وسُحب ${removed.length}`,
        metadata: { added, removed },
        ...trace,
      },
      tx,
    )
  })

  response.status(200).json({ data: { id } })
}

/**
 * حذف دور لم يُسنَد قط. الدور الذي حمله أحد — ولو في عضوية منتهية —
 * جزء من تاريخ تلك العضوية، فحذفه يمحو معنى السجل.
 */
export const deleteRole: RequestHandler = async (request, response) => {
  const id = readRoleId(request)
  const actor = request.auth!

  const role = await loadEditableRole(id)

  if (role.isSystem) {
    throw errors.unprocessable('أدوار النظام لا تُحذف؛ عدّل حزمتها بدل ذلك.')
  }

  assertCanEditBundle(actor, role.capabilities, [])

  // كل جدول يشير إلى الدور بقيد `restrict`: يُفحص هنا ليصل 409 مفهوم لا 500.
  const counts = await Promise.all([
    db.select({ total: count() }).from(memberships).where(eq(memberships.roleId, id)),
    db.select({ total: count() }).from(invitations).where(eq(invitations.roleId, id)),
    db
      .select({ total: count() })
      .from(invitationOfficeRoles)
      .where(eq(invitationOfficeRoles.roleId, id)),
    db
      .select({ total: count() })
      .from(partnerMemberships)
      .where(eq(partnerMemberships.roleId, id)),
  ])

  if (counts.some(([row]) => (row?.total ?? 0) > 0)) {
    throw errors.conflict(
      'الدور مُسنَد في عضويات أو دعوات، فلا يُحذف. انقل أصحابه إلى دور آخر أولًا.',
    )
  }

  const trace = requestTrace(request)

  await db.transaction(async (tx) => {
    await tx.delete(roles).where(eq(roles.id, id))

    await recordAudit(
      {
        action: 'role.deleted',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'role',
        entityId: id,
        entityLabel: role.nameAr,
        summaryAr: `حذف الدور ${role.nameAr}`,
        metadata: { capabilities: role.capabilities },
        ...trace,
      },
      tx,
    )
  })

  response.status(204).end()
}
