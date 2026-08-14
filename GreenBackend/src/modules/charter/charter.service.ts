import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import { charterVersions } from '../../db/schema/charter.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'

type Row = typeof charterVersions.$inferSelect

function serialize(row: Row, isCurrent: boolean) {
  return {
    id: row.id,
    version: row.version,
    titleAr: row.titleAr,
    summaryAr: row.summaryAr,
    bodyAr: row.bodyAr,
    principlesAr: row.principlesAr,
    commitmentsAr: row.commitmentsAr,
    effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    isCurrent,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * «الحالي» = آخر إصدار منشور حسب تاريخ السريان.
 *
 * لا يوجد عمود `isCurrent` في القاعدة عمدًا: عمود منطقي كهذا يحتاج
 * معاملة تُطفئه عن السابق وتُشعله للجديد، وأي فشل بينهما يترك إصدارين
 * حاليين أو صفرًا. الاشتقاق من التاريخ لا يمكن أن يتناقض.
 */
export async function findCurrentVersion() {
  const [row] = await db
    .select()
    .from(charterVersions)
    .where(isNotNull(charterVersions.publishedAt))
    .orderBy(desc(charterVersions.effectiveFrom), desc(charterVersions.publishedAt))
    .limit(1)

  return row ?? null
}

export async function getCurrentVersion() {
  const row = await findCurrentVersion()

  if (!row) {
    throw errors.notFound('لا يوجد إصدار منشور من الميثاق بعد.')
  }

  return serialize(row, true)
}

export async function listVersions() {
  const rows = await db
    .select()
    .from(charterVersions)
    .orderBy(desc(charterVersions.createdAt))

  const current = await findCurrentVersion()

  return rows.map((row) => serialize(row, row.id === current?.id))
}

export async function createVersion(
  input: {
    version: string
    titleAr: string
    summaryAr?: string | undefined
    bodyAr: string
    principlesAr: string[]
    commitmentsAr: string[]
  },
  actor: AuthContext,
  trace: RequestTrace,
) {
  const [existing] = await db
    .select({ id: charterVersions.id })
    .from(charterVersions)
    .where(eq(charterVersions.version, input.version))
    .limit(1)

  if (existing) {
    throw errors.conflict(`رقم الإصدار «${input.version}» مستخدم بالفعل.`)
  }

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(charterVersions)
      .values({
        version: input.version,
        titleAr: input.titleAr,
        bodyAr: input.bodyAr,
        principlesAr: input.principlesAr,
        commitmentsAr: input.commitmentsAr,
        createdById: actor.userId,
        ...(input.summaryAr ? { summaryAr: input.summaryAr } : {}),
      })
      .returning()

    if (!created) throw new Error('Failed to create charter version.')

    await recordAudit(
      {
        action: 'charter.version_created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'charter_version',
        entityId: created.id,
        entityLabel: created.version,
        summaryAr: `إنشاء مسودة الميثاق ${created.version}`,
        ...trace,
      },
      tx,
    )

    return created
  })

  return serialize(row, false)
}

export async function publishVersion(
  versionId: string,
  effectiveFrom: Date,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const [existing] = await db
    .select()
    .from(charterVersions)
    .where(eq(charterVersions.id, versionId))
    .limit(1)

  if (!existing) throw errors.notFound('الإصدار غير موجود.')

  if (existing.publishedAt) {
    throw errors.conflict(
      'الإصدار منشور بالفعل. أنشئ إصدارًا جديدًا بدل تعديل منشور، لأن جهات أقرّت بنصه.',
    )
  }

  const row = await db.transaction(async (tx) => {
    const [published] = await tx
      .update(charterVersions)
      .set({
        publishedAt: new Date(),
        publishedById: actor.userId,
        effectiveFrom,
      })
      .where(
        and(
          eq(charterVersions.id, versionId),
          // حارس تزامن: نشرتان متوازيتان لا تنجح إلا أولاهما، لأن
          // الثانية لن تجد صفًّا غير منشور تحدّثه.
          isNull(charterVersions.publishedAt),
        ),
      )
      .returning()

    if (!published) {
      throw errors.conflict('نُشر الإصدار للتو من طلب آخر.')
    }

    await recordAudit(
      {
        action: 'charter.version_published',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'charter_version',
        entityId: published.id,
        entityLabel: published.version,
        summaryAr: `نشر الميثاق ${published.version} — يصبح المرجع لكل إقرار جديد`,
        metadata: { effectiveFrom: effectiveFrom.toISOString() },
        ...trace,
      },
      tx,
    )

    return published
  })

  return serialize(row, true)
}
