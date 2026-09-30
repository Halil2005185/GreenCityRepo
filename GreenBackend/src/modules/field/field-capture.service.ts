import { and, eq, isNull } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { isUniqueViolation } from '../../common/utils/db-errors.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import {
  attachments,
  attendance,
  fieldGroupMembers,
  participants,
} from '../../db/schema/field.js'
import { initiativeSites } from '../../db/schema/programs.js'
import { workItems } from '../../db/schema/work.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { recordEntry } from '../impact/impact.service.js'
import { ownedKey, signUpload } from '../uploads/uploads.service.js'
import {
  addComment,
  changeTaskStatus,
  transitionPath,
} from '../work/work.service.js'
import type { FieldPrincipal, StaffPrincipal } from './field-auth.js'
import type * as dto from './field.schemas.js'
import { loadSheetTasks, serializePhoto } from './field.service.js'
import {
  type AccessibleGroup,
  clientMoment,
  damascusDay,
  recorderOf,
  requireWritableGroup,
} from './field.shared.js'
import { resolveParticipant } from './participants.service.js'

// ── الحضور ─────────────────────────────────────────────────────────────

const attendanceColumns = {
  id: attendance.id,
  groupId: attendance.groupId,
  participantId: attendance.participantId,
  memberId: fieldGroupMembers.id,
  fullNameAr: participants.fullNameAr,
  attendedOn: attendance.attendedOn,
  checkedInAt: attendance.checkedInAt,
  method: attendance.method,
  undoneAt: attendance.undoneAt,
}

function attendanceQuery() {
  return db
    .select(attendanceColumns)
    .from(attendance)
    .innerJoin(participants, eq(attendance.participantId, participants.id))
    .leftJoin(
      fieldGroupMembers,
      and(
        eq(fieldGroupMembers.groupId, attendance.groupId),
        eq(fieldGroupMembers.participantId, attendance.participantId),
      ),
    )
}

type AttendanceRow = Awaited<ReturnType<typeof attendanceQuery>>[number]

function serializeAttendance(row: AttendanceRow) {
  return {
    ...row,
    checkedInAt: row.checkedInAt.toISOString(),
    undoneAt: row.undoneAt?.toISOString() ?? null,
  }
}

async function findAttendance(
  where: Parameters<ReturnType<typeof attendanceQuery>['where']>[0],
) {
  const [row] = await attendanceQuery().where(where).limit(1)

  return row ? serializeAttendance(row) : null
}

/**
 * تسجيل حضور: عضو من القائمة بنقرة، أو شخص جاء بلا تسجيل فيُضاف ويُسجَّل.
 *
 * آمن التكرار من وجهين. `clientId` يعيد الصف نفسه حين يُعاد الطلب بعد
 * انقطاع. والحضور القائم في اليوم يعيد نفسه حين ينقر القائد الاسم مرتين
 * من جهازين — فالمطلوب «فلان حاضر»، وهو حاضر.
 *
 * يسجّله قائد المجموعة أو مساعده، ويُنسب إلى من سجّله.
 */
