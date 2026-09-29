import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { normalizeText } from '../../common/utils/text.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import {
  fieldAnnouncements,
  pushJobs,
  pushSubscriptions,
} from '../../db/schema/field-notify.js'
import { fieldGroupMembers, fieldGroups } from '../../db/schema/field.js'
import { users } from '../../db/schema/identity.js'
import { initiatives } from '../../db/schema/programs.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type * as dto from './field-admin.schemas.js'
import { pushEnabled } from './field-push.service.js'
import { DAY_MS } from './field.shared.js'

/** ما يُعرض في الورقة والبطاقة: الأحدث، وما مضى عليه شهر صار تاريخًا. */
const SHOWN = 10
const SHOWN_FOR_DAYS = 30

/** من يقرأ: القائد في ورقته، أو المتطوع في بطاقته. */
export type AnnouncementReader = 'LEADS' | 'VOLUNTEERS'

/**
 * إعلانات تخصّ قارئًا في مجموعاته: ما وُجّه إلى فئته أو إلى الجميع، وإلى
 * مجموعته أو إلى المبادرة كلها.
 */
export async function loadAnnouncements(input: {
  initiativeId: string
  groupIds: string[]
  reader: AnnouncementReader
}) {
  const rows = await db
    .select({
      id: fieldAnnouncements.id,
      titleAr: fieldAnnouncements.titleAr,
      bodyAr: fieldAnnouncements.bodyAr,
      groupNameAr: fieldGroups.nameAr,
      createdAt: fieldAnnouncements.createdAt,
    })
    .from(fieldAnnouncements)
    .leftJoin(fieldGroups, eq(fieldAnnouncements.groupId, fieldGroups.id))
    .where(
      and(
        eq(fieldAnnouncements.initiativeId, input.initiativeId),
        inArray(fieldAnnouncements.audience, ['ALL', input.reader]),
        input.groupIds.length > 0
          ? or(
              isNull(fieldAnnouncements.groupId),
              inArray(fieldAnnouncements.groupId, input.groupIds),
            )
          : isNull(fieldAnnouncements.groupId),
        gte(
          fieldAnnouncements.createdAt,
          new Date(Date.now() - SHOWN_FOR_DAYS * DAY_MS),
        ),
      ),
    )
    .orderBy(desc(fieldAnnouncements.createdAt))
    .limit(SHOWN)

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))
}

// ── المنسّق ────────────────────────────────────────────────────────────

async function requireInitiative(initiativeId: string) {
  const [initiative] = await db
    .select({ id: initiatives.id, nameAr: initiatives.nameAr })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!initiative) throw errors.notFound('المبادرة غير موجودة.')

  return initiative
}

export async function listAnnouncements(initiativeId: string) {
  await requireInitiative(initiativeId)

  const [rows, deliveries] = await Promise.all([
    db
      .select({
        id: fieldAnnouncements.id,
        groupId: fieldAnnouncements.groupId,
        groupNameAr: fieldGroups.nameAr,
        audience: fieldAnnouncements.audience,
        titleAr: fieldAnnouncements.titleAr,
        bodyAr: fieldAnnouncements.bodyAr,
        targetedDevices: fieldAnnouncements.targetedDevices,
        createdByNameAr: users.fullNameAr,
        createdAt: fieldAnnouncements.createdAt,
      })
      .from(fieldAnnouncements)
      .leftJoin(fieldGroups, eq(fieldAnnouncements.groupId, fieldGroups.id))
      .leftJoin(users, eq(fieldAnnouncements.createdById, users.id))
      .where(eq(fieldAnnouncements.initiativeId, initiativeId))
      .orderBy(desc(fieldAnnouncements.createdAt)),

    db
      .select({
        announcementId: pushJobs.announcementId,
        status: pushJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(pushJobs)
      .innerJoin(
        fieldAnnouncements,
        eq(pushJobs.announcementId, fieldAnnouncements.id),
      )
      .where(eq(fieldAnnouncements.initiativeId, initiativeId))
      .groupBy(pushJobs.announcementId, pushJobs.status),
  ])

  const counted = (id: string, statuses: string[]) =>
    deliveries
      .filter(
        (row) => row.announcementId === id && statuses.includes(row.status),
      )
      .reduce((sum, row) => sum + row.count, 0)

  return {
    initiativeId,
    pushEnabled: pushEnabled(),
    announcements: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      devices: {
        targeted: row.targetedDevices,
        sent: counted(row.id, ['SENT']),
        pending: counted(row.id, ['PENDING', 'SENDING']),
        failed: counted(row.id, ['FAILED']),
      },
    })),
  }
}

