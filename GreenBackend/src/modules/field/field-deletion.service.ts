import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { nameKey, phoneKey } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { auditLogs } from '../../db/schema/audit.js'
import {
  attendance,
  fieldGroupMembers,
  fieldGroups,
  participantCertificates,
  participantDeletionRequests,
  participantLinks,
  participants,
} from '../../db/schema/field.js'
import { pushSubscriptions } from '../../db/schema/field-notify.js'
import { formSubmissions } from '../../db/schema/forms.js'
import { users } from '../../db/schema/identity.js'
import { outboxJobs } from '../../db/schema/outbox.js'
import { initiatives } from '../../db/schema/programs.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type * as dto from './field-admin.schemas.js'
import type { ParticipantPrincipal } from './field-auth.js'

/** ما يبقى مكان الاسم بعد الحذف: الحضور يبقى عددًا، وصاحبه بلا اسم. */
export const ANONYMOUS_NAME_AR = 'مشارك محذوف'

const REDACTED_SUBMISSION_AR = 'طلب حُذفت بياناته'

/** قوالب البريد التي تحمل اسم المشارك ورابطه أو إجاباته. */
const PERSONAL_TEMPLATES = ['field-link', 'form-copy']

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Transaction

/** ما يُطابَق به الهاتف في القاعدة قبل المقارنة الدقيقة في الكود. */
const PHONE_TAIL = 6

type Identity = {
  id: string
  nameKey: string
  phoneKey: string | null
  email: string | null
  sourceSubmissionId: string | null
}

/**
 * طلبات الاستمارات التي تعود للشخص: الطلب الذي جاء منه، وكل طلب يطابقه
 * بقاعدة الهوية نفسها — الاسم مع الهاتف، أو الاسم مع البريد.
 *
 * بلا هذا يبقى اسمه وهاتفه في طلبٍ قدّمه لحملة أخرى، ويعود مشاركًا عند
 * أول توزيع لمقبولي تلك الاستمارة.
 *
 * المطابقة على الأعمدة المستخرجة وحدها. طلب بلا اسم مستخرَج — استمارة لم
 * يوسَم فيها سؤال الاسم — لا يُعرف صاحبه من هنا.
 */
async function submissionsOf(executor: Executor, person: Identity) {
  const found = new Set<string>()

  if (person.sourceSubmissionId) found.add(person.sourceSubmissionId)

  if (!person.phoneKey && !person.email) return [...found]

  // الأرقام الهندية والفارسية تُحوَّل قبل المقارنة، كما يفعل `phoneKey`.
  const digits = sql`regexp_replace(
    translate(${formSubmissions.applicantPhone}, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    '[^0-9]', '', 'g'
  )`

  const candidates = await executor
    .select({
      id: formSubmissions.id,
      nameAr: formSubmissions.applicantNameAr,
      phone: formSubmissions.applicantPhone,
      email: formSubmissions.applicantEmail,
    })
    .from(formSubmissions)
    .where(
      and(
        isNull(formSubmissions.redactedAt),
        isNotNull(formSubmissions.applicantNameAr),
        or(
          person.email
            ? sql`lower(${formSubmissions.applicantEmail}) = ${person.email}`
            : undefined,
          person.phoneKey
            ? sql`${digits} like ${`%${person.phoneKey.slice(-PHONE_TAIL)}`}`
            : undefined,
        ),
      ),
    )

  for (const row of candidates) {
    if (!row.nameAr || nameKey(row.nameAr) !== person.nameKey) continue

    const samePhone =
      person.phoneKey !== null && phoneKey(row.phone) === person.phoneKey
    const sameEmail =
      person.email !== null && row.email?.trim().toLowerCase() === person.email

    if (samePhone || sameEmail) found.add(row.id)
  }

  return [...found]
}

// ── المتطوع: الطلب والتراجع عنه ─────────────────────────────────────────

/**
 * حال طلب الحذف كما تعرضه البطاقة: القائم، أو آخر ما رُفض بملاحظته.
 *
 * الطلب على الشخص لا على الحملة: من له رابطان يرى طلبه في البطاقتين. وما
 * نُفّذ لا يُعرض — صاحبه لم يعد له رابط يفتح به بطاقة.
 */