export async function recordAttendance(
  groupId: string,
  input: dto.AttendanceBody,
  principal: FieldPrincipal,
  trace: RequestTrace,
) {
  const { group, site } = await requireWritableGroup(groupId, principal)

  const sent = await findAttendance(eq(attendance.clientId, input.clientId))

  if (sent) return sent

  const checkedInAt = clientMoment(input.checkedInAt)
  const attendedOn = damascusDay(checkedInAt)
  const recorder = recorderOf(principal)
  const actorUserId = recorder.userId

  let attendanceId: string

  try {
    attendanceId = await db.transaction(async (tx) => {
      const resolved = input.walkIn
        ? await resolveParticipant(tx, input.walkIn, {
            actorUserId,
            groupId: group.id,
          })
        : { id: input.participantId!, created: false }

      if (input.walkIn) {
        // من جاء بلا تسجيل يصير عضوًا، فتضم قائمة المجموعة كل من عمل فيها.
        await tx
          .insert(fieldGroupMembers)
          .values({
            groupId: group.id,
            participantId: resolved.id,
            addedById: actorUserId,
          })
          .onConflictDoNothing()
      } else {
        const [member] = await tx
          .select({ id: fieldGroupMembers.id })
          .from(fieldGroupMembers)
          .where(
            and(
              eq(fieldGroupMembers.groupId, group.id),
              eq(fieldGroupMembers.participantId, resolved.id),
            ),
          )
          .limit(1)

        if (!member) {
          throw errors.unprocessable(
            'هذا الشخص ليس من أعضاء المجموعة. أضفه حاضرًا بلا تسجيل.',
          )
        }
      }

      /**
       * حاضر سلفًا في هذا اليوم — نقرة من جهاز ثانٍ، أو «بلا تسجيل» طابق
       * عضوًا سُجّل قبله. يعود حضوره القائم: المطلوب «فلان حاضر»، وهو حاضر.
       */
      const [present] = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(
          and(
            eq(attendance.groupId, group.id),
            eq(attendance.participantId, resolved.id),
            eq(attendance.attendedOn, attendedOn),
            isNull(attendance.undoneAt),
          ),
        )
        .limit(1)

      if (present) return present.id

      const [created] = await tx
        .insert(attendance)
        .values({
          groupId: group.id,
          participantId: resolved.id,
          attendedOn,
          checkedInAt,
          checkedInById: recorder.userId,
          checkedInByParticipantId: recorder.participantId,
          method: input.walkIn ? 'WALK_IN' : 'LEAD_TAP',
          clientId: input.clientId,
        })
        .returning({ id: attendance.id })

      if (!created) throw new Error('Failed to record attendance.')

      await recordAudit(
        {
          action: input.walkIn
            ? 'field.walk_in_recorded'
            : 'field.attendance_recorded',
          actorUserId,
          entityType: 'attendance',
          entityId: created.id,
          entityLabel: group.nameAr,
          summaryAr: input.walkIn
            ? `حضور بلا تسجيل مسبق في ${site.nameAr}`
            : `تسجيل حضور في ${site.nameAr}`,
          metadata: {
            groupId: group.id,
            participantId: resolved.id,
            attendedOn,
            newParticipant: resolved.created,
            // مساعد القائد مشارك لا حساب: يُعرف هنا، فالسجل لا يعرفه فاعلًا.
            ...(recorder.participantId
              ? { byAssistantParticipantId: recorder.participantId }
              : {}),
          },
          ...trace,
        },
        tx,
      )

      return created.id
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error

    // طلبان متزامنان سبق أحدهما إلى الفهرس: الأول كتب، والثاني يقرأ ما كُتب.
    const raced = await findAttendance(eq(attendance.clientId, input.clientId))

    if (raced) return raced

    throw errors.conflict('سُجّل هذا الحضور من جهاز آخر للتو. حدّث الورقة.')
  }

  const recorded = await findAttendance(eq(attendance.id, attendanceId))

  if (!recorded) throw new Error('Attendance vanished after insert.')

  return recorded
}

/**
 * التراجع عن حضور سُجّل خطأً. بطابع لا بحذف، وآمن التكرار: ما أُلغي يعود
 * كما هو.
 *
 * يُعرَّف الحضور بمعرّفه أو بمعرّف المُرسِل الذي سُجّل به: القائد قد يسجّل
 * ويتراجع بلا شبكة، فلا يعرف هاتفه معرّف الخادم حين يكتب التراجع.
 */
export async function undoAttendance(
  groupId: string,
  input: dto.UndoAttendanceBody,
  principal: FieldPrincipal,
  trace: RequestTrace,
) {
  const { group } = await requireWritableGroup(groupId, principal)
  const recorder = recorderOf(principal)

  const target = await findAttendance(
    and(
      eq(attendance.groupId, group.id),
      input.attendanceId
        ? eq(attendance.id, input.attendanceId)
        : eq(attendance.clientId, input.attendanceClientId!),
    ),
  )

  if (!target) throw errors.notFound('لا حضور بهذا المعرّف في مجموعتك.')

  if (target.undoneAt) return target

  await db.transaction(async (tx) => {
    await tx
      .update(attendance)
      .set({
        undoneAt: new Date(),
        undoneById: recorder.userId,
        undoneByParticipantId: recorder.participantId,
      })
      .where(and(eq(attendance.id, target.id), isNull(attendance.undoneAt)))

    await recordAudit(
      {
        action: 'field.attendance_undone',
        severity: 'NOTICE',
        actorUserId: recorder.userId,
        entityType: 'attendance',
        entityId: target.id,
        entityLabel: group.nameAr,
        summaryAr: 'التراجع عن تسجيل حضور',
        metadata: {
          groupId: group.id,
          participantId: target.participantId,
          attendedOn: target.attendedOn,
          ...(recorder.participantId
            ? { byAssistantParticipantId: recorder.participantId }
            : {}),
        },
        ...trace,
      },
      tx,
    )
  })

  const undone = await findAttendance(eq(attendance.id, target.id))

  if (!undone) throw new Error('Attendance vanished after undo.')

  return undone
}

// ── الأعداد ────────────────────────────────────────────────────────────

/**
 * رقم من الموقع: قيد أثر على موقع المجموعة، مصدره `FIELD_ENTRY`، غير
 * موثَّق. يدخل المجاميع حين يتحقق منه المنسّق من اللوحة، كأي قيد.
 *
 * الخدمة القائمة تُستدعى كما هي: الدفتر واحد، وقيد الميدان صف فيه لا
 * دفتر بجانبه.
 */
export async function recordImpact(
  groupId: string,
  input: dto.FieldImpactBody,
  principal: StaffPrincipal,
  trace: RequestTrace,
) {
  const { site } = await requireWritableGroup(groupId, principal)
  const occurredAt = clientMoment(input.occurredAt)

  return recordEntry(
    {
      metricId: input.metricId,
      siteId: site.id,
      value: input.value,
      source: 'FIELD_ENTRY',
      occurredAt: occurredAt.toISOString(),
      ...(input.noteAr ? { noteAr: normalizeText(input.noteAr) } : {}),
    },
    principal.auth,
    trace,
    { clientId: input.clientId },
  )
}

// ── الصور ──────────────────────────────────────────────────────────────

export async function signPhotoUpload(
  groupId: string,
  input: dto.SignPhotoBody,
  principal: StaffPrincipal,
) {
  await requireWritableGroup(groupId, principal)

  return signUpload({
    purpose: 'FIELD_PHOTO',
    contentType: input.contentType,
    size: input.size,
  })
}

/** المهمة من ورقة هذه المجموعة؟ موقعها، أو مبادرتها مسندةً إلى قائدها. */
async function requireSheetTask(taskId: string, row: AccessibleGroup) {
  const [task] = await db
    .select({
      id: workItems.id,
      titleAr: workItems.titleAr,
      status: workItems.status,
      siteId: workItems.siteId,
      initiativeId: workItems.initiativeId,
      assigneeUserId: workItems.assigneeUserId,
    })
    .from(workItems)
    .where(eq(workItems.id, taskId))
    .limit(1)

  const inSheet =
    task !== undefined &&
    task.status !== 'CANCELLED' &&
    (task.siteId === row.site.id ||
      (task.initiativeId === row.initiative.id &&
        row.group.leadUserId !== null &&
        task.assigneeUserId === row.group.leadUserId))

  // «ليست من ورقتك» و«غير موجودة» جواب واحد، كما في المجموعات.
  if (!task || !inSheet) throw errors.notFound('المهمة غير موجودة في ورقة المجموعة.')

  return task
}

/**
 * تسجيل صورة بعد رفعها.
 *
 * الرابط يُفحص أنه مما وقّعناه لصور الميدان: النص القادم من المتصفح لا
 * يُسجَّل في المعرض لأنه قال إنه صورة. وصورة فيها أشخاص لا تُقبل بلا موافقتهم
 * — القاعدة تُفرض هنا لا في الواجهة وحدها.
 */
export async function registerPhoto(
  groupId: string,
  input: dto.RegisterPhotoBody,
  principal: StaffPrincipal,
  trace: RequestTrace,
) {
  const row = await requireWritableGroup(groupId, principal)

  const [sent] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.clientId, input.clientId))
    .limit(1)

  if (sent) return serializePhoto(sent)

  if (!ownedKey('FIELD_PHOTO', input.url)) {
    throw errors.unprocessable('الرابط ليس لصورة رُفعت من التطبيق الميداني.')
  }

  if (input.hasPeople && !input.peopleConsent) {
    throw errors.unprocessable(
      'صورة فيها أشخاص تُرفع بعد أخذ موافقتهم، وموافقة وليّ الأمر للأطفال.',
    )
  }

  const task = input.taskId ? await requireSheetTask(input.taskId, row) : null
  const takenAt = clientMoment(input.takenAt)

  try {
    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(attachments)
        .values({
          // نطاق واحد بالضبط: المهمة إن صُوّرت لها، وإلا الموقع.
          ...(task ? { workItemId: task.id } : { siteId: row.site.id }),
          groupId: row.group.id,
          url: input.url,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          takenAt,
          hasPeople: input.hasPeople,
          peopleConsent: input.hasPeople && input.peopleConsent,
          uploadedByUserId: principal.auth.userId,
          clientId: input.clientId,
          ...(input.location
            ? {
                lat: String(input.location.lat),
                lng: String(input.location.lng),
              }
            : {}),
          ...(input.captionAr
            ? { captionAr: normalizeText(input.captionAr) }
            : {}),
        })
        .returning()

      if (!inserted) throw new Error('Failed to register attachment.')

      await recordAudit(
        {
          action: 'field.photo_added',
          actorUserId: principal.auth.userId,
          entityType: 'attachment',
          entityId: inserted.id,
          entityLabel: task?.titleAr ?? row.site.nameAr,
          summaryAr: task
            ? 'صورة من الميدان على مهمة'
            : `صورة من الميدان في ${row.site.nameAr}`,
          metadata: {
            groupId: row.group.id,
            siteId: row.site.id,
            workItemId: task?.id ?? null,
            hasPeople: input.hasPeople,
          },
          ...trace,
        },
        tx,
      )

      return inserted
    })

    return serializePhoto(created)
  } catch (error) {
    if (!isUniqueViolation(error)) throw error

    // الطلب نفسه سبق إلى الفهرس، أو الرابط سُجّل بمعرّف آخر: الصورة مسجَّلة.
    const [existing] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.url, input.url))
      .limit(1)

    if (existing) return serializePhoto(existing)

    throw error
  }
}

