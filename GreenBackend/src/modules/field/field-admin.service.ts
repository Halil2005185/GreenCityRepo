import { createHash } from 'node:crypto'

import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'

import { env } from '../../config/env.js'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { isUniqueViolation } from '../../common/utils/db-errors.js'
import { nameKey, normalizeText, phoneKey } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { memberships } from '../../db/schema/access.js'
import {
  attachments,
  attendance,
  fieldGroupMembers,
  fieldGroups,
  fieldSettings,
  participantCertificates,
  participantLinks,
  participants,
} from '../../db/schema/field.js'
import { formSubmissions, formVersions, forms } from '../../db/schema/forms.js'
import { users } from '../../db/schema/identity.js'
import { impactEntries } from '../../db/schema/metrics.js'
import { offices, roles } from '../../db/schema/org.js'
import { partners } from '../../db/schema/partners.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import { workItems } from '../../db/schema/work.js'
import {
  type AuthContext,
  loadAuthContext,
  loadOverrides,
} from '../access/access.service.js'
import { effectiveCapabilities } from '../access/capabilities.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { listAcceptedApplicants } from '../forms/submissions.service.js'
import { recordEntry } from '../impact/impact.service.js'
import { deleteUpload } from '../uploads/uploads.service.js'
import type * as dto from './field-admin.schemas.js'
import { damascusDay, groupLead } from './field.shared.js'
import { resolveParticipant } from './participants.service.js'

// ── المجموعات ──────────────────────────────────────────────────────────

const groupColumns = {
  id: fieldGroups.id,
  initiativeId: fieldGroups.initiativeId,
  siteId: fieldGroups.siteId,
  siteNameAr: initiativeSites.nameAr,
  siteStatus: initiativeSites.status,
  nameAr: fieldGroups.nameAr,
  leadUserId: fieldGroups.leadUserId,
  leadNameAr: groupLead.fullNameAr,
  partnerId: fieldGroups.partnerId,
  partnerNameAr: partners.displayNameAr,
  contactPhone: fieldGroups.contactPhone,
  hoursPerDay: fieldGroups.hoursPerDay,
  meetsAt: fieldGroups.meetsAt,
  meetingPointAr: fieldGroups.meetingPointAr,
  instructionsAr: fieldGroups.instructionsAr,
  displayOrder: fieldGroups.displayOrder,
  createdAt: fieldGroups.createdAt,
  memberCount: sql<number>`(
    select count(*)::int from ${fieldGroupMembers}
     where ${fieldGroupMembers.groupId} = ${fieldGroups.id}
  )`.as('member_count'),
  comingCount: sql<number>`(
    select count(*)::int from ${fieldGroupMembers}
     where ${fieldGroupMembers.groupId} = ${fieldGroups.id}
       and ${fieldGroupMembers.rsvp} = 'COMING'
  )`.as('coming_count'),
  linkedCount: sql<number>`(
    select count(*)::int from ${fieldGroupMembers}
     where ${fieldGroupMembers.groupId} = ${fieldGroups.id}
       and exists (
         select 1 from ${participantLinks}
          where ${participantLinks.participantId} = ${fieldGroupMembers.participantId}
            and ${participantLinks.initiativeId} = ${fieldGroups.initiativeId}
            and ${participantLinks.revokedAt} is null
            and ${participantLinks.expiresAt} > now()
       )
  )`.as('linked_count'),
  attendedCount: sql<number>`(
    select count(distinct ${attendance.participantId})::int from ${attendance}
     where ${attendance.groupId} = ${fieldGroups.id}
       and ${attendance.undoneAt} is null
  )`.as('attended_count'),
  photoCount: sql<number>`(
    select count(*)::int from ${attachments}
     where ${attachments.groupId} = ${fieldGroups.id}
  )`.as('photo_count'),
}

function groupQuery() {
  return db
    .select(groupColumns)
    .from(fieldGroups)
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .leftJoin(groupLead, eq(fieldGroups.leadUserId, groupLead.id))
    .leftJoin(partners, eq(fieldGroups.partnerId, partners.id))
}

type GroupRow = Awaited<ReturnType<typeof groupQuery>>[number]

function serializeGroup(row: GroupRow) {
  return {
    ...row,
    // `numeric` يعود نصًّا من القاعدة.
    hoursPerDay: row.hoursPerDay === null ? null : Number(row.hoursPerDay),
    meetsAt: row.meetsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function requireInitiative(initiativeId: string) {
  const [row] = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!row) throw errors.notFound('المبادرة غير موجودة.')

  return row
}

/**
 * إعدادات الميدان كما تُعرض للمنسّق. رابط الاستمارة `null` ما لم تكن منشورة
 * تستقبل: هو ما يصل المتطوع فعلًا، لا ما اختير.
 */
async function loadSettings(initiativeId: string) {
  const [row] = await db
    .select({
      feedbackFormId: forms.id,
      feedbackFormNameAr: forms.nameAr,
      slug: forms.slug,
      isAccepting: forms.isAccepting,
      publishedVersionId: formVersions.id,
      certificatesEnabled: fieldSettings.certificatesEnabled,
      certificateSignerNameAr: fieldSettings.certificateSignerNameAr,
      certificateSignerTitleAr: fieldSettings.certificateSignerTitleAr,
    })
    .from(fieldSettings)
    // وصلة يسرى: إعدادات الشهادة قائمة ولو لم تُختر استمارة تقييم.
    .leftJoin(forms, eq(fieldSettings.feedbackFormId, forms.id))
    .leftJoin(
      formVersions,
      and(
        eq(formVersions.formId, forms.id),
        eq(formVersions.status, 'PUBLISHED'),
      ),
    )
    .where(eq(fieldSettings.initiativeId, initiativeId))
    .limit(1)

  const [issued] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantCertificates)
    .where(eq(participantCertificates.initiativeId, initiativeId))

  const certificateCount = issued?.count ?? 0

  if (!row) {
    return {
      feedbackFormId: null,
      feedbackFormNameAr: null,
      feedbackFormUrl: null,
      certificatesEnabled: false,
      certificateSignerNameAr: null,
      certificateSignerTitleAr: null,
      certificateCount,
    }
  }

  return {
    feedbackFormId: row.feedbackFormId,
    feedbackFormNameAr: row.feedbackFormNameAr,
    feedbackFormUrl:
      row.isAccepting && row.publishedVersionId
        ? `${env.PUBLIC_SITE_URL}/join/${row.slug}`
        : null,
    certificatesEnabled: row.certificatesEnabled,
    certificateSignerNameAr: row.certificateSignerNameAr,
    certificateSignerTitleAr: row.certificateSignerTitleAr,
    certificateCount,
  }
}

