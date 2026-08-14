import { and, asc, eq, ilike, isNull, like, or } from 'drizzle-orm'
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
import { areas } from '../../db/schema/geo.js'
import { recordAudit, requestTrace } from '../audit/audit.service.js'
import {
  type CreateAreaBody,
  type ListAreasQuery,
  createAreaBodySchema,
  listAreasQuerySchema,
} from './geo.schemas.js'

type Row = typeof areas.$inferSelect

/** `numeric` يعود نصًّا من السائق؛ التحويل هنا لا في كل مستدعٍ. */
function toNumber(value: string | null) {
  return value === null ? null : Number(value)
}

function serialize(row: Row) {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    level: row.level,
    depth: row.depth,
    path: row.path,
    centerLat: toNumber(row.centerLat),
    centerLng: toNumber(row.centerLng),
    isActive: row.isActive,
  }
}

const getAreas: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListAreasQuery

  const conditions = [
    query.level ? eq(areas.level, query.level) : undefined,
    query.parentId ? eq(areas.parentId, query.parentId) : undefined,
    // شجرة فرعية كاملة عبر المسار المادّي — بادئة واحدة بدل تعاود.
    query.under ? like(areas.path, `${query.under}/%`) : undefined,
    query.q
      ? or(ilike(areas.nameAr, `%${query.q}%`), ilike(areas.nameEn, `%${query.q}%`))
      : undefined,
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(areas)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(areas.depth), asc(areas.displayOrder), asc(areas.nameAr))
    .limit(1000)

  response.status(200).json({ data: rows.map(serialize) })
}

const postArea: RequestHandler = async (request, response) => {
  const body = request.body as CreateAreaBody

  let depth = 0
  let path = body.slug

  if (body.parentId) {
    const [parent] = await db
      .select({ depth: areas.depth, path: areas.path, level: areas.level })
      .from(areas)
      .where(eq(areas.id, body.parentId))
      .limit(1)

    if (!parent) throw errors.unprocessable('المنطقة الأب غير موجودة.')

    if (body.level === 'GOVERNORATE') {
      throw errors.unprocessable('المحافظة لا تتبع منطقة أخرى.')
    }

    depth = parent.depth + 1
    path = `${parent.path}/${body.slug}`
  } else if (body.level !== 'GOVERNORATE') {
    throw errors.unprocessable('ما دون المحافظة يلزمه تحديد المنطقة الأب.')
  }

  const [duplicate] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(
      and(
        eq(areas.slug, body.slug),
        body.parentId ? eq(areas.parentId, body.parentId) : isNull(areas.parentId),
      ),
    )
    .limit(1)

  if (duplicate) {
    throw errors.conflict('يوجد ما يحمل هذا الـslug تحت الأب نفسه.')
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(areas)
      .values({
        slug: body.slug,
        nameAr: normalizeText(body.nameAr),
        level: body.level,
        depth,
        path,
        ...(body.parentId ? { parentId: body.parentId } : {}),
        ...(body.nameEn ? { nameEn: normalizeText(body.nameEn) } : {}),
        ...(body.centerLat !== undefined
          ? { centerLat: String(body.centerLat) }
          : {}),
        ...(body.centerLng !== undefined
          ? { centerLng: String(body.centerLng) }
          : {}),
      })
      .returning()

    if (!row) throw new Error('Failed to create area.')

    await recordAudit(
      {
        action: 'geo.area_created',
        actorUserId: request.auth!.userId,
        entityType: 'area',
        entityId: row.id,
        entityLabel: row.nameAr,
        summaryAr: `إضافة منطقة على مستوى ${row.level}`,
        ...requestTrace(request),
      },
      tx,
    )

    return row
  })

  response.status(201).json(serialize(created))
}

export const geoRouter = Router()

// القراءة متاحة لكل موظف: اختيار المنطقة يظهر في كل نموذج مبادرة تقريبًا.
geoRouter.use(requireAuth, requireStaff)

geoRouter.get('/', validate({ query: listAreasQuerySchema }), getAreas)

geoRouter.post(
  '/',
  requireCapability('geo.manage'),
  validate({ body: createAreaBodySchema }),
  postArea,
)