// ── المهام ─────────────────────────────────────────────────────────────

/**
 * نقل مهمة من الميدان.
 *
 * `DONE` هنا نيّة القائد «أُنجزت» لا الحالة بعينها: من يعتمد الإنجاز تصير
 * المهمة عنده منجزة، ومن لا يعتمده تذهب إلى المراجعة — وهو ما تقرره
 * بوابة المهام أصلًا. التطبيق لا يعرض فعلًا يُرفض بعد النقر.
 *
 * والنقل إلى ما هي فيه نجاح بلا أثر: النقرة أُعيد إرسالها، أو سبقها
 * المنسّق من اللوحة.
 */
export async function changeTaskStatusFromField(
  taskId: string,
  input: dto.FieldTaskStatusBody,
  principal: StaffPrincipal,
  trace: RequestTrace,
) {
  const row = await requireWritableGroup(input.groupId, principal)
  const task = await requireSheetTask(taskId, row)

  const target =
    input.status === 'DONE' &&
    !principal.auth.capabilities.includes('work.approve')
      ? 'IN_REVIEW'
      : input.status

  const path = transitionPath(task.status, target)

  if (path === null) {
    throw errors.conflict('لا يمكن نقل المهمة إلى هذه الحالة من حالتها الآن.')
  }

  for (const status of path) {
    await changeTaskStatus(
      task.id,
      {
        status,
        ...(status === 'BLOCKED' && input.blockedReasonAr
          ? { blockedReasonAr: input.blockedReasonAr }
          : {}),
      },
      principal.auth,
      trace,
    )
  }

  return loadFieldTask(task.id, row, principal)
}

