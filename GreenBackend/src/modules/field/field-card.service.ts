import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import {
  attachments,
  attendance,
  fieldGroupMembers,
  fieldGroups,
  fieldSettings,
  participantCertificates,
} from '../../db/schema/field.js'
import { formVersions, forms } from '../../db/schema/forms.js'
import { areas } from '../../db/schema/geo.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import { loadScopeProgress } from '../impact/impact.service.js'
import { loadAnnouncements } from './field-announcements.service.js'
import type { ParticipantPrincipal } from './field-auth.js'
import { loadDeletionRequest } from './field-deletion.service.js'
import type * as dto from './field.schemas.js'
import { damascusDay, groupLead } from './field.shared.js'

/** ما يُعرض من صور الموقع في البطاقة؛ البطاقة تُفتح على شبكة الهاتف. */
const CARD_PHOTOS = 12

/**
 * استمارة التقييم كما تصل المتطوع: رابطها على الموقع العام. تُعرض ما دامت
 * منشورة وتستقبل — رابط إلى استمارة مغلقة طريق مسدود.
 */
async function loadFeedback(initiativeId: string) {
  const [row] = await db
    .select({ nameAr: forms.nameAr, slug: forms.slug })
    .from(fieldSettings)
    .innerJoin(forms, eq(fieldSettings.feedbackFormId, forms.id))
    .innerJoin(
      formVersions,
      and(
        eq(formVersions.formId, forms.id),
        eq(formVersions.status, 'PUBLISHED'),
      ),
    )
    .where(
      and(
        eq(fieldSettings.initiativeId, initiativeId),
        eq(forms.isAccepting, true),
      ),
    )
    .limit(1)

  return row
    ? { nameAr: row.nameAr, url: `${env.PUBLIC_SITE_URL}/join/${row.slug}` }
    : null
}

/**
 * ما تحقق في الموقع — **الموثَّق وحده**. المتطوع يرى ما يُعلن للناس لا ما
 * ينتظر التحقق: رقمٌ يراه اليوم ويُعكس غدًا يُفقده الثقة في الاثنين.
 */
async function loadSiteImpact(siteId: string) {
  const progress = await loadScopeProgress({ kind: 'SITE', id: siteId })

  return progress
    .filter((metric) => metric.actual > 0)
    .map((metric) => ({
      metricId: metric.metricId,
      metricNameAr: metric.metricNameAr,
      unitAr: metric.unitAr,
      decimals: metric.decimals,
      value: metric.actual,
    }))
}

/** صور الموقع التي سمح المنسّق بنشرها. غيرها داخلي ولا يخرج من هنا. */
async function loadSitePhotos(siteId: string) {
  const rows = await db
    .select({
      id: attachments.id,
      url: attachments.url,
      captionAr: attachments.captionAr,
      takenAt: attachments.takenAt,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.siteId, siteId),
        eq(attachments.publicUseAllowed, true),
      ),
    )
    .orderBy(desc(attachments.createdAt))
    .limit(CARD_PHOTOS)

  return rows.map((row) => ({
    ...row,
    takenAt: row.takenAt?.toISOString() ?? null,
  }))
}

/** هل فُعّلت الشهادات لمبادرته، وما رمز شهادته إن صدرت. */
async function loadCertificate(principal: ParticipantPrincipal) {
  const [[settings], [issued]] = await Promise.all([
    db
      .select({ enabled: fieldSettings.certificatesEnabled })
      .from(fieldSettings)
      .where(eq(fieldSettings.initiativeId, principal.initiativeId))
      .limit(1),
    db
      .select({ code: participantCertificates.code })
      .from(participantCertificates)
      .where(
        and(
          eq(participantCertificates.participantId, principal.participantId),
          eq(participantCertificates.initiativeId, principal.initiativeId),
        ),
      )
      .limit(1),
  ])

  return { enabled: settings?.enabled ?? false, code: issued?.code ?? null }
}

/**
 * بطاقة المشارك في مبادرة رابطه: أين ومتى ومع من، ثم ما تحقق بعد اليوم.
 *
 * عضوياته في **هذه** المبادرة وحدها: الرابط نطاقه حملة، ومن شارك رابطه
 * أعطى بطاقته فيها لا سجلّه كله.
 */
