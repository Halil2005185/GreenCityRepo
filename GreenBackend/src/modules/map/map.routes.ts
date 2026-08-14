import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
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
import { impactEntries, metrics } from '../../db/schema/metrics.js'
import {
  initiativeSites,
  initiatives,
  programs,
} from '../../db/schema/programs.js'
import { recordAudit, requestTrace } from '../audit/audit.service.js'
import {
  type CreateGreenPointBody,
  type ListPointsQuery,
  createGreenPointBodySchema,
  listPointsQuerySchema,
} from './map.schemas.js'

/** رخصة مصدر الحدود تفرض النسب، فيُرسَل مع البيانات لا في تعليق كود. */
const ATTRIBUTION = 'حدود المحافظات: geoBoundaries عن UN OCHA — CC BY 3.0 IGO'

const toNumber = (value: string | null) =>
  value === null ? null : Number(value)

const getAreas: RequestHandler = async (_request, response) => {
  const rows = await db
    .select({
      id: areas.id,
      slug: areas.slug,
      nameAr: areas.nameAr,
      centerLat: areas.centerLat,
      centerLng: areas.centerLng,
      boundary: areas.boundary,
    })
    .from(areas)
    .where(eq(areas.level, 'GOVERNORATE'))
    .orderBy(asc(areas.displayOrder), asc(areas.nameAr))

  /**
   * العدّ في استعلام مجمَّع مستقل لا في استعلامات فرعية مترابطة داخل
   * `sql`: القالب هناك يُخرج أسماء الأعمدة بلا اسم جدول، فيصير شرط الربط
   * `"id" = "id"` ويفشل الاستعلام. والبنّاء يضمن التأهيل الصحيح.
   *
   * والعدّ على المواقع لا المبادرات، لأن المحافظة تحتضن مواقع تنفيذ.
   */
  const counts = await db
    .select({
      areaId: initiativeSites.areaId,
      kind: initiatives.kind,
      total: sql<number>`count(*)::int`,
    })
    .from(initiativeSites)
    .innerJoin(initiatives, eq(initiativeSites.initiativeId, initiatives.id))
    .where(isNotNull(initiativeSites.areaId))
    .groupBy(initiativeSites.areaId, initiatives.kind)

  const byArea = new Map<string, { campaign: number; greenPoint: number }>()

  for (const row of counts) {
    if (!row.areaId) continue

    const bucket = byArea.get(row.areaId) ?? { campaign: 0, greenPoint: 0 }

    if (row.kind === 'CAMPAIGN') bucket.campaign += row.total
    else bucket.greenPoint += row.total

    byArea.set(row.areaId, bucket)
  }

  response.status(200).json({
    attribution: ATTRIBUTION,
    data: rows.map((row) => ({
      ...row,
      centerLat: toNumber(row.centerLat),
      centerLng: toNumber(row.centerLng),
      campaignCount: byArea.get(row.id)?.campaign ?? 0,
      greenPointCount: byArea.get(row.id)?.greenPoint ?? 0,
    })),
  })
}

const getPoints: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListPointsQuery

  const conditions = [
    // موقع بلا إحداثيات لا يُرسم، فلا يُرسَل أصلًا.
    isNotNull(initiativeSites.lat),
    query.kind ? eq(initiatives.kind, query.kind) : undefined,
    query.areaId ? eq(initiativeSites.areaId, query.areaId) : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      siteId: initiativeSites.id,
      initiativeId: initiatives.id,
      kind: initiatives.kind,
      initiativeNameAr: initiatives.nameAr,
      siteNameAr: initiativeSites.nameAr,
      contributorNameAr: initiatives.contributorNameAr,
      status: initiativeSites.status,
      initiativeStatus: initiatives.status,
      areaNameAr: areas.nameAr,
      lat: initiativeSites.lat,
      lng: initiativeSites.lng,
    })
    .from(initiativeSites)
    .innerJoin(initiatives, eq(initiativeSites.initiativeId, initiatives.id))
    .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
    .where(and(...conditions))
    .limit(5000)

  response.status(200).json({
    data: rows.map((row) => ({
      ...row,
      lat: Number(row.lat),
      lng: Number(row.lng),
    })),
  })
}

/**
 * النقطة الخضراء مبادرة بموقع واحد يُنشآن معًا.
 *
 * إنشاؤها عبر مسار المبادرات العام كان سيطلب من الموظف خطوتين ونموذجًا
 * يحمل حقولًا لا تعنيها (الأهداف، المواسم، سياسة المطابقة). وهي أيضًا لا
 * تُنسَخ لها قوالب البرنامج: توثيق فعلٍ مضى لا خطة عمل قادمة.
 */