export async function commentOnTask(
  taskId: string,
  input: dto.FieldTaskCommentBody,
  principal: StaffPrincipal,
  trace: RequestTrace,
) {
  const row = await requireWritableGroup(input.groupId, principal)
  const task = await requireSheetTask(taskId, row)

  // ملاحظة الميدان داخلية دائمًا: إظهارها للشريك قرار من يدير العمل.
  await addComment(
    task.id,
    { bodyAr: input.bodyAr.trim(), isInternal: true },
    principal.auth,
    trace,
    { clientId: input.clientId },
  )

  return loadFieldTask(task.id, row, principal)
}

async function loadFieldTask(
  taskId: string,
  row: AccessibleGroup,
  principal: StaffPrincipal,
) {
  const tasks = await loadSheetTasks(
    {
      siteId: row.site.id,
      initiativeId: row.initiative.id,
      leadUserId: row.group.leadUserId,
    },
    principal,
  )

  const task = tasks.find((candidate) => candidate.id === taskId)

  if (!task) throw errors.notFound('المهمة غير موجودة في ورقة المجموعة.')

  return task
}

// ── الموقع ─────────────────────────────────────────────────────────────

type SiteStatus = (typeof initiativeSites.$inferSelect)['status']

/**
 * ما ينقله القائد من حالات موقعه: بدء العمل، وإغلاقه، وإعادة فتحه إن أُغلق
 * قبل أوانه. الإلغاء قرار المنسّق من اللوحة.
 */