/** يُستدعى بعد كل تعديل ليعود ميدان المبادرة كاملًا في نداء واحد. */
export async function loadInitiativeField(initiativeId: string) {
  await requireInitiative(initiativeId)

  const [rows, settings] = await Promise.all([
    groupQuery()
      .where(eq(fieldGroups.initiativeId, initiativeId))
      .orderBy(
        asc(initiativeSites.displayOrder),
        asc(initiativeSites.nameAr),
        asc(fieldGroups.displayOrder),
        asc(fieldGroups.nameAr),
      ),
    loadSettings(initiativeId),
  ])

  return { initiativeId, groups: rows.map(serializeGroup), settings }
}

/** الاستمارات المنشورة التي تستقبل: ما يصلح أن يُرسَل رابطه لمتطوع. */
export async function listFeedbackForms() {
  return db
    .selectDistinct({
      formId: forms.id,
      nameAr: forms.nameAr,
      slug: forms.slug,
    })
    .from(forms)
    .innerJoin(
      formVersions,
      and(
        eq(formVersions.formId, forms.id),
        eq(formVersions.status, 'PUBLISHED'),
      ),
    )
    .where(eq(forms.isAccepting, true))
    .orderBy(asc(forms.nameAr))
}

export async function updateSettings(
  initiativeId: string,
  input: dto.UpdateSettingsBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  if (input.feedbackFormId) {
    const [form] = await db
      .select({ id: forms.id })
      .from(forms)
      .where(eq(forms.id, input.feedbackFormId))
      .limit(1)

    if (!form) throw errors.unprocessable('الاستمارة المختارة غير موجودة.')
  }

  const current = await loadSettings(initiativeId)

  const certificate = {
    certificatesEnabled:
      input.certificatesEnabled ?? current.certificatesEnabled,
    certificateSignerNameAr:
      input.certificateSignerNameAr === undefined
        ? current.certificateSignerNameAr
        : input.certificateSignerNameAr || null,
    certificateSignerTitleAr:
      input.certificateSignerTitleAr === undefined
        ? current.certificateSignerTitleAr
        : input.certificateSignerTitleAr || null,
  }

  // ورقة تحمل اسم المشروع بلا من يوقّعها ليست شهادة.
  if (certificate.certificatesEnabled && !certificate.certificateSignerNameAr) {
    throw errors.unprocessable('سمِّ من يوقّع الشهادة قبل تفعيلها.', [
      {
        path: 'certificateSignerNameAr',
        in: 'body',
        message: 'اكتب اسم من يوقّع الشهادة.',
      },
    ])
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(fieldSettings)
      .values({
        initiativeId,
        feedbackFormId: input.feedbackFormId,
        ...certificate,
        updatedById: actor.userId,
      })
      .onConflictDoUpdate({
        target: fieldSettings.initiativeId,
        set: {
          feedbackFormId: input.feedbackFormId,
          ...certificate,
          updatedById: actor.userId,
          updatedAt: new Date(),
        },
      })

    await recordAudit(
      {
        action: 'field.settings_updated',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: 'تعديل إعدادات الميدان',
        metadata: {
          feedbackFormId: input.feedbackFormId,
          certificatesEnabled: certificate.certificatesEnabled,
        },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeField(initiativeId)
}

/**
 * من يحمل `field.lead` فعلًا، بعد الاستثناءات الفردية على عضوياته.
 *
 * القدرة تُحل هنا كما تُحل في الجلسة، لا بقراءة حزمة الدور وحدها: عضو
 * نُزعت منه القدرة باستثناء لا يُعرض قائدًا، وآخر مُنحها باستثناء يُعرض.
 * الفريق عشرات لا آلاف، فقراءة عضوياته كلها أرخص من استعلام يكرر القاعدة.
 */
export async function listLeadCandidates() {
  const rows = await db
    .select({
      userId: users.id,
      fullNameAr: users.fullNameAr,
      membershipId: memberships.id,
      isPrimary: memberships.isPrimary,
      roleNameAr: roles.nameAr,
      roleCapabilities: roles.capabilities,
      officeNameAr: offices.nameAr,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .innerJoin(offices, eq(memberships.officeId, offices.id))
    .where(
      and(
        eq(memberships.status, 'ACTIVE'),
        eq(users.kind, 'STAFF'),
        eq(users.status, 'ACTIVE'),
      ),
    )
    // العضوية الرئيسية أولًا، فهي ما يُعرض حين تمنح القدرةَ أكثرُ من عضوية.
    .orderBy(asc(users.fullNameAr), sql`${memberships.isPrimary} desc`)

  const overrides = await loadOverrides(rows.map((row) => row.membershipId))
  const candidates = new Map<
    string,
    { id: string; fullNameAr: string; roleNameAr: string; officeNameAr: string }
  >()

  for (const row of rows) {
    if (candidates.has(row.userId)) continue

    const held = effectiveCapabilities(
      row.roleCapabilities,
      overrides.get(row.membershipId) ?? [],
    )

    if (!held.includes('field.lead')) continue

    candidates.set(row.userId, {
      id: row.userId,
      fullNameAr: row.fullNameAr,
      roleNameAr: row.roleNameAr,
      officeNameAr: row.officeNameAr,
    })
  }

  return [...candidates.values()]
}

/**
 * المجموعات للحملات وحدها، وللحملة التي ما زالت تُنفَّذ أو تُحضَّر.
 *
 * النقطة الخضراء توثيق لفعل نفّذه غيرنا: لا يوم ميداني فيها ولا حضور.
 * والمبادرة المغلقة أو الملغاة انتهى ميدانها، فتعديله يغيّر سجلًا لا خطة.
 */
async function requireOpenCampaign(initiativeId: string) {
  const initiative = await requireInitiative(initiativeId)

  if (initiative.kind !== 'CAMPAIGN') {
    throw errors.unprocessable(
      'النقطة الخضراء توثيق لا حملة، فلا تُكوَّن لها مجموعات ميدانية.',
    )
  }

  if (initiative.status === 'COMPLETED' || initiative.status === 'CANCELLED') {
    throw errors.conflict('المبادرة مغلقة، فلا يُعدَّل ميدانها.')
  }

  return initiative
}

async function requireLiveSite(initiativeId: string, siteId: string) {
  const [site] = await db
    .select({
      id: initiativeSites.id,
      initiativeId: initiativeSites.initiativeId,
      nameAr: initiativeSites.nameAr,
      status: initiativeSites.status,
    })
    .from(initiativeSites)
    .where(eq(initiativeSites.id, siteId))
    .limit(1)

  if (!site || site.initiativeId !== initiativeId) {
    throw errors.unprocessable('الموقع غير موجود في هذه المبادرة.')
  }

  if (site.status === 'CANCELLED') {
    throw errors.unprocessable('الموقع ملغى، فلا تُكوَّن له مجموعة.')
  }

  return site
}

/**
 * القائد يُفحص بقدرته الفعلية لا بدوره: الأدوار تُحرَّر من اللوحة، ودور
 * يحمل اسم «قائد» قد نُزعت منه القدرة.
 */
async function requireLead(userId: string) {
  const context = await loadAuthContext(userId)

  if (!context || context.kind !== 'STAFF' || context.status !== 'ACTIVE') {
    throw errors.unprocessable('القائد المختار ليس عضوًا نشطًا في الفريق.')
  }

  if (!context.capabilities.includes('field.lead')) {
    throw errors.unprocessable(
      'العضو المختار لا يحمل صلاحية قيادة مجموعة ميدانية. أسند إليه دور «قائد مجموعة ميداني» أولًا.',
    )
  }

  return context
}

async function requireGroup(initiativeId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(fieldGroups)
    .where(
      and(
        eq(fieldGroups.id, groupId),
        eq(fieldGroups.initiativeId, initiativeId),
      ),
    )
    .limit(1)

  if (!row) throw errors.notFound('المجموعة غير موجودة في هذه المبادرة.')

  return row
}

const activePartner = and(
  eq(partners.stage, 'ACTIVE'),
  isNull(partners.suspendedAt),
)

/**
 * الجهات التي تُنسب إليها مجموعة: النشطة غير المعلّقة. اسمها ونوعها وحدهما —
 * المنسّق يختار من قائمة، ولا يقرأ سجل الشركاء.
 */
export async function listPartnerOptions() {
  return db
    .select({
      id: partners.id,
      displayNameAr: partners.displayNameAr,
      organizationKind: partners.organizationKind,
    })
    .from(partners)
    .where(activePartner)
    .orderBy(asc(partners.displayNameAr))
}

/**
 * جهة تُنسب إليها مجموعة جديدة: شريك نشط. ما نُسب قبل أن تُعلَّق الجهة أو
 * تنتهي شراكتها يبقى كما هو — هو تاريخ ما جرى.
 */
async function requireTeamPartner(partnerId: string) {
  const [row] = await db
    .select({ id: partners.id, displayNameAr: partners.displayNameAr })
    .from(partners)
    .where(and(eq(partners.id, partnerId), activePartner))
    .limit(1)

  if (!row) {
    throw errors.unprocessable('الجهة ليست شريكًا نشطًا.', [
      {
        path: 'partnerId',
        in: 'body',
        message: 'اختر جهة شريكة نشطة غير معلّقة.',
      },
    ])
  }

  return row
}

/**
 * الفهرس الفريد هو الحَكَم حين يتسابق منسّقان على الاسم نفسه؛ ترجمته هنا
 * تُبقي الجواب تعارضًا مفهومًا بدل خطأ داخلي.
 */
async function guardName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw errors.conflict(
        'في هذا الموقع مجموعة بالاسم نفسه. اختر اسمًا يميّزها.',
      )
    }

    throw error
  }
}

export async function createGroup(
  initiativeId: string,
  input: dto.CreateGroupBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const site = await requireLiveSite(initiativeId, input.siteId)
  const leader = input.leadUserId ? await requireLead(input.leadUserId) : null
  const partner = input.partnerId
    ? await requireTeamPartner(input.partnerId)
    : null
  const nameAr = normalizeText(input.nameAr)

  await guardName(() =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(fieldGroups)
        .values({
          initiativeId,
          siteId: site.id,
          nameAr,
          leadUserId: leader?.userId ?? null,
          partnerId: partner?.id ?? null,
          contactPhone: input.contactPhone?.trim() || null,
          hoursPerDay:
            input.hoursPerDay == null ? null : String(input.hoursPerDay),
          meetsAt: input.meetsAt ? new Date(input.meetsAt) : null,
          meetingPointAr: input.meetingPointAr
            ? normalizeText(input.meetingPointAr)
            : null,
          instructionsAr: input.instructionsAr?.trim() || null,
          ...(input.displayOrder !== undefined
            ? { displayOrder: input.displayOrder }
            : {}),
        })
        .returning({ id: fieldGroups.id })

      if (!created) throw new Error('Failed to create field group.')

      await recordAudit(
        {
          action: 'field.group_created',
          actorUserId: actor.userId,
          entityType: 'field_group',
          entityId: created.id,
          entityLabel: nameAr,
          summaryAr: `إضافة مجموعة ميدانية في ${site.nameAr}`,
          metadata: {
            initiativeId,
            siteId: site.id,
            leadUserId: leader?.userId ?? null,
            partnerId: partner?.id ?? null,
          },
          ...trace,
        },
        tx,
      )
    }),
  )

  return loadInitiativeField(initiativeId)
}