const postGreenPoint: RequestHandler = async (request, response) => {
  const body = request.body as CreateGreenPointBody
  const actor = request.auth!
  const trace = requestTrace(request)

  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.slug, 'tree-planting'), eq(programs.isActive, true)))
    .limit(1)

  if (!program) {
    throw errors.unprocessable(
      'لا يوجد برنامج تشجير مفعّل. أنشئه أولًا من شاشة البرامج.',
    )
  }

  if (body.metricId && body.metricValue === undefined) {
    throw errors.unprocessable('اختيار المؤشر يلزمه قيمة.')
  }

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()

  const siteId = await db.transaction(async (tx) => {
    const [initiative] = await tx
      .insert(initiatives)
      .values({
        programId: program.id,
        kind: 'GREEN_POINT',
        nameAr: normalizeText(body.nameAr),
        contributorNameAr: normalizeText(body.contributorNameAr),
        // النقطة موثّقة لا مخطَّطة: تولد مكتملة وبلا مطابقة أهداف.
        status: 'COMPLETED',
        targetRollup: 'NONE',
        completedAt: occurredAt,
        startsAt: occurredAt,
        ...(body.contributorKind ? { contributorKind: body.contributorKind } : {}),
        ...(body.storyAr ? { storyAr: body.storyAr } : {}),
        ...(body.coverImageUrl ? { coverImageUrl: body.coverImageUrl } : {}),
      })
      .returning({ id: initiatives.id })

    if (!initiative) throw new Error('Failed to create green point initiative.')

    const [site] = await tx
      .insert(initiativeSites)
      .values({
        initiativeId: initiative.id,
        nameAr: normalizeText(body.nameAr),
        status: 'COMPLETED',
        lat: String(body.lat),
        lng: String(body.lng),
        startsAt: occurredAt,
        ...(body.areaId ? { areaId: body.areaId } : {}),
      })
      .returning({ id: initiativeSites.id })

    if (!site) throw new Error('Failed to create green point site.')

    if (body.metricId && body.metricValue !== undefined) {
      const [metric] = await tx
        .select({ id: metrics.id, isActive: metrics.isActive })
        .from(metrics)
        .where(eq(metrics.id, body.metricId))
        .limit(1)

      if (!metric) throw errors.unprocessable('المؤشر غير موجود.')
      if (!metric.isActive) throw errors.unprocessable('المؤشر غير مفعّل.')

      /**
       * يُسجَّل موثّقًا فورًا: الفريق يوثّق فعلًا وقع ومعه إثباته، فتوثيقه
       * هو التحقق. إبقاؤه معلّقًا يعني رقمًا لا يظهر في المجموع الوطني
       * وبانتظار خطوة لا أحد سيقوم بها.
       */
      await tx.insert(impactEntries).values({
        metricId: metric.id,
        siteId: site.id,
        value: String(body.metricValue),
        source: 'STAFF_ENTRY',
        occurredAt,
        recordedById: actor.userId,
        verifiedAt: new Date(),
        verifiedById: actor.userId,
      })
    }

    await recordAudit(
      {
        action: 'map.green_point_documented',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiative.id,
        entityLabel: body.nameAr,
        summaryAr: `توثيق نقطة خضراء نفّذها ${body.contributorNameAr}`,
        metadata: { lat: body.lat, lng: body.lng },
        ...trace,
      },
      tx,
    )

    return site.id
  })

  const [created] = await db
    .select({
      siteId: initiativeSites.id,
      initiativeId: initiatives.id,
      kind: initiatives.kind,
      initiativeNameAr: initiatives.nameAr,
      siteNameAr: initiativeSites.nameAr,
      contributorNameAr: initiatives.contributorNameAr,
      status: initiativeSites.status,
      initiativeStatus: initiatives.status,
      areaNameAr: areas.nameAr,
      lat: initiativeSites.lat,
      lng: initiativeSites.lng,
    })
    .from(initiativeSites)
    .innerJoin(initiatives, eq(initiativeSites.initiativeId, initiatives.id))
    .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
    .where(eq(initiativeSites.id, siteId))
    .limit(1)

  if (!created) throw new Error('Green point vanished right after creation.')

  response
    .status(201)
    .json({ ...created, lat: Number(created.lat), lng: Number(created.lng) })
}

export const mapRouter = Router()

mapRouter.use(requireAuth, requireStaff, requireCapability('initiatives.view'))

mapRouter.get('/areas', getAreas)

mapRouter.get(
  '/points',
  validate({ query: listPointsQuerySchema }),
  getPoints,
)

mapRouter.post(
  '/green-points',
  requireCapability('initiatives.manage'),
  validate({ body: createGreenPointBodySchema }),
  postGreenPoint,
)
