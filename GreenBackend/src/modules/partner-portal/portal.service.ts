import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import {
  charterAcknowledgements,
  charterVersions,
} from '../../db/schema/charter.js'
import {
  attendance,
  fieldGroupMembers,
  fieldGroups,
} from '../../db/schema/field.js'
import { areas } from '../../db/schema/geo.js'
import { lookupValues } from '../../db/schema/lookups.js'
import {
  partnerConsentEvents,
  partnerContacts,
  partnerPartnerships,
  partnerSupportForms,
  partners,
} from '../../db/schema/partners.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { lookupRefs, requireRef } from '../lookups/lookups.service.js'
import type { DisplayConsentBody, UpdateSelfBody } from './portal.schemas.js'

/**
 * كل دالة هنا تأخذ الجهة من `context.partner` لا من الطلب.
 *
 * لا يوجد معرّف جهة في أي مسار من مسارات البوابة، فلا سطح لتغييره.
 * هذا أقوى من فحص التطابق، لأنه يزيل الحقل الذي يُفحص أصلًا.
 */
function scopedPartnerId(context: AuthContext) {
  const partnerId = context.partner?.id

  if (!partnerId) throw errors.forbidden()

  return partnerId
}

export async function loadSelf(context: AuthContext) {
  const partnerId = scopedPartnerId(context)

  const [row] = await db
    .select()
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1)

  if (!row) throw errors.notFound('الجهة غير موجودة.')

  const [partnerships, contacts, acknowledgements, supportForms, refs] =
    await Promise.all([
    db
      .select({
        type: partnerPartnerships.type,
        status: partnerPartnerships.status,
        approvedAt: partnerPartnerships.approvedAt,
      })
      .from(partnerPartnerships)
      .where(
        and(
          eq(partnerPartnerships.partnerId, partnerId),
          sql`${partnerPartnerships.status} <> 'ENDED'`,
        ),
      ),

    db
      .select({
        id: partnerContacts.id,
        fullNameAr: partnerContacts.fullNameAr,
        jobTitleAr: partnerContacts.jobTitleAr,
        email: partnerContacts.email,
        phone: partnerContacts.phone,
        isPrimary: partnerContacts.isPrimary,
      })
      .from(partnerContacts)
      .where(
        and(
          eq(partnerContacts.partnerId, partnerId),
          eq(partnerContacts.status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(partnerContacts.isPrimary)),

    db
      .select({
        charterVersion: charterVersions.version,
        acknowledgedAt: charterAcknowledgements.acknowledgedAt,
        acknowledgedByNameAr: charterAcknowledgements.acknowledgedByNameAr,
      })
      .from(charterAcknowledgements)
      .innerJoin(
        charterVersions,
        eq(charterAcknowledgements.charterVersionId, charterVersions.id),
      )
      .where(eq(charterAcknowledgements.partnerId, partnerId))
      .orderBy(desc(charterAcknowledgements.acknowledgedAt)),

    db
      .select({
        id: lookupValues.id,
        code: lookupValues.code,
        nameAr: lookupValues.nameAr,
        isActive: lookupValues.isActive,
      })
      .from(partnerSupportForms)
      .innerJoin(lookupValues, eq(partnerSupportForms.valueId, lookupValues.id))
      .where(eq(partnerSupportForms.partnerId, partnerId))
      .orderBy(lookupValues.displayOrder),

    lookupRefs([row.organizationKindId]),
  ])

  return {
    id: row.id,
    displayNameAr: row.displayNameAr,
    legalNameAr: row.legalNameAr,
    nameEn: row.nameEn,
    organizationKind: requireRef(refs, row.organizationKindId),
    stage: row.stage,
    isSuspended: row.suspendedAt !== null,
    suspensionReasonAr: row.suspensionReasonAr,
    websiteUrl: row.websiteUrl,
    summaryAr: row.summaryAr,
    supportForms,
    publicNameConsent: row.publicNameConsent,
    publicLogoConsent: row.publicLogoConsent,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    partnerships: partnerships.map((item) => ({
      type: item.type,
      status: item.status,
      approvedAt: item.approvedAt?.toISOString() ?? null,
    })),
    contacts,
    acknowledgements: acknowledgements.map((item) => ({
      charterVersion: item.charterVersion,
      acknowledgedAt: item.acknowledgedAt.toISOString(),
      acknowledgedByNameAr: item.acknowledgedByNameAr,
    })),
  }
}

/**
 * فرق الجهة في الميدان، بأعدادها وحدها.
 *
 * لا أسماء ولا هواتف: المتطوع أعطى بياناته للمشروع ليُنظَّم يومه، لا للجهة
 * التي جاء معها. الجهة تعرف كم حضر من فريقها، لا من.
 *
 * والمبادرات التي لم يبدأ تنفيذها لا تظهر: مسودة أو تخطيط قد يتغيّر، وفريق
 * يراه الشريك في بوابته وعدٌ لم يُقطع بعد.
 */
export async function loadFieldTeams(context: AuthContext) {
  const partnerId = scopedPartnerId(context)

  const count = (condition: ReturnType<typeof sql>) =>
    sql<number>`(
      select count(*)::int from ${fieldGroupMembers}
       where ${fieldGroupMembers.groupId} = ${fieldGroups.id}
         ${condition}
    )`

  const rows = await db
    .select({
      groupId: fieldGroups.id,
      groupNameAr: fieldGroups.nameAr,
      initiativeNameAr: initiatives.nameAr,
      initiativeStatus: initiatives.status,
      siteNameAr: initiativeSites.nameAr,
      areaNameAr: areas.nameAr,
      meetsAt: fieldGroups.meetsAt,
      memberCount: count(sql``),
      comingCount: count(sql`and ${fieldGroupMembers.rsvp} = 'COMING'`),
      attendedCount: sql<number>`(
        select count(distinct ${attendance.participantId})::int
          from ${attendance}
         where ${attendance.groupId} = ${fieldGroups.id}
           and ${attendance.undoneAt} is null
      )`,
      attendanceDays: sql<number>`(
        select count(*)::int from ${attendance}
         where ${attendance.groupId} = ${fieldGroups.id}
           and ${attendance.undoneAt} is null
      )`,
      lastAttendedOn: sql<string | null>`(
        select max(${attendance.attendedOn})::text from ${attendance}
         where ${attendance.groupId} = ${fieldGroups.id}
           and ${attendance.undoneAt} is null
      )`,
    })
    .from(fieldGroups)
    .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
    .where(
      and(
        eq(fieldGroups.partnerId, partnerId),
        inArray(initiatives.status, ['ACTIVE', 'COMPLETED']),
      ),
    )
    // الأحدث موعدًا أولًا؛ DESC في Postgres يضع NULL أولًا، فيُنزَّل صراحةً.
    .orderBy(sql`${fieldGroups.meetsAt} desc nulls last`, fieldGroups.nameAr)

  return rows.map((row) => ({
    ...row,
    meetsAt: row.meetsAt?.toISOString() ?? null,
  }))
}

export async function updateSelf(
  context: AuthContext,
  input: UpdateSelfBody,
  trace: RequestTrace,
) {
  const partnerId = scopedPartnerId(context)

  const changes = {
    ...(input.displayNameAr
      ? { displayNameAr: normalizeText(input.displayNameAr) }
      : {}),
    ...(input.nameEn !== undefined ? { nameEn: input.nameEn || null } : {}),
    ...(input.websiteUrl !== undefined
      ? { websiteUrl: input.websiteUrl || null }
      : {}),
    ...(input.summaryAr !== undefined ? { summaryAr: input.summaryAr || null } : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(partners).set(changes).where(eq(partners.id, partnerId))

      await recordAudit(
        {
          action: 'partner.self_updated',
          actorUserId: context.userId,
          entityType: 'partner',
          entityId: partnerId,
          summaryAr: 'تحديث الجهة لبياناتها من البوابة',
          metadata: { fields: Object.keys(changes) },
          partnerVisible: true,
          ...trace,
        },
        tx,
      )
    })
  }

  return loadSelf(context)
}