export async function loadDeletionRequest(participantId: string) {
  const [row] = await db
    .select({
      status: participantDeletionRequests.status,
      requestedAt: participantDeletionRequests.requestedAt,
      decidedAt: participantDeletionRequests.decidedAt,
      noteAr: participantDeletionRequests.decisionNoteAr,
    })
    .from(participantDeletionRequests)
    .where(eq(participantDeletionRequests.participantId, participantId))
    .orderBy(desc(participantDeletionRequests.requestedAt))
    .limit(1)

  if (!row || row.status === 'DONE') return null

  return {
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    noteAr: row.noteAr,
  }
}

/**
 * طلب حذف البيانات من البطاقة. طلب قائم واحد للشخص: تكراره يعيد القائم ولا
 * يفتح ثانيًا.
 *
 * الطلب لا يحذف شيئًا: ينفّذه المنسّق من اللوحة. رابط يُشارَك أو هاتف يُعار
 * لا يمحو سجل صاحبه بنقرة.
 */
export async function requestDeletion(
  principal: ParticipantPrincipal,
  trace: RequestTrace,
) {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(participantDeletionRequests)
      .values({
        participantId: principal.participantId,
        initiativeId: principal.initiativeId,
      })
      // القائم يبقى بتاريخه: الفهرس الفريد الجزئي على ما لم يُقرَّر.
      .onConflictDoNothing()
      .returning({ id: participantDeletionRequests.id })

    if (!created) return

    await recordAudit(
      {
        action: 'field.deletion_requested',
        actorType: 'SYSTEM',
        severity: 'NOTICE',
        entityType: 'participant_deletion_request',
        entityId: created.id,
        entityLabel: 'طلب حذف بيانات',
        summaryAr: 'طلب متطوع حذف بياناته من بطاقته',
        metadata: {
          participantId: principal.participantId,
          initiativeId: principal.initiativeId,
        },
        ...trace,
      },
      tx,
    )
  })
}

/** التراجع عن طلب لم يُقرَّر بعد. غيابه نجاح: ما يُطلب قد تحقق. */
export async function withdrawDeletion(
  principal: ParticipantPrincipal,
  trace: RequestTrace,
) {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(participantDeletionRequests)
      .where(
        and(
          eq(participantDeletionRequests.participantId, principal.participantId),
          eq(participantDeletionRequests.status, 'PENDING'),
        ),
      )
      .returning({ id: participantDeletionRequests.id })

    for (const row of removed) {
      await recordAudit(
        {
          action: 'field.deletion_withdrawn',
          actorType: 'SYSTEM',
          entityType: 'participant_deletion_request',
          entityId: row.id,
          entityLabel: 'طلب حذف بيانات',
          summaryAr: 'تراجع متطوع عن طلب حذف بياناته',
          metadata: {
            participantId: principal.participantId,
            initiativeId: principal.initiativeId,
          },
          ...trace,
        },
        tx,
      )
    }
  })
}

// ── المنسّق: القائمة والقرار ─────────────────────────────────────────────

async function requireInitiative(initiativeId: string) {
  const [row] = await db
    .select({ id: initiatives.id, nameAr: initiatives.nameAr })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!row) throw errors.notFound('المبادرة غير موجودة.')

  return row
}

/**
 * طلبات الحذف التي وصلت من روابط هذه المبادرة، القائم أولًا.
 *
 * مع كل طلب ما يلزم المنسّق ليقرر: من صاحبه، وأين هو في هذه الحملة، وما
 * يمسّه التنفيذ خارجها — الحذف على الشخص كله لا على حملة.
 */