export async function updateGroup(
  initiativeId: string,
  groupId: string,
  input: dto.UpdateGroupBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const existing = await requireGroup(initiativeId, groupId)

  if (input.siteId && input.siteId !== existing.siteId) {
    await requireLiveSite(initiativeId, input.siteId)
  }

  const leadChanged =
    input.leadUserId !== undefined && input.leadUserId !== existing.leadUserId

  const leader =
    leadChanged && input.leadUserId ? await requireLead(input.leadUserId) : null

  const partnerChanged =
    input.partnerId !== undefined && input.partnerId !== existing.partnerId

  if (partnerChanged && input.partnerId) {
    await requireTeamPartner(input.partnerId)
  }

  const changes = {
    ...(partnerChanged ? { partnerId: input.partnerId ?? null } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.nameAr ? { nameAr: normalizeText(input.nameAr) } : {}),
    ...(leadChanged ? { leadUserId: input.leadUserId ?? null } : {}),
    ...(input.contactPhone !== undefined
      ? { contactPhone: input.contactPhone?.trim() || null }
      : {}),
    ...(input.hoursPerDay !== undefined
      ? {
          hoursPerDay:
            input.hoursPerDay === null ? null : String(input.hoursPerDay),
        }
      : {}),
    ...(input.meetsAt !== undefined
      ? { meetsAt: input.meetsAt ? new Date(input.meetsAt) : null }
      : {}),
    ...(input.meetingPointAr !== undefined
      ? {
          meetingPointAr: input.meetingPointAr
            ? normalizeText(input.meetingPointAr)
            : null,
        }
      : {}),
    ...(input.instructionsAr !== undefined
      ? { instructionsAr: input.instructionsAr?.trim() || null }
      : {}),
    ...(input.displayOrder !== undefined
      ? { displayOrder: input.displayOrder }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await guardName(() =>
      db.transaction(async (tx) => {
        await tx
          .update(fieldGroups)
          .set(changes)
          .where(eq(fieldGroups.id, groupId))

        await recordAudit(
          {
            /**
             * تسمية القائد حدث بذاته: هي ما يفتح لحساب بابَ التسجيل على
             * موقع، فسؤال «من جعله قائدًا ومتى؟» يُجاب من السجل مباشرة.
             */
            action: leadChanged ? 'field.lead_assigned' : 'field.group_updated',
            severity: leadChanged ? 'NOTICE' : 'INFO',
            actorUserId: actor.userId,
            entityType: 'field_group',
            entityId: groupId,
            entityLabel: changes.nameAr ?? existing.nameAr,
            summaryAr: leadChanged
              ? leader
                ? `تسمية ${leader.fullNameAr} قائدًا للمجموعة`
                : 'ترك المجموعة بلا قائد'
              : 'تعديل مجموعة ميدانية',
            metadata: {
              initiativeId,
              fields: Object.keys(changes),
              ...(leadChanged
                ? {
                    previousLeadUserId: existing.leadUserId,
                    leadUserId: input.leadUserId ?? null,
                  }
                : {}),
              ...(partnerChanged
                ? {
                    previousPartnerId: existing.partnerId,
                    partnerId: input.partnerId ?? null,
                  }
                : {}),
            },
            ...trace,
          },
          tx,
        )
      }),
    )
  }

  return loadInitiativeField(initiativeId)
}

export async function deleteGroup(
  initiativeId: string,
  groupId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const existing = await requireGroup(initiativeId, groupId)

  /**
   * الحضور يتبع المجموعة في الحذف، وهو أساس الشهادات وسجل المشارك عبر
   * الحملات. مجموعة عمل فيها أحد تبقى؛ ما يُحذف مجموعة كُوّنت خطأً.
   */
  const [attended] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(eq(attendance.groupId, groupId))
    .limit(1)

  if (attended) {
    throw errors.conflict(
      'للمجموعة سجل حضور، فلا تُحذف. أعفِ قائدها أو عدّل اسمها بدلًا من ذلك.',
    )
  }

  await db.transaction(async (tx) => {
    await tx.delete(fieldGroups).where(eq(fieldGroups.id, groupId))

    await recordAudit(
      {
        action: 'field.group_deleted',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'field_group',
        entityId: groupId,
        entityLabel: existing.nameAr,
        summaryAr: 'حذف مجموعة ميدانية',
        metadata: {
          initiativeId,
          siteId: existing.siteId,
          leadUserId: existing.leadUserId,
        },
        ...trace,
      },
      tx,
    )
  })

  return loadInitiativeField(initiativeId)
}

// ── الأعضاء ────────────────────────────────────────────────────────────

const todayAttendance = alias(attendance, 'member_day_attendance')
const memberLink = alias(participantLinks, 'member_link')

/**
 * أعضاء المجموعة للمنسّق: وسيلة التواصل كاملة، وحضور اليوم المطلوب، وعدد
 * أيام الحضور في المجموعة كلها.
 */
export async function listGroupMembers(
  initiativeId: string,
  groupId: string,
  day = damascusDay(new Date()),
) {
  await requireGroup(initiativeId, groupId)

  const rows = await db
    .select({
      id: fieldGroupMembers.id,
      participantId: participants.id,
      fullNameAr: participants.fullNameAr,
      phone: participants.phone,
      email: participants.email,
      role: fieldGroupMembers.role,
      rsvp: fieldGroupMembers.rsvp,
      rsvpAt: fieldGroupMembers.rsvpAt,
      sourceSubmissionId: participants.sourceSubmissionId,
      linkExpiresAt: memberLink.expiresAt,
      linkLastUsedAt: memberLink.lastUsedAt,
      linkEmailedAt: memberLink.emailedAt,
      attendanceId: todayAttendance.id,
      checkedInAt: todayAttendance.checkedInAt,
      method: todayAttendance.method,
      attendedDays: sql<number>`(
        select count(distinct ${attendance.attendedOn})::int from ${attendance}
         where ${attendance.groupId} = ${fieldGroupMembers.groupId}
           and ${attendance.participantId} = ${fieldGroupMembers.participantId}
           and ${attendance.undoneAt} is null
      )`.as('attended_days'),
      lastAttendedOn: sql<string | null>`(
        select max(${attendance.attendedOn})::text from ${attendance}
         where ${attendance.groupId} = ${fieldGroupMembers.groupId}
           and ${attendance.participantId} = ${fieldGroupMembers.participantId}
           and ${attendance.undoneAt} is null
      )`.as('last_attended_on'),
    })
    .from(fieldGroupMembers)
    .innerJoin(
      participants,
      eq(fieldGroupMembers.participantId, participants.id),
    )
    // الفهرس الفريد يضمن رابطًا غير ملغى واحدًا للمشارك في المبادرة.
    .leftJoin(
      memberLink,
      and(
        eq(memberLink.participantId, fieldGroupMembers.participantId),
        eq(memberLink.initiativeId, initiativeId),
        isNull(memberLink.revokedAt),
      ),
    )
    .leftJoin(
      todayAttendance,
      and(
        eq(todayAttendance.groupId, fieldGroupMembers.groupId),
        eq(todayAttendance.participantId, fieldGroupMembers.participantId),
        eq(todayAttendance.attendedOn, day),
        isNull(todayAttendance.undoneAt),
      ),
    )
    .where(eq(fieldGroupMembers.groupId, groupId))
    .orderBy(asc(participants.nameKey), asc(participants.createdAt))

  const now = new Date()

  return {
    groupId,
    day,
    members: rows.map((row) => ({
      id: row.id,
      participantId: row.participantId,
      fullNameAr: row.fullNameAr,
      phone: row.phone,
      email: row.email,
      role: row.role,
      rsvp: row.rsvp,
      fromForm: row.sourceSubmissionId !== null,
      attendedDays: row.attendedDays,
      lastAttendedOn: row.lastAttendedOn,
      rsvpAt: row.rsvpAt?.toISOString() ?? null,
      link: row.linkExpiresAt
        ? {
            status:
              row.linkExpiresAt.getTime() > now.getTime()
                ? ('ACTIVE' as const)
                : ('EXPIRED' as const),
            expiresAt: row.linkExpiresAt.toISOString(),
            lastUsedAt: row.linkLastUsedAt?.toISOString() ?? null,
            emailedAt: row.linkEmailedAt?.toISOString() ?? null,
          }
        : null,
      attendance:
        row.attendanceId && row.checkedInAt && row.method
          ? {
              id: row.attendanceId,
              checkedInAt: row.checkedInAt.toISOString(),
              method: row.method,
            }
          : null,
    })),
  }
}

/**
 * إضافة أعضاء من ثلاثة مصادر في طلب واحد: طلبات مقبولة، ومشاركون سابقون،
 * وأسماء تُكتب باليد.
 *
 * تحويل الطلب إلى مشارك يقع هنا، بقرار المنسّق: الاستمارة لا تكتب في كيان
 * أساسي من تلقائها، وما يعبر منها الاسم ووسيلة التواصل وحدهما.
 */
export async function addGroupMembers(
  initiativeId: string,
  groupId: string,
  input: dto.AddMembersBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)

  const group = await requireGroup(initiativeId, groupId)

  const applicants =
    input.formId && input.submissionIds.length > 0
      ? await listAcceptedApplicants(input.formId, { ids: input.submissionIds })
      : []

  const accepted = new Set(applicants.map((applicant) => applicant.id))
  const pending = input.submissionIds.filter((id) => !accepted.has(id))

  if (pending.length > 0) {
    throw errors.unprocessable(
      'من الطلبات المختارة ما لم يُقبل بعد، أو ليس من هذه الاستمارة. يُضاف المقبول وحده.',
      { submissionIds: pending },
    )
  }

  const known =
    input.participantIds.length > 0
      ? await db
          .select({ id: participants.id })
          .from(participants)
          .where(inArray(participants.id, input.participantIds))
      : []

  if (known.length !== new Set(input.participantIds).size) {
    throw errors.unprocessable('من المشاركين المختارين من لم يعد في السجل.')
  }

  const summary = {
    added: 0,
    alreadyMembers: 0,
    newParticipants: 0,
    skipped: [] as Array<{ submissionId: string; reasonAr: string }>,
  }

  await db.transaction(async (tx) => {
    const join = async (participantId: string) => {
      const inserted = await tx
        .insert(fieldGroupMembers)
        .values({ groupId, participantId, addedById: actor.userId })
        .onConflictDoNothing()
        .returning({ id: fieldGroupMembers.id })

      if (inserted.length > 0) summary.added += 1
      else summary.alreadyMembers += 1
    }

    for (const applicant of applicants) {
      if (!applicant.applicantNameAr) {
        summary.skipped.push({
          submissionId: applicant.id,
          reasonAr: 'الطلب بلا اسم: لا سؤال في الاستمارة موسوم بدور «الاسم».',
        })
        continue
      }

      const resolved = await resolveParticipant(
        tx,
        {
          fullNameAr: applicant.applicantNameAr,
          phone: applicant.applicantPhone,
          email: applicant.applicantEmail,
          sourceSubmissionId: applicant.id,
        },
        { actorUserId: actor.userId, groupId },
      )

      if (resolved.created) summary.newParticipants += 1

      await join(resolved.id)
    }

    for (const participantId of new Set(input.participantIds)) {
      await join(participantId)
    }

    for (const person of input.people) {
      const resolved = await resolveParticipant(tx, person, {
        actorUserId: actor.userId,
        groupId,
      })

      if (resolved.created) summary.newParticipants += 1

      await join(resolved.id)
    }

    await recordAudit(
      {
        action: 'field.members_added',
        actorUserId: actor.userId,
        entityType: 'field_group',
        entityId: groupId,
        entityLabel: group.nameAr,
        summaryAr: `إضافة ${summary.added} إلى المجموعة`,
        metadata: {
          initiativeId,
          added: summary.added,
          alreadyMembers: summary.alreadyMembers,
          newParticipants: summary.newParticipants,
          fromSubmissions: applicants.length,
          fromRegistry: input.participantIds.length,
          typed: input.people.length,
        },
        ...trace,
      },
      tx,
    )
  })

  return { ...(await listGroupMembers(initiativeId, groupId)), summary }
}