/**
 * موافقة الإظهار الذاتية.
 *
 * تمر بالمسار نفسه الذي يمر به قرار الإدارة: حدث في السجل ثم تحديث
 * العمود المرآة في معاملة واحدة. الفرق `source` وحده، ليبقى واضحًا من
 * قرر — الجهة أم مكتب العلاقات.
 */
export async function updateDisplayConsent(
  context: AuthContext,
  input: DisplayConsentBody,
  trace: RequestTrace,
) {
  const partnerId = scopedPartnerId(context)
  const now = new Date()

  const decisions = [
    input.publicNameConsent === undefined
      ? null
      : { consentType: 'PUBLIC_NAME' as const, granted: input.publicNameConsent },
    input.publicLogoConsent === undefined
      ? null
      : { consentType: 'PUBLIC_LOGO' as const, granted: input.publicLogoConsent },
  ].filter((value) => value !== null)

  if (decisions.length === 0) {
    throw errors.badRequest('لم تُحدَّد أي موافقة للتغيير.')
  }

  await db.transaction(async (tx) => {
    for (const decision of decisions) {
      await tx.insert(partnerConsentEvents).values({
        partnerId,
        consentType: decision.consentType,
        action: decision.granted ? 'GRANTED' : 'REVOKED',
        source: 'PARTNER_SELF',
        actedAt: now,
        actorUserId: context.userId,
        actorNameAr: context.fullNameAr,
      })

      await tx
        .update(partners)
        .set(
          decision.consentType === 'PUBLIC_NAME'
            ? {
                publicNameConsent: decision.granted,
                publicNameConsentAt: decision.granted ? now : null,
              }
            : {
                publicLogoConsent: decision.granted,
                publicLogoConsentAt: decision.granted ? now : null,
              },
        )
        .where(eq(partners.id, partnerId))

      await recordAudit(
        {
          action: `partner.consent_${decision.granted ? 'granted' : 'revoked'}`,
          severity: 'NOTICE',
          actorUserId: context.userId,
          entityType: 'partner',
          entityId: partnerId,
          summaryAr: `${decision.granted ? 'منح' : 'سحب'} موافقة الإظهار من البوابة`,
          metadata: { consentType: decision.consentType, source: 'PARTNER_SELF' },
          partnerVisible: true,
          ...trace,
        },
        tx,
      )
    }
  })

  return loadSelf(context)
}