/**
 * الأجهزة التي يصلها الإعلان: اشتراكات قادة المجموعات المستهدفة، واشتراكات
 * أعضائها في **هذه** المبادرة. تُحسم ساعة الإعلان: من اشترك بعدها يقرأ
 * الإعلان في تطبيقه ولا يصله إشعار عمّا فات.
 */
async function loadTargets(
  initiativeId: string,
  input: Pick<dto.CreateAnnouncementBody, 'groupId' | 'audience'>,
) {
  const groups = await db
    .select({ id: fieldGroups.id, leadUserId: fieldGroups.leadUserId })
    .from(fieldGroups)
    .where(
      and(
        eq(fieldGroups.initiativeId, initiativeId),
        input.groupId ? eq(fieldGroups.id, input.groupId) : undefined,
      ),
    )

  if (input.groupId && groups.length === 0) {
    throw errors.unprocessable('المجموعة ليست من هذه المبادرة.', [
      { path: 'groupId', in: 'body', message: 'المجموعة ليست من هذه المبادرة.' },
    ])
  }

  if (!pushEnabled() || groups.length === 0) return []

  const groupIds = groups.map((group) => group.id)
  const leadIds = [
    ...new Set(
      groups.flatMap((group) => (group.leadUserId ? [group.leadUserId] : [])),
    ),
  ]

  const toLeads =
    input.audience !== 'VOLUNTEERS' && leadIds.length > 0
      ? inArray(pushSubscriptions.userId, leadIds)
      : undefined

  const toVolunteers =
    input.audience !== 'LEADS'
      ? and(
          eq(pushSubscriptions.initiativeId, initiativeId),
          inArray(
            pushSubscriptions.participantId,
            db
              .select({ id: fieldGroupMembers.participantId })
              .from(fieldGroupMembers)
              .where(inArray(fieldGroupMembers.groupId, groupIds)),
          ),
        )
      : undefined

  if (!toLeads && !toVolunteers) return []

  return db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(or(toLeads, toVolunteers))
}

export async function createAnnouncement(
  initiativeId: string,
  input: dto.CreateAnnouncementBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)
  const targets = await loadTargets(initiativeId, input)

  const titleAr = normalizeText(input.titleAr)
  const bodyAr = input.bodyAr.trim()

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(fieldAnnouncements)
      .values({
        initiativeId,
        groupId: input.groupId ?? null,
        audience: input.audience,
        titleAr,
        bodyAr,
        targetedDevices: targets.length,
        createdById: actor.userId,
      })
      .returning({ id: fieldAnnouncements.id })

    if (!created) throw new Error('Failed to create the announcement.')

    if (targets.length > 0) {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + env.PUSH_TTL_MINUTES * 60_000)

      await tx.insert(pushJobs).values(
        targets.map((target) => ({
          subscriptionId: target.id,
          announcementId: created.id,
          // الوسم معرّف الإعلان: إشعار أُعيد إرساله يحلّ محل نفسه لا يتكرر.
          payload: {
            title: titleAr,
            body: bodyAr,
            url: '/app/home',
            tag: created.id,
          },
          /**
           * بساعة الخادم لا بساعة القاعدة: العامل يقارن بساعته هو، وفرق
           * ثانية بين الساعتين يؤخّر «تغيّر الموعد» دورةً كاملة.
           */
          availableAt: now,
          expiresAt,
        })),
      )
    }

    await recordAudit(
      {
        action: 'field.announcement_created',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: `إعلان للميدان: ${titleAr}`,
        metadata: {
          announcementId: created.id,
          groupId: input.groupId ?? null,
          audience: input.audience,
          targetedDevices: targets.length,
        },
        ...trace,
      },
      tx,
    )
  })

  return listAnnouncements(initiativeId)
}

/**
 * حذف إعلان يزيله من التطبيق ويوقف ما لم يُرسَل من إشعاراته. ما وصل هاتفًا
 * وصل: الإشعار لا يُستردّ.
 */
export async function deleteAnnouncement(
  initiativeId: string,
  announcementId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(fieldAnnouncements)
      .where(
        and(
          eq(fieldAnnouncements.id, announcementId),
          eq(fieldAnnouncements.initiativeId, initiativeId),
        ),
      )
      .returning({ titleAr: fieldAnnouncements.titleAr })

    if (!removed) throw errors.notFound('الإعلان غير موجود.')

    await recordAudit(
      {
        action: 'field.announcement_deleted',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: `حذف إعلان للميدان: ${removed.titleAr}`,
        metadata: { announcementId },
        ...trace,
      },
      tx,
    )
  })

  return listAnnouncements(initiativeId)
}