async function requireMember(groupId: string, memberId: string) {
  const [row] = await db
    .select({
      id: fieldGroupMembers.id,
      participantId: fieldGroupMembers.participantId,
      fullNameAr: participants.fullNameAr,
    })
    .from(fieldGroupMembers)
    .innerJoin(
      participants,
      eq(fieldGroupMembers.participantId, participants.id),
    )
    .where(
      and(
        eq(fieldGroupMembers.id, memberId),
        eq(fieldGroupMembers.groupId, groupId),
      ),
    )
    .limit(1)

  if (!row) throw errors.notFound('العضو غير موجود في هذه المجموعة.')

  return row
}

export async function updateGroupMember(
  initiativeId: string,
  groupId: string,
  memberId: string,
  input: dto.UpdateMemberBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)
  await requireGroup(initiativeId, groupId)

  const member = await requireMember(groupId, memberId)

  await db.transaction(async (tx) => {
    await tx
      .update(fieldGroupMembers)
      .set({ role: input.role })
      .where(eq(fieldGroupMembers.id, memberId))

    await recordAudit(
      {
        action: 'field.member_updated',
        actorUserId: actor.userId,
        entityType: 'field_group_member',
        entityId: memberId,
        entityLabel: member.fullNameAr,
        summaryAr:
          input.role === 'ASSISTANT'
            ? 'تسمية عضو مساعدًا لقائد مجموعته'
            : 'إعادة مساعد إلى عضو',
        metadata: { initiativeId, groupId, role: input.role },
        ...trace,
      },
      tx,
    )
  })

  return listGroupMembers(initiativeId, groupId)
}

