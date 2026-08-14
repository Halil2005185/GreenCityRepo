import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { Router } from 'express'
import type { RequestHandler } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import { requireStaff } from '../../common/middleware/authorize.js'
import { db } from '../../db/client.js'
import { impactEntries, metrics } from '../../db/schema/metrics.js'
import { partners } from '../../db/schema/partners.js'
import { initiatives } from '../../db/schema/programs.js'
import { workItems } from '../../db/schema/work.js'
import type { AuthContext } from '../access/access.service.js'

/** الحالات التي يبقى العمل فيها حيًّا. */
const OPEN: Array<'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'IN_REVIEW'> = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
]

type TaskCounts = {
  open: number
  overdue: number
  blocked: number
  inReview: number
}

/**
 * تُحسب الأعداد الأربعة في استعلام واحد بـ`filter`.
 *
 * أربعة استعلامات منفصلة كانت ستمسح الجدول أربع مرات لتجيب عن أسئلة عن
 * الصفوف نفسها.
 */
async function countTasks(where: ReturnType<typeof and>) {
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${workItems.status} in ('TODO','IN_PROGRESS','BLOCKED','IN_REVIEW'))::int`,
      overdue: sql<number>`count(*) filter (
        where ${workItems.dueAt} < now()
          and ${workItems.status} not in ('DONE','CANCELLED')
      )::int`,
      blocked: sql<number>`count(*) filter (where ${workItems.status} = 'BLOCKED')::int`,
      inReview: sql<number>`count(*) filter (where ${workItems.status} = 'IN_REVIEW')::int`,
    })
    .from(workItems)
    .where(where)

  return (row ?? { open: 0, overdue: 0, blocked: 0, inReview: 0 }) as TaskCounts
}

async function loadPartners(viewer: AuthContext) {
  if (!viewer.capabilities.includes('partners.view')) return null

  const [row] = await db
    .select({
      pipeline: sql<number>`count(*) filter (
        where ${partners.stage} in ('NEW','CONTACTED','QUALIFIED','NEGOTIATION','ON_HOLD')
      )::int`,
      pendingApproval: sql<number>`count(*) filter (where ${partners.stage} = 'PENDING_APPROVAL')::int`,
      active: sql<number>`count(*) filter (where ${partners.stage} = 'ACTIVE')::int`,
      suspended: sql<number>`count(*) filter (where ${partners.suspendedAt} is not null)::int`,
    })
    .from(partners)

  return row ?? { pipeline: 0, pendingApproval: 0, active: 0, suspended: 0 }
}

async function loadInitiatives(viewer: AuthContext) {
  if (!viewer.capabilities.includes('initiatives.view')) return null

  const [row] = await db
    .select({
      planning: sql<number>`count(*) filter (where ${initiatives.status} in ('DRAFT','PLANNING'))::int`,
      active: sql<number>`count(*) filter (where ${initiatives.status} = 'ACTIVE')::int`,
      campaigns: sql<number>`count(*) filter (where ${initiatives.kind} = 'CAMPAIGN')::int`,
      greenPoints: sql<number>`count(*) filter (where ${initiatives.kind} = 'GREEN_POINT')::int`,
    })
    .from(initiatives)

  return row ?? { planning: 0, active: 0, campaigns: 0, greenPoints: 0 }
}

/**
 * المجاميع الوطنية من القيود الموثّقة وحدها.
 *
 * `SUM` فقط: مؤشرات `MAX` و`LATEST` معناها مرتبط بنطاق واحد، وجمعها عبر
 * كل المبادرات ينتج رقمًا لا يقابل شيئًا في الواقع.
 */
async function loadImpact(viewer: AuthContext) {
  if (!viewer.capabilities.includes('impact.view')) return null

  const rows = await db
    .select({
      metricId: metrics.id,
      metricNameAr: metrics.nameAr,
      unitAr: metrics.unitAr,
      total: sql<string>`coalesce(sum(${impactEntries.value}), 0)`,
    })
    .from(impactEntries)
    .innerJoin(metrics, eq(impactEntries.metricId, metrics.id))
    .where(
      and(
        sql`${impactEntries.verifiedAt} is not null`,
        eq(metrics.aggregation, 'SUM'),
      ),
    )
    .groupBy(metrics.id, metrics.nameAr, metrics.unitAr, metrics.displayOrder)
    .orderBy(metrics.displayOrder)

  return rows.map((row) => ({ ...row, total: Number(row.total) }))
}

const getDashboard: RequestHandler = async (request, response) => {
  const viewer = request.auth!
  const office =
    viewer.memberships.find((membership) => membership.isPrimary) ??
    viewer.memberships[0]

  const [myTasks, officeTasks, partnerCounts, initiativeCounts, impact] =
    await Promise.all([
      countTasks(eq(workItems.assigneeUserId, viewer.userId)),

      office
        ? countTasks(
            or(
              eq(workItems.officeId, office.officeId),
              eq(workItems.followUpOfficeId, office.officeId),
            ),
          )
        : Promise.resolve({ open: 0, overdue: 0, blocked: 0, inReview: 0 }),

      loadPartners(viewer),
      loadInitiatives(viewer),
      loadImpact(viewer),
    ])

  const [unassignedRow] = office
    ? await db
        .select({ total: sql<number>`count(*)::int` })
        .from(workItems)
        .where(
          and(
            or(
              eq(workItems.officeId, office.officeId),
              eq(workItems.followUpOfficeId, office.officeId),
            ),
            isNull(workItems.assigneeUserId),
            inArray(workItems.status, OPEN),
          ),
        )
    : [{ total: 0 }]

  response.status(200).json({
    officeId: office?.officeId ?? null,
    officeNameAr: office?.officeNameAr ?? null,
    myTasks,
    officeTasks: { ...officeTasks, unassigned: unassignedRow?.total ?? 0 },
    partners: partnerCounts,
    initiatives: initiativeCounts,
    impact,
  })
}

export const dashboardRouter = Router()

dashboardRouter.use(requireAuth, requireStaff)

dashboardRouter.get('/', getDashboard)
