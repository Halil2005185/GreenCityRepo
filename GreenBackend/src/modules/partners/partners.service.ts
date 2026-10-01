import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { type AnyPgColumn, type PgTable, alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { normalizeEmail, normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import {
  charterAcknowledgements,
  charterVersions,
} from '../../db/schema/charter.js'
import { users } from '../../db/schema/identity.js'
import { lookupValues } from '../../db/schema/lookups.js'
import {
  partnerConsentEvents,
  partnerContacts,
  partnerInteractions,
  partnerMediaChannels,
  partnerPartnerships,
  partnerSupportForms,
  partners,
} from '../../db/schema/partners.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { findCurrentVersion } from '../charter/charter.service.js'
import type { LookupRef } from '../lookups/lookup-ref.schema.js'
import {
  assertLookupValues,
  lookupRefs,
  lookupValueIdSql,
  optionalRef,
  requireRef,
} from '../lookups/lookups.service.js'
import type * as dto from './partners.schemas.js'

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

const accountManager = alias(users, 'account_manager')
const partnershipApprover = alias(users, 'partnership_approver')
const interactionRecorder = alias(users, 'interaction_recorder')

/** جدول ربط بين الجهة وقيم تعريف متعدد الاختيار. */
type ValueLink = { table: PgTable; partner: AnyPgColumn; value: AnyPgColumn }

const MEDIA_CHANNEL_LINK: ValueLink = {
  table: partnerMediaChannels,
  partner: partnerMediaChannels.partnerId,
  value: partnerMediaChannels.channelId,
}

const SUPPORT_FORM_LINK: ValueLink = {
  table: partnerSupportForms,
  partner: partnerSupportForms.partnerId,
  value: partnerSupportForms.valueId,
}

/**
 * القيم المتعددة لمجموعة جهات — أشكال العمل الإعلامي وأشكال الدعم — بترتيب
 * التعريف لا بترتيب الإدخال، فتظهر بالترتيب نفسه على كل جهة.
 */
async function linkedValuesFor(
  link: ValueLink,
  partnerIds: string[],
  tx: Executor = db,
) {
  const grouped = new Map<string, LookupRef[]>()

  if (partnerIds.length === 0) return grouped

  const rows = await tx
    .select({
      partnerId: link.partner,
      id: lookupValues.id,
      code: lookupValues.code,
      nameAr: lookupValues.nameAr,
      isActive: lookupValues.isActive,
    })
    .from(link.table)
    .innerJoin(lookupValues, eq(link.value, lookupValues.id))
    .where(inArray(link.partner, partnerIds))
    .orderBy(asc(lookupValues.displayOrder))

  for (const { partnerId, ...ref } of rows) {
    const key = partnerId as string
    const list = grouped.get(key) ?? []

    list.push(ref)
    grouped.set(key, list)
  }

  return grouped
}

async function replaceMediaChannels(
  tx: Executor,
  partnerId: string,
  channelIds: string[],
) {
  await tx
    .delete(partnerMediaChannels)
    .where(eq(partnerMediaChannels.partnerId, partnerId))

  if (channelIds.length === 0) return

  await tx
    .insert(partnerMediaChannels)
    .values(
      [...new Set(channelIds)].map((channelId) => ({ partnerId, channelId })),
    )
}

async function replaceSupportForms(
  tx: Executor,
  partnerId: string,
  valueIds: string[],
) {
  await tx
    .delete(partnerSupportForms)
    .where(eq(partnerSupportForms.partnerId, partnerId))

  if (valueIds.length === 0) return

  await tx
    .insert(partnerSupportForms)
    .values([...new Set(valueIds)].map((valueId) => ({ partnerId, valueId })))
}

const REQUIREMENT_LABELS = {
  PRIMARY_CONTACT: 'جهة اتصال رئيسية نشطة',
  APPROVED_PARTNERSHIP: 'نوع شراكة معتمد واحد على الأقل',
  CHARTER_ACKNOWLEDGEMENT: 'إقرار بالإصدار الساري من الميثاق',
} as const

/**
 * شروط التفعيل الثلاثة من PLAN.md.
 *
 * تُحسب في كل قراءة لا عند الضغط على الزر فقط، فتظهر في صفحة الجهة
 * كقائمة تحقق حيّة. موافقة الإظهار عمدًا خارج القائمة: الميثاق يجعلها
 * مستقلة، وجهة قد تشارك بفاعلية وترفض الظهور العلني.
 */
async function activationRequirements(partnerId: string, tx: Executor = db) {
  const [primaryContact] = await tx
    .select({ id: partnerContacts.id })
    .from(partnerContacts)
    .where(
      and(
        eq(partnerContacts.partnerId, partnerId),
        eq(partnerContacts.isPrimary, true),
        eq(partnerContacts.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  const [approvedPartnership] = await tx
    .select({ id: partnerPartnerships.id })
    .from(partnerPartnerships)
    .where(
      and(
        eq(partnerPartnerships.partnerId, partnerId),
        eq(partnerPartnerships.status, 'APPROVED'),
      ),
    )
    .limit(1)

  const current = await findCurrentVersion()

  const acknowledgement = current
    ? (
        await tx
          .select({ id: charterAcknowledgements.id })
          .from(charterAcknowledgements)
          .where(
            and(
              eq(charterAcknowledgements.partnerId, partnerId),
              eq(charterAcknowledgements.charterVersionId, current.id),
            ),
          )
          .limit(1)
      )[0]
    : undefined

  const requirements = [
    { key: 'PRIMARY_CONTACT' as const, satisfied: Boolean(primaryContact) },
    {
      key: 'APPROVED_PARTNERSHIP' as const,
      satisfied: Boolean(approvedPartnership),
    },
    {
      key: 'CHARTER_ACKNOWLEDGEMENT' as const,
      satisfied: Boolean(acknowledgement),
    },
  ].map((requirement) => ({
    ...requirement,
    labelAr: REQUIREMENT_LABELS[requirement.key],
  }))

  return {
    satisfied: requirements.every((requirement) => requirement.satisfied),
    requirements,
    currentCharterVersionId: current?.id ?? null,
  }
}

// ── القراءة ────────────────────────────────────────────────────────────

export async function listPartners(
  filters: dto.ListPartnersQuery,
): Promise<unknown[]> {
  const conditions = [
    filters.stage ? eq(partners.stage, filters.stage) : undefined,
    filters.q
      ? or(
          ilike(partners.displayNameAr, `%${filters.q}%`),
          ilike(partners.legalNameAr, `%${filters.q}%`),
          ilike(partners.nameEn, `%${filters.q}%`),
        )
      : undefined,
    filters.type
      ? sql`exists (
          select 1 from ${partnerPartnerships}
          where ${partnerPartnerships.partnerId} = ${partners.id}
            and ${partnerPartnerships.type} = ${filters.type}
            and ${partnerPartnerships.status} <> 'ENDED'
        )`
      : undefined,
    filters.contactPriorityId
      ? eq(partners.contactPriorityId, filters.contactPriorityId)
      : undefined,
    filters.engagementHorizonId
      ? eq(partners.engagementHorizonId, filters.engagementHorizonId)
      : undefined,
    filters.relationshipTypeId
      ? eq(partners.relationshipTypeId, filters.relationshipTypeId)
      : undefined,
    filters.channelId
      ? sql`exists (
          select 1 from ${partnerMediaChannels}
          where ${partnerMediaChannels.partnerId} = ${partners.id}
            and ${partnerMediaChannels.channelId} = ${filters.channelId}
        )`
      : undefined,
    filters.staleDays
      ? sql`${partners.lastContactAt} is null
            or ${partners.lastContactAt}
               < now() - make_interval(days => ${filters.staleDays})`
      : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      id: partners.id,
      displayNameAr: partners.displayNameAr,
      legalNameAr: partners.legalNameAr,
      organizationKindId: partners.organizationKindId,
      stage: partners.stage,
      suspendedAt: partners.suspendedAt,
      publicNameConsent: partners.publicNameConsent,
      publicLogoConsent: partners.publicLogoConsent,
      contactPriorityId: partners.contactPriorityId,
      engagementHorizonId: partners.engagementHorizonId,
      relationshipTypeId: partners.relationshipTypeId,
      lastContactAt: partners.lastContactAt,
      activatedAt: partners.activatedAt,
      createdAt: partners.createdAt,
      accountManagerNameAr: accountManager.fullNameAr,
    })
    .from(partners)
    .leftJoin(accountManager, eq(partners.accountManagerId, accountManager.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(partners.createdAt))
    .limit(300)

  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)

  /**
   * أنواع الشراكة وجهة الاتصال الرئيسية تُجلب في استعلامين إضافيين
   * وتُدمج هنا، بدل تجميعها داخل استعلام القائمة. أوضح للقراءة وأرخص
   * من دالة تجميع فوق `join` يضاعف الصفوف.
   */
  const typeRows = await db
    .select({
      partnerId: partnerPartnerships.partnerId,
      type: partnerPartnerships.type,
    })
    .from(partnerPartnerships)
    .where(
      and(
        inArray(partnerPartnerships.partnerId, ids),
        sql`${partnerPartnerships.status} <> 'ENDED'`,
      ),
    )

  const contactRows = await db
    .select({
      partnerId: partnerContacts.partnerId,
      fullNameAr: partnerContacts.fullNameAr,
    })
    .from(partnerContacts)
    .where(
      and(
        inArray(partnerContacts.partnerId, ids),
        eq(partnerContacts.isPrimary, true),
        eq(partnerContacts.status, 'ACTIVE'),
      ),
    )

  const typesByPartner = new Map<string, string[]>()
  for (const row of typeRows) {
    typesByPartner.set(row.partnerId, [
      ...(typesByPartner.get(row.partnerId) ?? []),
      row.type,
    ])
  }

  const contactByPartner = new Map(
    contactRows.map((row) => [row.partnerId, row.fullNameAr]),
  )

  const channelsByPartner = await linkedValuesFor(MEDIA_CHANNEL_LINK, ids)
  const refs = await lookupRefs(
    rows.flatMap((row) => [
      row.organizationKindId,
      row.contactPriorityId,
      row.engagementHorizonId,
      row.relationshipTypeId,
    ]),
  )

  return rows.map((row) => ({
    id: row.id,
    displayNameAr: row.displayNameAr,
    legalNameAr: row.legalNameAr,
    organizationKind: requireRef(refs, row.organizationKindId),
    stage: row.stage,
    isSuspended: row.suspendedAt !== null,
    partnershipTypes: typesByPartner.get(row.id) ?? [],
    accountManagerNameAr: row.accountManagerNameAr,
    primaryContactNameAr: contactByPartner.get(row.id) ?? null,
    publicNameConsent: row.publicNameConsent,
    publicLogoConsent: row.publicLogoConsent,
    contactPriority: requireRef(refs, row.contactPriorityId),
    engagementHorizon: optionalRef(refs, row.engagementHorizonId),
    relationshipType: optionalRef(refs, row.relationshipTypeId),
    mediaChannels: channelsByPartner.get(row.id) ?? [],
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** يُستدعى بعد كل تعديل ليعود الملف الكامل للواجهة في نداء واحد. */
export async function loadPartnerDetail(
  partnerId: string,
  viewer: AuthContext,
) {
  const [partner] = await db
    .select({
      partner: partners,
      accountManagerNameAr: accountManager.fullNameAr,
    })
    .from(partners)
    .leftJoin(accountManager, eq(partners.accountManagerId, accountManager.id))
    .where(eq(partners.id, partnerId))
    .limit(1)

  if (!partner) throw errors.notFound('الجهة غير موجودة.')

  const row = partner.partner

  const [contacts, partnerships, consentEvents, acknowledgements, interactions] =
    await Promise.all([
      db
        .select()
        .from(partnerContacts)
        .where(eq(partnerContacts.partnerId, partnerId))
        .orderBy(desc(partnerContacts.isPrimary), desc(partnerContacts.createdAt)),

      db
        .select({
          row: partnerPartnerships,
          approvedByNameAr: partnershipApprover.fullNameAr,
        })
        .from(partnerPartnerships)
        .leftJoin(
          partnershipApprover,
          eq(partnerPartnerships.approvedById, partnershipApprover.id),
        )
        .where(eq(partnerPartnerships.partnerId, partnerId))
        .orderBy(desc(partnerPartnerships.createdAt)),

      /**
       * `consentType` مفتاح ترتيب ثانوي لا تجميلي: قرار الاسم وقرار
       * الشعار قد يُسجَّلان في المعاملة نفسها فيتطابق طابعهما الزمني،
       * وبلا مفتاح ثانٍ يتبدّل ترتيبهما بين قراءة وأخرى.
       */
      db
        .select()
        .from(partnerConsentEvents)
        .where(eq(partnerConsentEvents.partnerId, partnerId))
        .orderBy(
          desc(partnerConsentEvents.actedAt),
          asc(partnerConsentEvents.consentType),
        ),

      db
        .select({
          row: charterAcknowledgements,
          charterVersion: charterVersions.version,
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
          row: partnerInteractions,
          recordedByNameAr: interactionRecorder.fullNameAr,
        })
        .from(partnerInteractions)
        .leftJoin(
          interactionRecorder,
          eq(partnerInteractions.recordedById, interactionRecorder.id),
        )
        .where(eq(partnerInteractions.partnerId, partnerId))
        .orderBy(desc(partnerInteractions.occurredAt))
        .limit(100),
    ])

  const activation = await activationRequirements(partnerId)
  const channelsByPartner = await linkedValuesFor(MEDIA_CHANNEL_LINK, [partnerId])
  const formsByPartner = await linkedValuesFor(SUPPORT_FORM_LINK, [partnerId])
  const refs = await lookupRefs([
    row.organizationKindId,
    row.contactPriorityId,
    row.engagementHorizonId,
    row.relationshipTypeId,
    ...acknowledgements.map((item) => item.row.methodId),
    ...interactions.map((item) => item.row.kindId),
  ])

  /** الملاحظات الداخلية لا تخرج إلا لمن يملك القدرة صراحةً. */
  const canSeeNotes = viewer.capabilities.includes('partners.notes.view')

  return {
    id: row.id,
    displayNameAr: row.displayNameAr,
    legalNameAr: row.legalNameAr,
    nameEn: row.nameEn,
    slug: row.slug,
    organizationKind: requireRef(refs, row.organizationKindId),
    stage: row.stage,
    isSuspended: row.suspendedAt !== null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspensionReasonAr: row.suspensionReasonAr,
    websiteUrl: row.websiteUrl,
    summaryAr: row.summaryAr,
    supportForms: formsByPartner.get(partnerId) ?? [],
    accountManagerId: row.accountManagerId,
    accountManagerNameAr: partner.accountManagerNameAr,
    contactPriority: requireRef(refs, row.contactPriorityId),
    engagementHorizon: optionalRef(refs, row.engagementHorizonId),
    relationshipType: optionalRef(refs, row.relationshipTypeId),
    mediaChannels: channelsByPartner.get(partnerId) ?? [],
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    internalNotesAr: canSeeNotes ? row.internalNotesAr : null,
    rejectionReasonAr: row.rejectionReasonAr,
    publicNameConsent: row.publicNameConsent,
    publicLogoConsent: row.publicLogoConsent,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    partnershipTypes: partnerships
      .filter((item) => item.row.status !== 'ENDED')
      .map((item) => item.row.type),
    primaryContactNameAr:
      contacts.find((contact) => contact.isPrimary && contact.status === 'ACTIVE')
        ?.fullNameAr ?? null,

    contacts: contacts.map((contact) => ({
      id: contact.id,
      fullNameAr: contact.fullNameAr,
      jobTitleAr: contact.jobTitleAr,
      email: contact.email,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
      status: contact.status,
      hasAccount: contact.linkedUserId !== null,
    })),

    partnerships: partnerships.map((item) => ({
      id: item.row.id,
      type: item.row.type,
      status: item.row.status,
      approvedAt: item.row.approvedAt?.toISOString() ?? null,
      approvedByNameAr: item.approvedByNameAr,
      notesAr: item.row.notesAr,
    })),

    consentEvents: consentEvents.map((event) => ({
      id: event.id,
      consentType: event.consentType,
      action: event.action,
      source: event.source,
      actedAt: event.actedAt.toISOString(),
      actorNameAr: event.actorNameAr,
      noteAr: event.noteAr,
    })),

    acknowledgements: acknowledgements.map((item) => ({
      id: item.row.id,
      charterVersionId: item.row.charterVersionId,
      charterVersion: item.charterVersion,
      acknowledgedAt: item.row.acknowledgedAt.toISOString(),
      method: requireRef(refs, item.row.methodId),
      acknowledgedByNameAr: item.row.acknowledgedByNameAr,
      acknowledgedByTitleAr: item.row.acknowledgedByTitleAr,
      noteAr: item.row.noteAr,
    })),

    interactions: interactions.map((item) => ({
      id: item.row.id,
      kind: requireRef(refs, item.row.kindId),
      occurredAt: item.row.occurredAt.toISOString(),
      summaryAr: item.row.summaryAr,
      bodyAr: item.row.bodyAr,
      recordedByNameAr: item.recordedByNameAr,
      partnerVisible: item.row.partnerVisible,
    })),

    activation: {
      satisfied: activation.satisfied,
      requirements: activation.requirements,
    },
  }
}

async function requirePartner(partnerId: string, tx: Executor = db) {
  const [row] = await tx
    .select()
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1)

  if (!row) throw errors.notFound('الجهة غير موجودة.')

  return row
}

/**
 * كل تغيير مرحلة يترك أثرًا في سجل المتابعة، لا في التدقيق وحده. نوعه
 * `STAGE_CHANGE` قيمة نظام مقفلة: لا يسجّلها أحد بيده ولا تُعطَّل.
 */
async function logStageChange(
  tx: Executor,
  input: {
    partnerId: string
    summaryAr: string
    bodyAr?: string | undefined
    actorId: string
  },
) {
  await tx.insert(partnerInteractions).values({
    partnerId: input.partnerId,
    kindId: lookupValueIdSql('INTERACTION_KIND', 'STAGE_CHANGE'),
    occurredAt: new Date(),
    summaryAr: input.summaryAr,
    recordedById: input.actorId,
    ...(input.bodyAr ? { bodyAr: input.bodyAr } : {}),
  })
}

// ── الكتابة ────────────────────────────────────────────────────────────

export async function createPartner(
  input: dto.CreatePartnerBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const legalNameAr = normalizeText(input.legalNameAr)
  const displayNameAr = normalizeText(input.displayNameAr ?? input.legalNameAr)

  await assertLookupValues([
    {
      list: 'ORGANIZATION_KIND',
      field: 'organizationKindId',
      ids: [input.organizationKindId],
    },
    { list: 'SUPPORT_FORM', field: 'supportFormIds', ids: input.supportFormIds },
    {
      list: 'CONTACT_PRIORITY',
      field: 'contactPriorityId',
      ids: [input.contactPriorityId],
    },
    {
      list: 'ENGAGEMENT_HORIZON',
      field: 'engagementHorizonId',
      ids: [input.engagementHorizonId],
    },
    {
      list: 'RELATIONSHIP_TYPE',
      field: 'relationshipTypeId',
      ids: [input.relationshipTypeId],
    },
    { list: 'MEDIA_CHANNEL', field: 'mediaChannelIds', ids: input.mediaChannelIds },
  ])

  const partnerId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(partners)
      .values({
        legalNameAr,
        displayNameAr,
        organizationKindId: input.organizationKindId,
        contactPriorityId:
          input.contactPriorityId ??
          lookupValueIdSql('CONTACT_PRIORITY', 'MEDIUM'),
        ...(input.nameEn ? { nameEn: normalizeText(input.nameEn) } : {}),
        ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
        ...(input.summaryAr ? { summaryAr: input.summaryAr } : {}),
        ...(input.accountManagerId
          ? { accountManagerId: input.accountManagerId }
          : {}),
        ...(input.internalNotesAr
          ? { internalNotesAr: input.internalNotesAr }
          : {}),
        ...(input.engagementHorizonId
          ? { engagementHorizonId: input.engagementHorizonId }
          : {}),
        ...(input.relationshipTypeId
          ? { relationshipTypeId: input.relationshipTypeId }
          : {}),
        ...(input.lastContactAt
          ? { lastContactAt: new Date(input.lastContactAt) }
          : {}),
      })
      .returning({ id: partners.id })

    if (!created) throw new Error('Failed to create partner.')

    await replaceMediaChannels(tx, created.id, input.mediaChannelIds)
    await replaceSupportForms(tx, created.id, input.supportFormIds)

    await logStageChange(tx, {
      partnerId: created.id,
      summaryAr: 'تسجيل الجهة كشراكة محتملة',
      actorId: actor.userId,
    })

    await recordAudit(
      {
        action: 'partner.created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: created.id,
        entityLabel: displayNameAr,
        summaryAr: 'تسجيل جهة محتملة جديدة',
        ...trace,
      },
      tx,
    )

    return created.id
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function updatePartner(
  partnerId: string,
  input: dto.UpdatePartnerBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const current = await requirePartner(partnerId)
  const [currentChannels, currentForms] = await Promise.all([
    linkedValuesFor(MEDIA_CHANNEL_LINK, [partnerId]),
    linkedValuesFor(SUPPORT_FORM_LINK, [partnerId]),
  ])

  await assertLookupValues([
    {
      list: 'ORGANIZATION_KIND',
      field: 'organizationKindId',
      ids: [input.organizationKindId],
      current: [current.organizationKindId],
    },
    {
      list: 'SUPPORT_FORM',
      field: 'supportFormIds',
      ids: input.supportFormIds ?? [],
      current: (currentForms.get(partnerId) ?? []).map((ref) => ref.id),
    },
    {
      list: 'CONTACT_PRIORITY',
      field: 'contactPriorityId',
      ids: [input.contactPriorityId],
      current: [current.contactPriorityId],
    },
    {
      list: 'ENGAGEMENT_HORIZON',
      field: 'engagementHorizonId',
      ids: [input.engagementHorizonId],
      current: [current.engagementHorizonId],
    },
    {
      list: 'RELATIONSHIP_TYPE',
      field: 'relationshipTypeId',
      ids: [input.relationshipTypeId],
      current: [current.relationshipTypeId],
    },
    {
      list: 'MEDIA_CHANNEL',
      field: 'mediaChannelIds',
      ids: input.mediaChannelIds ?? [],
      current: (currentChannels.get(partnerId) ?? []).map((ref) => ref.id),
    },
  ])

  const changes = {
    ...(input.legalNameAr ? { legalNameAr: normalizeText(input.legalNameAr) } : {}),
    ...(input.displayNameAr
      ? { displayNameAr: normalizeText(input.displayNameAr) }
      : {}),
    ...(input.nameEn !== undefined ? { nameEn: input.nameEn || null } : {}),
    ...(input.organizationKindId
      ? { organizationKindId: input.organizationKindId }
      : {}),
    ...(input.websiteUrl !== undefined
      ? { websiteUrl: input.websiteUrl || null }
      : {}),
    ...(input.summaryAr !== undefined ? { summaryAr: input.summaryAr || null } : {}),
    ...(input.accountManagerId !== undefined
      ? { accountManagerId: input.accountManagerId || null }
      : {}),
    ...(input.internalNotesAr !== undefined
      ? { internalNotesAr: input.internalNotesAr || null }
      : {}),
    ...(input.contactPriorityId
      ? { contactPriorityId: input.contactPriorityId }
      : {}),
    ...(input.engagementHorizonId !== undefined
      ? { engagementHorizonId: input.engagementHorizonId }
      : {}),
    ...(input.relationshipTypeId !== undefined
      ? { relationshipTypeId: input.relationshipTypeId }
      : {}),
    ...(input.lastContactAt !== undefined
      ? {
          lastContactAt: input.lastContactAt
            ? new Date(input.lastContactAt)
            : null,
        }
      : {}),
  }

  if (
    Object.keys(changes).length > 0 ||
    input.mediaChannelIds ||
    input.supportFormIds
  ) {
    await db.transaction(async (tx) => {
      if (Object.keys(changes).length > 0) {
        await tx.update(partners).set(changes).where(eq(partners.id, partnerId))
      }

      if (input.mediaChannelIds) {
        await replaceMediaChannels(tx, partnerId, input.mediaChannelIds)
      }

      if (input.supportFormIds) {
        await replaceSupportForms(tx, partnerId, input.supportFormIds)
      }

      await recordAudit(
        {
          action: 'partner.updated',
          actorUserId: actor.userId,
          entityType: 'partner',
          entityId: partnerId,
          summaryAr: 'تعديل ملف الجهة',
          metadata: {
            fields: [
              ...Object.keys(changes),
              ...(input.mediaChannelIds ? ['mediaChannelIds'] : []),
              ...(input.supportFormIds ? ['supportFormIds'] : []),
            ],
          },
          ...trace,
        },
        tx,
      )
    })
  }

  return loadPartnerDetail(partnerId, actor)
}

export async function changeStage(
  partnerId: string,
  input: dto.ChangeStageBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const partner = await requirePartner(partnerId)

  /**
   * الحالات النهائية لها مساراتها وشروطها. السماح بالعودة منها عبر هذا
   * المسار يلتف على بوابة الاعتماد ويجعل جهة مرفوضة نشطةً بضغطة.
   */
  if (['ACTIVE', 'REJECTED', 'ENDED'].includes(partner.stage)) {
    throw errors.conflict(
      'لا يمكن نقل جهة نشطة أو مرفوضة أو منتهية عبر خط المتابعة. استخدم المسار المخصص.',
    )
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partners)
      .set({ stage: input.stage })
      .where(eq(partners.id, partnerId))

    await logStageChange(tx, {
      partnerId,
      summaryAr: `نقل المرحلة من ${partner.stage} إلى ${input.stage}`,
      bodyAr: input.noteAr,
      actorId: actor.userId,
    })

    await recordAudit(
      {
        action: 'partner.stage_changed',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        entityLabel: partner.displayNameAr,
        summaryAr: `نقل المرحلة إلى ${input.stage}`,
        metadata: { from: partner.stage, to: input.stage },
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function addContact(
  partnerId: string,
  input: dto.CreateContactBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requirePartner(partnerId)

  await db.transaction(async (tx) => {
    /**
     * الفهرس الجزئي يسمح برئيسية واحدة نشطة، فتُنزع الصفة عن السابقة
     * قبل الإدراج داخل المعاملة نفسها — وإلا فشل الإدراج بتعارض.
     */
    if (input.isPrimary) {
      await tx
        .update(partnerContacts)
        .set({ isPrimary: false })
        .where(
          and(
            eq(partnerContacts.partnerId, partnerId),
            eq(partnerContacts.isPrimary, true),
          ),
        )
    }

    const [created] = await tx
      .insert(partnerContacts)
      .values({
        partnerId,
        fullNameAr: normalizeText(input.fullNameAr),
        isPrimary: input.isPrimary,
        ...(input.jobTitleAr ? { jobTitleAr: normalizeText(input.jobTitleAr) } : {}),
        ...(input.email ? { email: normalizeEmail(input.email) } : {}),
        ...(input.phone ? { phone: input.phone.trim() } : {}),
        ...(input.notesAr ? { notesAr: input.notesAr } : {}),
      })
      .returning({ id: partnerContacts.id })

    if (!created) throw new Error('Failed to create contact.')

    await recordAudit(
      {
        action: 'partner.contact_added',
        actorUserId: actor.userId,
        entityType: 'partner_contact',
        entityId: created.id,
        entityLabel: input.fullNameAr,
        summaryAr: input.isPrimary
          ? 'إضافة جهة اتصال رئيسية'
          : 'إضافة جهة اتصال',
        metadata: { partnerId },
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function addPartnership(
  partnerId: string,
  input: dto.CreatePartnershipBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requirePartner(partnerId)

  /**
   * «شريك فعالية - نشاط» يرتبط بمبادرة محددة حسب الميثاق. جدول المبادرات
   * يأتي في المرحلة الثالثة، وتسجيل شراكة فعالية بلا فعالية ينتج صفًّا
   * لا يمكن التحقق منه لاحقًا.
   */
  if (input.type === 'EVENT') {
    throw errors.unprocessable(
      'شراكة الفعالية ترتبط بمبادرة محددة، وجدول المبادرات يُبنى في المرحلة الثالثة.',
    )
  }

  const [existing] = await db
    .select({ id: partnerPartnerships.id })
    .from(partnerPartnerships)
    .where(
      and(
        eq(partnerPartnerships.partnerId, partnerId),
        eq(partnerPartnerships.type, input.type),
        sql`${partnerPartnerships.status} <> 'ENDED'`,
      ),
    )
    .limit(1)

  if (existing) {
    throw errors.conflict('هذا النوع مسجّل بالفعل لهذه الجهة.')
  }

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(partnerPartnerships)
      .values({
        partnerId,
        type: input.type,
        ...(input.notesAr ? { notesAr: input.notesAr } : {}),
      })
      .returning({ id: partnerPartnerships.id })

    if (!created) throw new Error('Failed to create partnership.')

    await recordAudit(
      {
        action: 'partner.partnership_proposed',
        actorUserId: actor.userId,
        entityType: 'partner_partnership',
        entityId: created.id,
        summaryAr: `اقتراح نوع شراكة: ${input.type}`,
        metadata: { partnerId, type: input.type },
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function updatePartnership(
  partnerId: string,
  partnershipId: string,
  input: dto.UpdatePartnershipBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const [existing] = await db
    .select()
    .from(partnerPartnerships)
    .where(
      and(
        eq(partnerPartnerships.id, partnershipId),
        eq(partnerPartnerships.partnerId, partnerId),
      ),
    )
    .limit(1)

  if (!existing) throw errors.notFound('نوع الشراكة غير موجود لهذه الجهة.')

  /** الاعتماد قرار المدير العام وحده — نصّ المحضر. */
  if (
    input.status === 'APPROVED' &&
    !actor.capabilities.includes('partners.approve')
  ) {
    throw errors.forbidden('اعتماد نوع الشراكة من صلاحية المدير العام.')
  }

  /**
   * لا يُعلَّق ما لم يُعتمد. القاعدة ترفضه بقيد، والرفض هنا يحوّل خطأ
   * 500 غامضًا إلى رسالة تشرح للمستخدم ما يفعله.
   */
  if (input.status === 'PAUSED' && !existing.approvedAt) {
    throw errors.conflict(
      'لا يُعلَّق نوع شراكة لم يُعتمد بعد. اسحب الاقتراح بدل تعليقه.',
    )
  }

  const now = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(partnerPartnerships)
      .set({
        status: input.status,
        ...(input.status === 'APPROVED' && !existing.approvedAt
          ? { approvedAt: now, approvedById: actor.userId, startedAt: now }
          : {}),
        ...(input.status === 'ENDED' ? { endedAt: now } : {}),
        ...(input.notesAr !== undefined ? { notesAr: input.notesAr } : {}),
      })
      .where(eq(partnerPartnerships.id, partnershipId))

    await recordAudit(
      {
        action: `partner.partnership_${input.status.toLowerCase()}`,
        severity: input.status === 'APPROVED' ? 'NOTICE' : 'INFO',
        actorUserId: actor.userId,
        entityType: 'partner_partnership',
        entityId: partnershipId,
        summaryAr: `تحديث نوع الشراكة ${existing.type} إلى ${input.status}`,
        metadata: { partnerId, type: existing.type, status: input.status },
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

/**
 * يسجّل الحدث ويحدّث العمود المرآة في معاملة واحدة.
 *
 * السجل هو المصدر والعمود مشتق منه: فصلهما يعني احتمال أن تُظهر الواجهة
 * شعارًا سُحبت موافقته.
 */
export async function recordConsent(
  partnerId: string,
  input: dto.ConsentBody & { source: 'ADMIN' | 'PARTNER_SELF' },
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requirePartner(partnerId)

  const now = new Date()
  const granted = input.action === 'GRANTED'

  await db.transaction(async (tx) => {
    await tx.insert(partnerConsentEvents).values({
      partnerId,
      consentType: input.consentType,
      action: input.action,
      source: input.source,
      actedAt: now,
      actorUserId: actor.userId,
      ...(input.actorNameAr
        ? { actorNameAr: normalizeText(input.actorNameAr) }
        : {}),
      ...(input.noteAr ? { noteAr: input.noteAr } : {}),
    })

    await tx
      .update(partners)
      .set(
        input.consentType === 'PUBLIC_NAME'
          ? {
              publicNameConsent: granted,
              publicNameConsentAt: granted ? now : null,
            }
          : {
              publicLogoConsent: granted,
              publicLogoConsentAt: granted ? now : null,
            },
      )
      .where(eq(partners.id, partnerId))

    await recordAudit(
      {
        action: `partner.consent_${input.action.toLowerCase()}`,
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        summaryAr:
          input.consentType === 'PUBLIC_NAME'
            ? `${granted ? 'منح' : 'سحب'} موافقة إظهار الاسم`
            : `${granted ? 'منح' : 'سحب'} موافقة إظهار الشعار`,
        metadata: { consentType: input.consentType, source: input.source },
        // الشريك يرى ما يخص موافقته في سجل نشاطه.
        partnerVisible: true,
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function recordAcknowledgement(
  partnerId: string,
  input: dto.AcknowledgementBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requirePartner(partnerId)

  const methods = await assertLookupValues([
    { list: 'ACKNOWLEDGEMENT_METHOD', field: 'methodId', ids: [input.methodId] },
  ])
  const method = requireRef(methods, input.methodId)

  let versionId = input.charterVersionId

  if (!versionId) {
    const current = await findCurrentVersion()

    if (!current) {
      throw errors.unprocessable(
        'لا يوجد إصدار منشور من الميثاق. انشر إصدارًا قبل تسجيل الإقرارات.',
      )
    }

    versionId = current.id
  }

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(charterAcknowledgements)
      .values({
        partnerId,
        charterVersionId: versionId,
        acknowledgedAt: input.acknowledgedAt
          ? new Date(input.acknowledgedAt)
          : new Date(),
        methodId: input.methodId,
        acknowledgedByNameAr: normalizeText(input.acknowledgedByNameAr),
        recordedById: actor.userId,
        ...(input.acknowledgedByContactId
          ? { acknowledgedByContactId: input.acknowledgedByContactId }
          : {}),
        ...(input.acknowledgedByTitleAr
          ? { acknowledgedByTitleAr: normalizeText(input.acknowledgedByTitleAr) }
          : {}),
        ...(input.noteAr ? { noteAr: input.noteAr } : {}),
      })
      .returning({ id: charterAcknowledgements.id })

    if (!created) throw new Error('Failed to record acknowledgement.')

    await recordAudit(
      {
        action: 'partner.charter_acknowledged',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'charter_acknowledgement',
        entityId: created.id,
        summaryAr: 'تسجيل إقرار الجهة بالميثاق',
        metadata: { partnerId, charterVersionId: versionId, method: method.code },
        partnerVisible: true,
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function recordInteraction(
  partnerId: string,
  input: dto.InteractionBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const partner = await requirePartner(partnerId)
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
  const kinds = await assertLookupValues([
    { list: 'INTERACTION_KIND', field: 'kindId', ids: [input.kindId] },
  ])
  const kind = requireRef(kinds, input.kindId)

  await db.transaction(async (tx) => {
    await tx.insert(partnerInteractions).values({
      partnerId,
      kindId: input.kindId,
      occurredAt,
      summaryAr: normalizeText(input.summaryAr),
      recordedById: actor.userId,
      partnerVisible: input.partnerVisible,
      ...(input.bodyAr ? { bodyAr: input.bodyAr } : {}),
    })

    /**
     * «آخر تواصل» يتقدّم ولا يتراجع: تسجيل اجتماع قديم نُسي إدخاله يجب
     * ألا يُظهر الجهة مهملةً في فرز المتأخرين.
     */
    if (!partner.lastContactAt || occurredAt > partner.lastContactAt) {
      await tx
        .update(partners)
        .set({ lastContactAt: occurredAt })
        .where(eq(partners.id, partnerId))
    }

    await recordAudit(
      {
        action: 'partner.interaction_recorded',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        summaryAr: `تسجيل ${kind.nameAr}`,
        metadata: { kind: kind.code },
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

/**
 * بوابة الاعتماد النهائي.
 *
 * الشروط تُفحص داخل المعاملة لا قبلها: فحصٌ ثم كتابة خارج المعاملة يترك
 * نافذة تُلغى فيها جهة الاتصال الرئيسية بين اللحظتين، فتُفعَّل جهة لا
 * تستوفي شروطها.
 */
export async function activatePartner(
  partnerId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const partner = await requirePartner(partnerId)

  if (partner.stage === 'ACTIVE') {
    throw errors.conflict('الجهة نشطة بالفعل.')
  }

  if (partner.stage === 'REJECTED' || partner.stage === 'ENDED') {
    throw errors.conflict('لا يمكن تفعيل جهة مرفوضة أو منتهية.')
  }

  await db.transaction(async (tx) => {
    const activation = await activationRequirements(partnerId, tx)

    if (!activation.satisfied) {
      throw errors.unprocessable(
        'شروط التفعيل غير مكتملة.',
        activation.requirements.filter((requirement) => !requirement.satisfied),
      )
    }

    const now = new Date()

    await tx
      .update(partners)
      .set({ stage: 'ACTIVE', activatedAt: now, approvedById: actor.userId })
      .where(eq(partners.id, partnerId))

    await logStageChange(tx, {
      partnerId,
      summaryAr: 'اعتماد الشراكة وتفعيل الجهة',
      actorId: actor.userId,
    })

    await recordAudit(
      {
        action: 'partner.activated',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        entityLabel: partner.displayNameAr,
        summaryAr: 'الاعتماد النهائي للشراكة',
        partnerVisible: true,
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function rejectPartner(
  partnerId: string,
  input: dto.RejectPartnerBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const partner = await requirePartner(partnerId)

  if (partner.stage === 'ACTIVE') {
    throw errors.conflict('لا تُرفض جهة نشطة. أنهِ الشراكة بدلًا من ذلك.')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partners)
      .set({
        stage: 'REJECTED',
        rejectionReasonAr: input.rejectionReasonAr,
        ...(input.decisionNoteAr ? { decisionNoteAr: input.decisionNoteAr } : {}),
      })
      .where(eq(partners.id, partnerId))

    await logStageChange(tx, {
      partnerId,
      summaryAr: 'رفض الشراكة',
      bodyAr: input.rejectionReasonAr,
      actorId: actor.userId,
    })

    await recordAudit(
      {
        action: 'partner.rejected',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        entityLabel: partner.displayNameAr,
        summaryAr: 'رفض الشراكة',
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function suspendPartner(
  partnerId: string,
  input: dto.SuspendPartnerBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const partner = await requirePartner(partnerId)

  if (partner.stage !== 'ACTIVE') {
    throw errors.conflict('التعليق يخص الجهات النشطة وحدها.')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partners)
      .set({
        suspendedAt: new Date(),
        suspendedById: actor.userId,
        suspensionReasonAr: input.suspensionReasonAr,
      })
      .where(eq(partners.id, partnerId))

    await recordAudit(
      {
        action: 'partner.suspended',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        entityLabel: partner.displayNameAr,
        summaryAr: 'تعليق الجهة مؤقتًا',
        metadata: { reason: input.suspensionReasonAr },
        partnerVisible: true,
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}

export async function restorePartner(
  partnerId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const partner = await requirePartner(partnerId)

  if (!partner.suspendedAt) {
    throw errors.conflict('الجهة غير معلّقة.')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partners)
      .set({
        suspendedAt: null,
        suspendedById: null,
        suspensionReasonAr: null,
      })
      .where(eq(partners.id, partnerId))

    await recordAudit(
      {
        action: 'partner.restored',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'partner',
        entityId: partnerId,
        entityLabel: partner.displayNameAr,
        summaryAr: 'رفع التعليق عن الجهة',
        partnerVisible: true,
        ...trace,
      },
      tx,
    )
  })

  return loadPartnerDetail(partnerId, actor)
}