export async function removeGroupMember(
  initiativeId: string,
  groupId: string,
  memberId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireOpenCampaign(initiativeId)
  await requireGroup(initiativeId, groupId)

  const member = await requireMember(groupId, memberId)

  await db.transaction(async (tx) => {
    // العضوية وحدها: المشارك يبقى في السجل، وحضوره السابق في المجموعة محفوظ.
    await tx.delete(fieldGroupMembers).where(eq(fieldGroupMembers.id, memberId))

    await recordAudit(
      {
        action: 'field.member_removed',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'field_group_member',
        entityId: memberId,
        entityLabel: member.fullNameAr,
        summaryAr: 'إخراج عضو من مجموعة ميدانية',
        metadata: { initiativeId, groupId, participantId: member.participantId },
        ...trace,
      },
      tx,
    )
  })

  return listGroupMembers(initiativeId, groupId)
}

// ── مصادر الأعضاء ──────────────────────────────────────────────────────

export async function listApplicantSources() {
  const rows = await db
    .select({
      formId: forms.id,
      nameAr: forms.nameAr,
      acceptedCount: sql<number>`count(${formSubmissions.id})::int`,
    })
    .from(formSubmissions)
    .innerJoin(formVersions, eq(formSubmissions.formVersionId, formVersions.id))
    .innerJoin(forms, eq(formVersions.formId, forms.id))
    .where(eq(formSubmissions.status, 'ACCEPTED'))
    .groupBy(forms.id, forms.nameAr)
    .orderBy(asc(forms.nameAr))

  return rows
}