const SITE_TRANSITIONS: Partial<Record<SiteStatus, readonly SiteStatus[]>> = {
  PLANNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['IN_PROGRESS'],
}

const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  PLANNED: 'مخطط',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
}

export async function changeSiteStatus(
  groupId: string,
  input: dto.FieldSiteStatusBody,
  principal: StaffPrincipal,
  trace: RequestTrace,
) {
  const { group, site } = await requireWritableGroup(groupId, principal)

  if (site.status !== input.status) {
    if (!SITE_TRANSITIONS[site.status]?.includes(input.status)) {
      throw errors.conflict(
        `لا يُنقل الموقع من «${SITE_STATUS_LABELS[site.status]}» إلى «${SITE_STATUS_LABELS[input.status]}».`,
      )
    }

    await db.transaction(async (tx) => {
      // مشروطة بالحالة المقروءة: قائدان على الموقع نفسه لا يتجاوز أحدهما الآخر.
      const [moved] = await tx
        .update(initiativeSites)
        .set({ status: input.status })
        .where(
          and(
            eq(initiativeSites.id, site.id),
            eq(initiativeSites.status, site.status),
          ),
        )
        .returning({ id: initiativeSites.id })

      if (!moved) {
        throw errors.conflict('تغيّرت حالة الموقع قبل تنفيذ النقل. حدّث الورقة.')
      }

      await recordAudit(
        {
          action: 'initiative.site_updated',
          severity: input.status === 'COMPLETED' ? 'NOTICE' : 'INFO',
          actorUserId: principal.auth.userId,
          entityType: 'initiative_site',
          entityId: site.id,
          entityLabel: site.nameAr,
          summaryAr: `نقل الموقع من الميدان إلى «${SITE_STATUS_LABELS[input.status]}»`,
          metadata: {
            initiativeId: site.initiativeId,
            groupId: group.id,
            from: site.status,
            to: input.status,
            source: 'field',
          },
          ...trace,
        },
        tx,
      )
    })
  }

  return { siteId: site.id, status: input.status }
}