export async function listDeletionRequests(initiativeId: string) {
  await requireInitiative(initiativeId)

  const rows = await db
    .select({
      id: participantDeletionRequests.id,
      status: participantDeletionRequests.status,
      requestedAt: participantDeletionRequests.requestedAt,
      decidedAt: participantDeletionRequests.decidedAt,
      decidedByNameAr: users.fullNameAr,
      decisionNoteAr: participantDeletionRequests.decisionNoteAr,
      participantId: participants.id,
      fullNameAr: participants.fullNameAr,
      phone: participants.phone,
      email: participants.email,
      anonymizedAt: participants.anonymizedAt,
      nameKey: participants.nameKey,
      phoneKey: participants.phoneKey,
      sourceSubmissionId: participants.sourceSubmissionId,
      attendedDays: sql<number>`(
        select count(distinct (${attendance.groupId}, ${attendance.attendedOn}))::int
          from ${attendance}
         where ${attendance.participantId} = ${participants.id}
           and ${attendance.undoneAt} is null
      )`.as('attended_days'),
      initiativeCount: sql<number>`(
        select count(distinct ${fieldGroups.initiativeId})::int
          from ${fieldGroupMembers}
          join ${fieldGroups} on ${fieldGroups.id} = ${fieldGroupMembers.groupId}
         where ${fieldGroupMembers.participantId} = ${participants.id}
      )`.as('initiative_count'),
      certificateCount: sql<number>`(
        select count(*)::int from ${participantCertificates}
         where ${participantCertificates.participantId} = ${participants.id}
      )`.as('certificate_count'),
    })
    .from(participantDeletionRequests)
    .innerJoin(
      participants,
      eq(participantDeletionRequests.participantId, participants.id),
    )
    .leftJoin(users, eq(participantDeletionRequests.decidedById, users.id))
    .where(eq(participantDeletionRequests.initiativeId, initiativeId))
    .orderBy(
      // القائم أولًا: هو ما ينتظر قرارًا.
      sql`(${participantDeletionRequests.status} = 'PENDING') desc`,
      desc(participantDeletionRequests.requestedAt),
    )
    .limit(200)

  const memberships =
    rows.length > 0
      ? await db
          .select({
            participantId: fieldGroupMembers.participantId,
            nameAr: fieldGroups.nameAr,
          })
          .from(fieldGroupMembers)
          .innerJoin(fieldGroups, eq(fieldGroupMembers.groupId, fieldGroups.id))
          .where(
            and(
              eq(fieldGroups.initiativeId, initiativeId),
              inArray(
                fieldGroupMembers.participantId,
                rows.map((row) => row.participantId),
              ),
            ),
          )
          .orderBy(asc(fieldGroups.nameAr))
      : []

  // ما يمسّه التنفيذ يُحسب لما ينتظر قرارًا وحده: ما قُرّر لا يُنفَّذ ثانية.
  const submissions = new Map<string, number>()

  for (const row of rows) {
    if (row.status !== 'PENDING') continue

    const found = await submissionsOf(db, { ...row, id: row.participantId })

    submissions.set(row.participantId, found.length)
  }

  return {
    initiativeId,
    pendingCount: rows.filter((row) => row.status === 'PENDING').length,
    requests: rows.map(
      ({
        anonymizedAt,
        participantId,
        nameKey: _nameKey,
        phoneKey: _phoneKey,
        sourceSubmissionId: _sourceSubmissionId,
        ...row
      }) => ({
        ...row,
        requestedAt: row.requestedAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        participant: {
          id: participantId,
          anonymized: anonymizedAt !== null,
        },
        groupNamesAr: memberships
          .filter((member) => member.participantId === participantId)
          .map((member) => member.nameAr),
        submissionCount: submissions.get(participantId) ?? 0,
      }),
    ),
  }
}

async function requirePendingRequest(
  tx: Transaction,
  initiativeId: string,
  requestId: string,
) {
  const [row] = await tx
    .select({
      id: participantDeletionRequests.id,
      status: participantDeletionRequests.status,
      participantId: participantDeletionRequests.participantId,
    })
    .from(participantDeletionRequests)
    .where(
      and(
        eq(participantDeletionRequests.id, requestId),
        eq(participantDeletionRequests.initiativeId, initiativeId),
      ),
    )
    // قراران على الطلب نفسه في لحظة واحدة: الثاني ينتظر ثم يجده مقرَّرًا.
    .for('update')
    .limit(1)

  if (!row) throw errors.notFound('طلب الحذف غير موجود في هذه المبادرة.')

  if (row.status !== 'PENDING') {
    throw errors.conflict('سبق أن قُرّر هذا الطلب.')
  }

  return row
}