/** أسماء مجموعات كل مشارك في هذه المبادرة، ليرى المنسّق من وُزّع ومن بقي. */
async function groupNamesOf(
  initiativeId: string,
  participantIds: readonly string[],
) {
  const byParticipant = new Map<string, string[]>()

  if (participantIds.length === 0) return byParticipant

  const rows = await db
    .select({
      participantId: fieldGroupMembers.participantId,
      nameAr: fieldGroups.nameAr,
    })
    .from(fieldGroupMembers)
    .innerJoin(fieldGroups, eq(fieldGroupMembers.groupId, fieldGroups.id))
    .where(
      and(
        eq(fieldGroups.initiativeId, initiativeId),
        inArray(fieldGroupMembers.participantId, [...participantIds]),
      ),
    )
    .orderBy(asc(fieldGroups.nameAr))

  for (const row of rows) {
    byParticipant.set(row.participantId, [
      ...(byParticipant.get(row.participantId) ?? []),
      row.nameAr,
    ])
  }

  return byParticipant
}

export async function listApplicants(
  initiativeId: string,
  query: dto.ApplicantsQuery,
) {
  await requireInitiative(initiativeId)

  const applicants = await listAcceptedApplicants(query.formId, { q: query.q })

  const converted =
    applicants.length > 0
      ? await db
          .select({
            id: participants.id,
            sourceSubmissionId: participants.sourceSubmissionId,
          })
          .from(participants)
          .where(
            inArray(
              participants.sourceSubmissionId,
              applicants.map((applicant) => applicant.id),
            ),
          )
      : []

  const participantOf = new Map(
    converted.map((row) => [row.sourceSubmissionId, row.id]),
  )
  const groups = await groupNamesOf(
    initiativeId,
    converted.map((row) => row.id),
  )

  return applicants.map((applicant) => {
    const participantId = participantOf.get(applicant.id) ?? null

    return {
      submissionId: applicant.id,
      fullNameAr: applicant.applicantNameAr,
      phone: applicant.applicantPhone,
      email: applicant.applicantEmail,
      submittedAt: applicant.submittedAt.toISOString(),
      participantId,
      groupNamesAr: participantId ? (groups.get(participantId) ?? []) : [],
    }
  })
}

export async function searchParticipants(
  initiativeId: string,
  query: dto.ParticipantsQuery,
) {
  await requireInitiative(initiativeId)

  const name = nameKey(query.q)
  const phone = phoneKey(query.q)

  const rows = await db
    .select({
      id: participants.id,
      fullNameAr: participants.fullNameAr,
      phone: participants.phone,
      email: participants.email,
      attendedDays: sql<number>`(
        select count(distinct (${attendance.groupId}, ${attendance.attendedOn}))::int
          from ${attendance}
         where ${attendance.participantId} = ${participants.id}
           and ${attendance.undoneAt} is null
      )`.as('attended_days'),
    })
    .from(participants)
    .where(
      or(
        sql`${participants.nameKey} like ${`%${name}%`}`,
        phone ? sql`${participants.phoneKey} like ${`%${phone}%`}` : undefined,
      ),
    )
    .orderBy(asc(participants.nameKey))
    .limit(30)

  const groups = await groupNamesOf(
    initiativeId,
    rows.map((row) => row.id),
  )

  return rows.map((row) => ({
    ...row,
    groupNamesAr: groups.get(row.id) ?? [],
  }))
}

// ── الحضور ─────────────────────────────────────────────────────────────

/**
 * الحضور بالأيام والمواقع. عدد الموقع أشخاص مختلفون لا مجموع مجموعاته:
 * من سُجّل في مجموعتين في الموقع نفسه حاضر واحد.
 */
