import { and, desc, eq, ilike, lt, or } from 'drizzle-orm'
import { Router } from 'express'
import type { RequestHandler } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import { db } from '../../db/client.js'
import { auditLogs } from '../../db/schema/audit.js'
import { users } from '../../db/schema/identity.js'
import { type ListAuditQuery, listAuditQuerySchema } from './audit.schemas.js'

const getAuditLogs: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListAuditQuery

  const conditions = [
    query.severity ? eq(auditLogs.severity, query.severity) : undefined,
    query.action ? ilike(auditLogs.action, `${query.action}%`) : undefined,
    query.entityType ? eq(auditLogs.entityType, query.entityType) : undefined,
    query.entityId ? eq(auditLogs.entityId, query.entityId) : undefined,
    query.actorUserId ? eq(auditLogs.actorUserId, query.actorUserId) : undefined,
    query.q
      ? or(
          ilike(auditLogs.summaryAr, `%${query.q}%`),
          ilike(auditLogs.entityLabel, `%${query.q}%`),
        )
      : undefined,
    query.before ? lt(auditLogs.createdAt, new Date(query.before)) : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      severity: auditLogs.severity,
      actorType: auditLogs.actorType,
      actorNameAr: users.fullNameAr,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      entityLabel: auditLogs.entityLabel,
      summaryAr: auditLogs.summaryAr,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit)

  const last = rows.at(-1)

  response.status(200).json({
    data: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    // `null` يعني نهاية السجل، فتعرف الواجهة متى توقف عن الطلب.
    nextBefore:
      rows.length === query.limit && last
        ? last.createdAt.toISOString()
        : null,
  })
}

export const auditRouter = Router()

auditRouter.use(requireAuth, requireStaff, requireCapability('audit.view'))

auditRouter.get('/', validate({ query: listAuditQuerySchema }), getAuditLogs)
