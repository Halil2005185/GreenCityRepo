import { asc, eq } from 'drizzle-orm'
import { Router } from 'express'
import type { RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { metrics } from '../../db/schema/metrics.js'
import { recordAudit, requestTrace } from '../audit/audit.service.js'
import {
  type CreateMetricBody,
  type UpdateMetricBody,
  createMetricBodySchema,
  metricIdParamsSchema,
  updateMetricBodySchema,
} from './metrics.schemas.js'

async function loadMetric(id: string) {
  const [row] = await db.select().from(metrics).where(eq(metrics.id, id)).limit(1)

  if (!row) throw errors.notFound('المؤشر غير موجود.')

  return row
}

const getMetrics: RequestHandler = async (_request, response) => {
  const rows = await db
    .select()
    .from(metrics)
    .orderBy(asc(metrics.displayOrder), asc(metrics.nameAr))

  response.status(200).json({ data: rows })
}

const postMetric: RequestHandler = async (request, response) => {
  const body = request.body as CreateMetricBody

  const [duplicate] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(eq(metrics.slug, body.slug))
    .limit(1)

  if (duplicate) throw errors.conflict('الـslug مستخدم بمؤشر آخر.')

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(metrics)
      .values({
        slug: body.slug,
        nameAr: normalizeText(body.nameAr),
        unitAr: normalizeText(body.unitAr),
        aggregation: body.aggregation,
        decimals: body.decimals,
        displayOrder: body.displayOrder,
        ...(body.nameEn ? { nameEn: normalizeText(body.nameEn) } : {}),
        ...(body.descriptionAr ? { descriptionAr: body.descriptionAr } : {}),
      })
      .returning()

    if (!row) throw new Error('Failed to create metric.')

    await recordAudit(
      {
        action: 'metric.created',
        severity: 'NOTICE',
        actorUserId: request.auth!.userId,
        entityType: 'metric',
        entityId: row.id,
        entityLabel: row.nameAr,
        summaryAr: `إضافة مؤشر بوحدة ${row.unitAr}`,
        ...requestTrace(request),
      },
      tx,
    )

    return row
  })

  response.status(201).json(created)
}

const patchMetric: RequestHandler = async (request, response) => {
  const id = (request.validatedParams as { id: string }).id
  const body = request.body as UpdateMetricBody

  await loadMetric(id)

  const changes = {
    ...(body.nameAr ? { nameAr: normalizeText(body.nameAr) } : {}),
    ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
    ...(body.descriptionAr !== undefined
      ? { descriptionAr: body.descriptionAr || null }
      : {}),
    ...(body.unitAr ? { unitAr: normalizeText(body.unitAr) } : {}),
    ...(body.aggregation ? { aggregation: body.aggregation } : {}),
    ...(body.decimals !== undefined ? { decimals: body.decimals } : {}),
    ...(body.displayOrder !== undefined ? { displayOrder: body.displayOrder } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(metrics).set(changes).where(eq(metrics.id, id))

      await recordAudit(
        {
          action: 'metric.updated',
          actorUserId: request.auth!.userId,
          entityType: 'metric',
          entityId: id,
          summaryAr: 'تعديل مؤشر',
          metadata: { fields: Object.keys(changes) },
          ...requestTrace(request),
        },
        tx,
      )
    })
  }

  response.status(200).json(await loadMetric(id))
}

export const metricsRouter = Router()

metricsRouter.use(requireAuth, requireStaff)

metricsRouter.get('/', getMetrics)

metricsRouter.post(
  '/',
  requireCapability('metrics.manage'),
  validate({ body: createMetricBodySchema }),
  postMetric,
)

metricsRouter.patch(
  '/:id',
  requireCapability('metrics.manage'),
  validate({ params: metricIdParamsSchema, body: updateMetricBodySchema }),
  patchMetric,
)