/**
 * يمحو من سجل التدقيق ما يعرّف بالشخص، ويبقي الحدث.
 *
 * استثناء مقصود من «السجل إضافي فقط»: ما جرى ومن فعله ومتى يبقى كما هو؛
 * وما يُمحى اسم من وقع عليه الفعل، وعنوان جهازه في ما فعله هو من بطاقته.
 * طلب حذف يترك الاسم في السجل لم يُنفَّذ.
 */
async function scrubAudit(
  tx: Transaction,
  subject: {
    participantId: string
    memberIds: string[]
    submissionIds: string[]
  },
) {
  const asMember = or(
    subject.memberIds.length > 0
      ? inArray(auditLogs.entityId, subject.memberIds)
      : undefined,
    sql`${auditLogs.metadata}->>'participantId' = ${subject.participantId}`,
  )

  const labels = await tx
    .update(auditLogs)
    .set({ entityLabel: ANONYMOUS_NAME_AR })
    .where(and(eq(auditLogs.entityType, 'field_group_member'), asMember))
    .returning({ id: auditLogs.id })

  const submissions =
    subject.submissionIds.length > 0
      ? await tx
          .update(auditLogs)
          .set({ entityLabel: REDACTED_SUBMISSION_AR })
          .where(
            and(
              eq(auditLogs.entityType, 'form_submission'),
              inArray(auditLogs.entityId, subject.submissionIds),
            ),
          )
          .returning({ id: auditLogs.id })
      : []

  // ما فعله من بطاقته — تسجيل حضوره، شهادته، طلبه هذا — يحمل عنوان هاتفه.
  const devices = await tx
    .update(auditLogs)
    .set({ ipAddress: null, userAgent: null })
    .where(
      and(
        eq(auditLogs.actorType, 'SYSTEM'),
        isNull(auditLogs.actorUserId),
        sql`${auditLogs.metadata}->>'participantId' = ${subject.participantId}`,
      ),
    )
    .returning({ id: auditLogs.id })

  return labels.length + submissions.length + devices.length
}

/**
 * تنفيذ طلب الحذف: الشخص يخرج من السجل، وما فعله يبقى عددًا.
 *
 * يُمحى: الاسم والهاتف والبريد والملاحظات، وطلبات الاستمارات التي تعود له
 * بإجاباتها، وعضوياته في المجموعات، وروابطه، واشتراكات إشعاره، وشهاداته،
 * ورسائل البريد التي تحمل اسمه، واسمه وعنوان هاتفه في سجل التدقيق.
 *
 * يبقى: صفوف حضوره بأيامها — منها يُحسب «كم حضر» — منسوبةً إلى مشارك بلا
 * اسم. الصف نفسه لا يُحذف: حذفه يمحو الحضور معه، فيتغيّر رقم أُعلن.
 *
 * ولا يعود: لا نسخة تُحفظ قبل المحو، فالتراجع عن التنفيذ غير ممكن.
 */