export async function loadAttendanceSummary(initiativeId: string) {
  await requireInitiative(initiativeId)

  const [sites, groups] = await Promise.all([
    db
      .select({
        day: attendance.attendedOn,
        siteId: initiativeSites.id,
        siteNameAr: initiativeSites.nameAr,
        present: countDistinct(attendance.participantId),
      })
      .from(attendance)
      .innerJoin(fieldGroups, eq(attendance.groupId, fieldGroups.id))
      .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
      .where(
        and(
          eq(fieldGroups.initiativeId, initiativeId),
          isNull(attendance.undoneAt),
        ),
      )
      .groupBy(attendance.attendedOn, initiativeSites.id, initiativeSites.nameAr)
      .orderBy(desc(attendance.attendedOn), asc(initiativeSites.nameAr)),

    db
      .select({
        day: attendance.attendedOn,
        siteId: fieldGroups.siteId,
        groupId: fieldGroups.id,
        nameAr: fieldGroups.nameAr,
        present: countDistinct(attendance.participantId),
      })
      .from(attendance)
      .innerJoin(fieldGroups, eq(attendance.groupId, fieldGroups.id))
      .where(
        and(
          eq(fieldGroups.initiativeId, initiativeId),
          isNull(attendance.undoneAt),
        ),
      )
      .groupBy(
        attendance.attendedOn,
        fieldGroups.siteId,
        fieldGroups.id,
        fieldGroups.nameAr,
      )
      .orderBy(asc(fieldGroups.nameAr)),
  ])

  return sites.map((site) => ({
    ...site,
    groups: groups
      .filter((group) => group.day === site.day && group.siteId === site.siteId)
      .map(({ groupId, nameAr, present }) => ({ groupId, nameAr, present })),
  }))
}

/**
 * معرّف ثابت لقيد حضور يومٍ في موقع على مؤشر، بصيغة UUID.
 *
 * ثباته هو ما يمنع تسجيل اليوم مرتين: الطلب الثاني يولّد المعرّف نفسه
 * فيجد القيد الأول. و`attempt` يفتح بابًا بعد العكس: قيد عُكس لا يُحتسب،
 * فالتسجيل بعده محاولة ثانية بمعرّفها.
 */
function attendanceEntryId(
  siteId: string,
  metricId: string,
  day: string,
  attempt: number,
) {
  const hex = createHash('sha256')
    .update(`attendance-impact:${siteId}:${metricId}:${day}:${attempt}`)
    .digest('hex')

  // الخانتان المحجوزتان تجعلانه UUID صالحًا من الإصدار الرابع شكلًا.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

const reversal = alias(impactEntries, 'attendance_entry_reversal')

/** أول معرّف لم يُستعمل، أو القيد القائم الذي يحمل معرّفًا سبق. */
async function openAttendanceSlot(siteId: string, metricId: string, day: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const clientId = attendanceEntryId(siteId, metricId, day, attempt)

    const [entry] = await db
      .select({
        id: impactEntries.id,
        value: impactEntries.value,
        reversedById: reversal.id,
      })
      .from(impactEntries)
      .leftJoin(reversal, eq(reversal.reversalOfId, impactEntries.id))
      .where(eq(impactEntries.clientId, clientId))
      .limit(1)

    if (!entry) return { clientId, standing: null }

    if (!entry.reversedById) {
      return { clientId, standing: { id: entry.id, value: Number(entry.value) } }
    }
  }

  throw errors.conflict('عُكس قيد حضور هذا اليوم مرات كثيرة. سجّله يدويًا من دفتر الأثر.')
}

/**
 * حضور يومٍ قيدَ أثر: صف لكل موقع بعدد من حضروا فيه، غير موثَّق، يتحقق منه
 * المنسّق كأي قيد ميداني.
 *
 * المؤشر يختاره المنسّق من الكتالوج: لا اسم مؤشر في الكود.
 */
export async function recordAttendanceImpact(
  initiativeId: string,
  input: dto.AttendanceImpactBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const summary = await loadAttendanceSummary(initiativeId)
  const sites = summary.filter((row) => row.day === input.day && row.present > 0)

  if (sites.length === 0) {
    throw errors.unprocessable('لا حضور مسجَّل في ذلك اليوم.')
  }

  const slots = await Promise.all(
    sites.map(async (site) => ({
      site,
      ...(await openAttendanceSlot(site.siteId, input.metricId, input.day)),
    })),
  )

  const changed = slots.filter(
    (slot) => slot.standing && slot.standing.value !== slot.site.present,
  )

  if (changed.length > 0) {
    throw errors.conflict(
      `سُجّل حضور هذا اليوم في ${changed
        .map((slot) => `«${slot.site.siteNameAr}»`)
        .join('، ')} بعدد آخر. اعكس القيد السابق من دفتر الأثر، ثم سجّل الحضور من جديد.`,
      {
        sites: changed.map((slot) => ({
          siteId: slot.site.siteId,
          recorded: slot.standing!.value,
          present: slot.site.present,
        })),
      },
    )
  }

  const recorded = []

  for (const slot of slots.filter((candidate) => !candidate.standing)) {
    recorded.push(
      await recordEntry(
        {
          metricId: input.metricId,
          siteId: slot.site.siteId,
          value: slot.site.present,
          source: 'FIELD_ENTRY',
          // منتصف نهار دمشق: يقع في اليوم نفسه بأي منطقة زمنية تُعرض بها.
          occurredAt: new Date(`${input.day}T09:00:00.000Z`).toISOString(),
          noteAr: `حضور يوم ${input.day} من سجل الحضور الميداني.`,
        },
        actor,
        trace,
        { clientId: slot.clientId },
      ),
    )
  }

  return {
    recorded,
    unchanged: slots
      .filter((slot) => slot.standing)
      .map((slot) => ({
        siteId: slot.site.siteId,
        siteNameAr: slot.site.siteNameAr,
        value: slot.standing!.value,
      })),
  }
}

// ── الصور ──────────────────────────────────────────────────────────────

const photoSite = alias(initiativeSites, 'photo_site')
const photoTask = alias(workItems, 'photo_task')
const photoTaskSite = alias(initiativeSites, 'photo_task_site')
const uploader = alias(users, 'photo_uploader')