export async function loadCard(principal: ParticipantPrincipal) {
  const [initiative] = await db
    .select({
      id: initiatives.id,
      nameAr: initiatives.nameAr,
      status: initiatives.status,
    })
    .from(initiatives)
    .where(eq(initiatives.id, principal.initiativeId))
    .limit(1)

  if (!initiative) throw errors.notFound('المبادرة غير موجودة.')

  const rows = await db
    .select({
      memberId: fieldGroupMembers.id,
      role: fieldGroupMembers.role,
      rsvp: fieldGroupMembers.rsvp,
      rsvpAt: fieldGroupMembers.rsvpAt,
      group: {
        id: fieldGroups.id,
        nameAr: fieldGroups.nameAr,
        meetsAt: fieldGroups.meetsAt,
        meetingPointAr: fieldGroups.meetingPointAr,
        instructionsAr: fieldGroups.instructionsAr,
        contactPhone: fieldGroups.contactPhone,
      },
      leadNameAr: groupLead.fullNameAr,
      site: {
        id: initiativeSites.id,
        nameAr: initiativeSites.nameAr,
        descriptionAr: initiativeSites.descriptionAr,
        status: initiativeSites.status,
        lat: initiativeSites.lat,
        lng: initiativeSites.lng,
      },
      areaNameAr: areas.nameAr,
    })
    .from(fieldGroupMembers)
    .innerJoin(fieldGroups, eq(fieldGroupMembers.groupId, fieldGroups.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
    .leftJoin(groupLead, eq(fieldGroups.leadUserId, groupLead.id))
    .where(
      and(
        eq(fieldGroupMembers.participantId, principal.participantId),
        eq(fieldGroups.initiativeId, principal.initiativeId),
      ),
    )
    // ASC في Postgres يضع NULL آخرًا: ما لا موعد له ينزل تحت المجدوَل.
    .orderBy(asc(fieldGroups.meetsAt), asc(fieldGroups.nameAr))

  const groupIds = rows.map((row) => row.group.id)
  const siteIds = [...new Set(rows.map((row) => row.site.id))]

  const [
    attended,
    feedback,
    impact,
    photos,
    announcements,
    certificate,
    deletionRequest,
  ] = await Promise.all([
    groupIds.length > 0
      ? db
          .select({
            groupId: attendance.groupId,
            attendedOn: attendance.attendedOn,
          })
          .from(attendance)
          .where(
            and(
              eq(attendance.participantId, principal.participantId),
              inArray(attendance.groupId, groupIds),
              isNull(attendance.undoneAt),
            ),
          )
          .orderBy(asc(attendance.attendedOn))
      : [],
    loadFeedback(principal.initiativeId),
    Promise.all(
      siteIds.map(async (id) => [id, await loadSiteImpact(id)] as const),
    ),
    Promise.all(
      siteIds.map(async (id) => [id, await loadSitePhotos(id)] as const),
    ),
    loadAnnouncements({
      initiativeId: principal.initiativeId,
      groupIds,
      reader: 'VOLUNTEERS',
    }),
    loadCertificate(principal),
    loadDeletionRequest(principal.participantId),
  ])

  const impactBySite = new Map(impact)
  const photosBySite = new Map(photos)

  return {
    kind: 'PARTICIPANT' as const,
    participant: {
      id: principal.participantId,
      fullNameAr: principal.fullNameAr,
    },
    initiative,
    link: { expiresAt: principal.linkExpiresAt.toISOString() },
    day: damascusDay(new Date()),
    announcements,
    memberships: rows.map((row) => ({
      memberId: row.memberId,
      role: row.role,
      rsvp: row.rsvp,
      rsvpAt: row.rsvpAt?.toISOString() ?? null,
      group: {
        ...row.group,
        meetsAt: row.group.meetsAt?.toISOString() ?? null,
        leadNameAr: row.leadNameAr,
      },
      site: {
        id: row.site.id,
        nameAr: row.site.nameAr,
        descriptionAr: row.site.descriptionAr,
        status: row.site.status,
        areaNameAr: row.areaNameAr,
        lat: row.site.lat === null ? null : Number(row.site.lat),
        lng: row.site.lng === null ? null : Number(row.site.lng),
      },
      attendedOn: attended
        .filter((entry) => entry.groupId === row.group.id)
        .map((entry) => entry.attendedOn),
      impact: impactBySite.get(row.site.id) ?? [],
      photos: photosBySite.get(row.site.id) ?? [],
    })),
    feedback,
    certificate,
    deletionRequest,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * تأكيد الحضور المسبق. حالة تُكتب لا حدث يتراكم: إعادة الطلب نفسه بعد
 * انقطاع تكتب القيمة نفسها، فلا يلزمه معرّف مُرسِل.
 */
export async function setRsvp(
  principal: ParticipantPrincipal,
  input: dto.RsvpBody,
) {
  const [row] = await db
    .select({
      memberId: fieldGroupMembers.id,
      initiativeStatus: initiatives.status,
      siteStatus: initiativeSites.status,
    })
    .from(fieldGroupMembers)
    .innerJoin(fieldGroups, eq(fieldGroupMembers.groupId, fieldGroups.id))
    .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .where(
      and(
        eq(fieldGroupMembers.id, input.memberId),
        eq(fieldGroupMembers.participantId, principal.participantId),
        eq(fieldGroups.initiativeId, principal.initiativeId),
      ),
    )
    .limit(1)

  // عضوية غيره وعضوية غير موجودة جواب واحد.
  if (!row) throw errors.notFound('المجموعة غير موجودة.')

  if (
    row.initiativeStatus === 'COMPLETED' ||
    row.initiativeStatus === 'CANCELLED' ||
    row.siteStatus === 'CANCELLED'
  ) {
    throw errors.conflict(
      'انتهت هذه الحملة أو أُلغي موقعها، فلا يُؤكَّد حضور فيها.',
    )
  }

  await db
    .update(fieldGroupMembers)
    .set({ rsvp: input.coming ? 'COMING' : 'NOT_COMING', rsvpAt: new Date() })
    .where(eq(fieldGroupMembers.id, row.memberId))

  return loadCard(principal)
}