export async function approveDeletion(
  initiativeId: string,
  requestId: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  await db.transaction(async (tx) => {
    const request = await requirePendingRequest(tx, initiativeId, requestId)
    const now = new Date()

    const [person] = await tx
      .select({
        id: participants.id,
        nameKey: participants.nameKey,
        phoneKey: participants.phoneKey,
        email: participants.email,
        sourceSubmissionId: participants.sourceSubmissionId,
      })
      .from(participants)
      .where(eq(participants.id, request.participantId))
      .for('update')
      .limit(1)

    if (!person) throw errors.notFound('المشارك غير موجود.')

    // قبل المحو: بعده لا اسم ولا هاتف يُطابَق بهما.
    const submissionIds = await submissionsOf(tx, person)

    // بريده في السجل، وما كتبه في طلباته: إلى أيٍّ منها أُرسلت رسائله.
    const written =
      submissionIds.length > 0
        ? await tx
            .select({ email: formSubmissions.applicantEmail })
            .from(formSubmissions)
            .where(inArray(formSubmissions.id, submissionIds))
        : []

    const emails = [
      ...new Set(
        [person.email, ...written.map((row) => row.email)]
          .filter((email): email is string => Boolean(email))
          .map((email) => email.trim().toLowerCase()),
      ),
    ]

    const members = await tx
      .delete(fieldGroupMembers)
      .where(eq(fieldGroupMembers.participantId, person.id))
      .returning({ id: fieldGroupMembers.id })

    const links = await tx
      .update(participantLinks)
      .set({ revokedAt: now, revokedById: actor.userId })
      .where(
        and(
          eq(participantLinks.participantId, person.id),
          isNull(participantLinks.revokedAt),
        ),
      )
      .returning({ id: participantLinks.id })

    await tx
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.participantId, person.id))

    const certificates = await tx
      .delete(participantCertificates)
      .where(eq(participantCertificates.participantId, person.id))
      .returning({ id: participantCertificates.id })

    // الاسم المطبَّع يُستبدل بما لا يطابقه اسم: إضافة لاحقة لا تعيده.
    await tx
      .update(participants)
      .set({
        fullNameAr: ANONYMOUS_NAME_AR,
        nameKey: `deleted:${person.id}`,
        phone: null,
        phoneKey: null,
        email: null,
        notesAr: null,
        sourceSubmissionId: null,
        anonymizedAt: now,
      })
      .where(eq(participants.id, person.id))

    if (submissionIds.length > 0) {
      /**
       * الطلب يبقى صفًّا يُعدّ في استمارته، بلا ما كُتب فيه. ولو بقيت
       * إجاباته لعاد صاحبه مشاركًا عند أول تحويل للطلب.
       */
      await tx
        .update(formSubmissions)
        .set({
          answers: {},
          applicantNameAr: null,
          applicantEmail: null,
          applicantPhone: null,
          sourceIpHash: null,
          redactedAt: now,
        })
        .where(inArray(formSubmissions.id, submissionIds))
    }

    if (emails.length > 0) {
      await tx
        .delete(outboxJobs)
        .where(
          and(
            inArray(sql`lower(${outboxJobs.recipient})`, emails),
            inArray(outboxJobs.templateKey, PERSONAL_TEMPLATES),
          ),
        )
    }

    const scrubbed = await scrubAudit(tx, {
      participantId: person.id,
      memberIds: members.map((row) => row.id),
      submissionIds,
    })

    await tx
      .update(participantDeletionRequests)
      .set({ status: 'DONE', decidedAt: now, decidedById: actor.userId })
      .where(eq(participantDeletionRequests.id, request.id))

    await recordAudit(
      {
        action: 'field.participant_anonymized',
        severity: 'WARNING',
        actorUserId: actor.userId,
        entityType: 'participant_deletion_request',
        entityId: request.id,
        entityLabel: initiative.nameAr,
        summaryAr: 'تنفيذ طلب حذف بيانات مشارك',
        metadata: {
          initiativeId,
          participantId: person.id,
          memberships: members.length,
          linksRevoked: links.length,
          certificates: certificates.length,
          submissionsRedacted: submissionIds.length,
          auditRowsScrubbed: scrubbed,
        },
        ...trace,
      },
      tx,
    )
  })

  return listDeletionRequests(initiativeId)
}

/**
 * رفض الطلب بملاحظة يقرؤها صاحبه في بطاقته: ما الذي يلزمه ليُنفَّذ، أو
 * بمن يتصل. رفضٌ بلا سبب بابٌ مغلق لا يعرف صاحبه لماذا.
 */
export async function rejectDeletion(
  initiativeId: string,
  requestId: string,
  input: dto.RejectDeletionBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const initiative = await requireInitiative(initiativeId)

  await db.transaction(async (tx) => {
    const request = await requirePendingRequest(tx, initiativeId, requestId)

    await tx
      .update(participantDeletionRequests)
      .set({
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedById: actor.userId,
        decisionNoteAr: input.noteAr,
      })
      .where(eq(participantDeletionRequests.id, request.id))

    await recordAudit(
      {
        action: 'field.deletion_rejected',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'participant_deletion_request',
        entityId: request.id,
        entityLabel: initiative.nameAr,
        summaryAr: 'رفض طلب حذف بيانات مشارك',
        metadata: { initiativeId, participantId: request.participantId },
        ...trace,
      },
      tx,
    )
  })

  return listDeletionRequests(initiativeId)
}