const photoColumns = {
  id: attachments.id,
  url: attachments.url,
  siteId: sql<string | null>`coalesce(${attachments.siteId}, ${photoTask.siteId})`,
  siteNameAr: sql<string | null>`coalesce(${photoSite.nameAr}, ${photoTaskSite.nameAr})`,
  workItemId: attachments.workItemId,
  workItemTitleAr: photoTask.titleAr,
  groupId: attachments.groupId,
  groupNameAr: fieldGroups.nameAr,
  uploadedByNameAr: uploader.fullNameAr,
  takenAt: attachments.takenAt,
  lat: attachments.lat,
  lng: attachments.lng,
  captionAr: attachments.captionAr,
  hasPeople: attachments.hasPeople,
  peopleConsent: attachments.peopleConsent,
  publicUseAllowed: attachments.publicUseAllowed,
  sizeBytes: attachments.sizeBytes,
  createdAt: attachments.createdAt,
}

function photoQuery() {
  return db
    .select(photoColumns)
    .from(attachments)
    .leftJoin(photoSite, eq(attachments.siteId, photoSite.id))
    .leftJoin(photoTask, eq(attachments.workItemId, photoTask.id))
    .leftJoin(photoTaskSite, eq(photoTask.siteId, photoTaskSite.id))
    .leftJoin(fieldGroups, eq(attachments.groupId, fieldGroups.id))
    .leftJoin(uploader, eq(attachments.uploadedByUserId, uploader.id))
}

type PhotoRow = Awaited<ReturnType<typeof photoQuery>>[number]

function serializeManagedPhoto(row: PhotoRow) {
  return {
    ...row,
    takenAt: row.takenAt?.toISOString() ?? null,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * ما يخص هذه المبادرة من المرفقات: ما عُلّق عليها، أو على أحد مواقعها، أو
 * على مهمة من مهامها ومهام مواقعها. النطاق يُفحص هنا مرة، فكل مسار على
 * صورة يمرّ منه ولا يصل منسّقُ مبادرةٍ صورَ غيرها.
 */
function inInitiative(initiativeId: string) {
  return or(
    eq(attachments.initiativeId, initiativeId),
    eq(photoSite.initiativeId, initiativeId),
    eq(photoTask.initiativeId, initiativeId),
    eq(photoTaskSite.initiativeId, initiativeId),
  )
}

export async function listPhotos(initiativeId: string, query: dto.PhotosQuery) {
  await requireInitiative(initiativeId)

  const rows = await photoQuery()
    .where(
      and(
        inInitiative(initiativeId),
        query.siteId
          ? or(
              eq(attachments.siteId, query.siteId),
              eq(photoTask.siteId, query.siteId),
            )
          : undefined,
        query.groupId ? eq(attachments.groupId, query.groupId) : undefined,
      ),
    )
    .orderBy(desc(attachments.createdAt))
    .limit(300)

  return rows.map(serializeManagedPhoto)
}

async function requirePhoto(initiativeId: string, photoId: string) {
  const [row] = await photoQuery()
    .where(and(eq(attachments.id, photoId), inInitiative(initiativeId)))
    .limit(1)

  if (!row) throw errors.notFound('الصورة غير موجودة في هذه المبادرة.')

  return row
}

export async function updatePhoto(
  initiativeId: string,
  photoId: string,
  input: dto.UpdatePhotoBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const photo = await requirePhoto(initiativeId, photoId)

  const publishing =
    input.publicUseAllowed !== undefined &&
    input.publicUseAllowed !== photo.publicUseAllowed

  if (publishing && input.publicUseAllowed && photo.hasPeople && !photo.peopleConsent) {
    throw errors.unprocessable(
      'في الصورة أشخاص ولم تُسجَّل موافقتهم، فلا يُسمح بنشرها.',
    )
  }

  const changes = {
    ...(publishing
      ? input.publicUseAllowed
        ? {
            publicUseAllowed: true,
            publicUseAllowedAt: new Date(),
            publicUseAllowedById: actor.userId,
          }
        : {
            publicUseAllowed: false,
            publicUseAllowedAt: null,
            publicUseAllowedById: null,
          }
      : {}),
    ...(input.captionAr !== undefined
      ? { captionAr: input.captionAr ? normalizeText(input.captionAr) : null }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(attachments).set(changes).where(eq(attachments.id, photoId))

      await recordAudit(
        {
          action: publishing
            ? input.publicUseAllowed
              ? 'field.photo_public_allowed'
              : 'field.photo_public_revoked'
            : 'field.photo_updated',
          // فتح صورة على العموم قرار يُسأل عنه؛ سحبه وتعديل الوصف لا.
          severity: publishing && input.publicUseAllowed ? 'NOTICE' : 'INFO',
          actorUserId: actor.userId,
          entityType: 'attachment',
          entityId: photoId,
          entityLabel: photo.siteNameAr ?? photo.workItemTitleAr ?? 'صورة',
          summaryAr: publishing
            ? input.publicUseAllowed
              ? 'السماح بنشر صورة من الميدان'
              : 'سحب السماح بنشر صورة'
            : 'تعديل وصف صورة',
          metadata: { initiativeId, hasPeople: photo.hasPeople },
          ...trace,
        },
        tx,
      )
    })
  }

  return serializeManagedPhoto(await requirePhoto(initiativeId, photoId))
}

/**
 * حذف صورة: من التخزين ثم من القاعدة.
 *
 * بهذا الترتيب لأن فشل الأول يُبقي الصف، فتُعاد المحاولة؛ وعكسه يترك ملفًا
 * على رابطه العلني لا يدلّ عليه شيء في النظام.
 */
export async function deletePhoto(
  initiativeId: string,
  photoId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const photo = await requirePhoto(initiativeId, photoId)

  await deleteUpload('FIELD_PHOTO', photo.url)

  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, photoId))

    await recordAudit(
      {
        action: 'field.photo_deleted',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'attachment',
        entityId: photoId,
        entityLabel: photo.siteNameAr ?? photo.workItemTitleAr ?? 'صورة',
        summaryAr: 'حذف صورة من الميدان',
        metadata: {
          initiativeId,
          groupId: photo.groupId,
          hasPeople: photo.hasPeople,
          wasPublic: photo.publicUseAllowed,
        },
        ...trace,
      },
      tx,
    )
  })
}
