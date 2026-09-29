import {
  type SQL,
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'

import { db } from '../../db/client.js'
import {
  attachments,
  attendance,
  fieldGroupMembers,
  fieldGroups,
  participants,
} from '../../db/schema/field.js'
import { areas } from '../../db/schema/geo.js'
import { metricTargets, metrics } from '../../db/schema/metrics.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import { workItems } from '../../db/schema/work.js'
import { loadScopeProgress } from '../impact/impact.service.js'
import { listTasks } from '../work/work.service.js'
import { loadAnnouncements } from './field-announcements.service.js'
import type { StaffPrincipal } from './field-auth.js'
import {
  DAY_MS,
  acceptsEntries,
  damascusDay,
  requireAccessibleGroup,
} from './field.shared.js'

/** مجموعة مضى موعدها بأكثر من هذا لا تُعرض على قائدها: انتهى يومها. */
const HOME_WINDOW_DAYS = 14

/** ما يُعرض من صور المجموعة في ورقة اليوم؛ المعرض كاملًا في اللوحة. */
const SHEET_PHOTOS = 24

/**
 * العدّ باستعلام فرعي لا بوصلة: الوصلة تضرب صف المجموعة بعدد مهام موقعها،
 * والبطاقة تحتاج رقمين لا قائمة. الملغاة خارج العدّين — لا تُعرض في الورقة.
 */
const siteTaskCount = (extra: SQL) =>
  sql<number>`(
    select count(*)::int from ${workItems}
     where ${workItems.siteId} = ${fieldGroups.siteId}
       and ${workItems.status} <> 'CANCELLED'
       ${extra}
  )`

export async function loadHome(principal: StaffPrincipal) {
  const { auth } = principal
  const canLead = auth.capabilities.includes('field.lead')
  const today = damascusDay(new Date())

  /**
   * من لا يحمل `field.lead` لا مجموعات له ولو سُمّي قائدًا قبل أن تُنزع
   * منه القدرة: الاسم في الصف لا يغني عن القدرة، والحراس تفحصها هي.
   */
  const rows = canLead
    ? await db
        .select({
          id: fieldGroups.id,
          nameAr: fieldGroups.nameAr,
          meetsAt: fieldGroups.meetsAt,
          meetingPointAr: fieldGroups.meetingPointAr,
          initiativeId: initiatives.id,
          initiativeNameAr: initiatives.nameAr,
          initiativeStatus: initiatives.status,
          siteId: initiativeSites.id,
          siteNameAr: initiativeSites.nameAr,
          siteStatus: initiativeSites.status,
          areaNameAr: areas.nameAr,
          taskCount: siteTaskCount(sql``).as('task_count'),
          openTaskCount: siteTaskCount(
            sql`and ${workItems.status} <> 'DONE'`,
          ).as('open_task_count'),
          memberCount: sql<number>`(
            select count(*)::int from ${fieldGroupMembers}
             where ${fieldGroupMembers.groupId} = ${fieldGroups.id}
          )`.as('member_count'),
          presentToday: sql<number>`(
            select count(*)::int from ${attendance}
             where ${attendance.groupId} = ${fieldGroups.id}
               and ${attendance.attendedOn} = ${today}
               and ${attendance.undoneAt} is null
          )`.as('present_today'),
        })
        .from(fieldGroups)
        .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
        .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
        .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
        .where(
          and(
            eq(fieldGroups.leadUserId, auth.userId),
            ne(initiatives.status, 'CANCELLED'),
            ne(initiativeSites.status, 'CANCELLED'),
            or(
              isNull(fieldGroups.meetsAt),
              gte(
                fieldGroups.meetsAt,
                new Date(Date.now() - HOME_WINDOW_DAYS * DAY_MS),
              ),
            ),
          ),
        )
        // ASC في Postgres يضع NULL آخرًا: ما لا موعد له ينزل تحت المجدوَل.
        .orderBy(asc(fieldGroups.meetsAt), asc(fieldGroups.nameAr))
        .limit(50)
    : []

  return {
    kind: 'STAFF' as const,
    user: { id: auth.userId, fullNameAr: auth.fullNameAr },
    canLead,
    canManage: auth.capabilities.includes('field.manage'),
    groups: rows.map((row) => ({
      ...row,
      meetsAt: row.meetsAt?.toISOString() ?? null,
    })),
  }
}

/** كل حالات المهمة إلا الملغاة: ما أُلغي ضجيج في الميدان. */
const SHEET_TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
] as const

/**
 * مهام الورقة نوعان: ما عُلّق على الموقع، وما عُلّق على المبادرة وأُسند
 * إلى قائد المجموعة. خطة البرنامج تولّد مهامها على المبادرة لا المواقع،
 * فالاقتصار على الأول يُفرغ ورقة قائد أُسندت إليه مهام الحملة نفسها.
 */
export async function loadSheetTasks(
  scope: { siteId: string; initiativeId: string; leadUserId: string | null },
  principal: StaffPrincipal,
) {
  const statuses = [...SHEET_TASK_STATUSES]

  const [siteTasks, leadTasks] = await Promise.all([
    listTasks({ siteId: scope.siteId, status: statuses }, principal.auth),
    scope.leadUserId
      ? listTasks(
          {
            initiativeId: scope.initiativeId,
            assigneeUserId: scope.leadUserId,
            status: statuses,
          },
          principal.auth,
        )
      : [],
  ])

  const toFieldTask =
    (kind: 'SITE' | 'INITIATIVE') => (task: (typeof siteTasks)[number]) => ({
      id: task.id,
      titleAr: task.titleAr,
      descriptionAr: task.descriptionAr,
      status: task.status,
      priority: task.priority,
      scope: kind,
      milestoneTitleAr: task.milestoneTitleAr,
      dueAt: task.dueAt,
      isOverdue: task.isOverdue,
      blockedReasonAr: task.blockedReasonAr,
      assigneeNameAr: task.assigneeNameAr,
      commentCount: task.commentCount,
    })

  return [
    ...siteTasks.map(toFieldTask('SITE')),
    ...leadTasks.map(toFieldTask('INITIATIVE')),
  ]
}

/**
 * ما يُعدّ في هذا الموقع: مؤشرات أهدافه وما سُجّل فيه، ثم مؤشرات أهداف
 * المبادرة التي لا هدف لها في الموقع.
 *
 * الثانية مقصودة: حملة حدّدت هدفها الكلي ولم توزّعه على مواقعها بعد تبقى
 * ورقة قائدها بلا عدّاد، فلا يجد أين يكتب «40 شجرة» وهو واقف بينها.
 */
async function loadSheetTargets(siteId: string, initiativeId: string) {
  const [progress, campaign] = await Promise.all([
    loadScopeProgress({ kind: 'SITE', id: siteId }),
    db
      .select({
        metricId: metrics.id,
        metricNameAr: metrics.nameAr,
        unitAr: metrics.unitAr,
        decimals: metrics.decimals,
        aggregation: metrics.aggregation,
      })
      .from(metricTargets)
      .innerJoin(metrics, eq(metricTargets.metricId, metrics.id))
      .where(
        and(
          eq(metricTargets.initiativeId, initiativeId),
          eq(metrics.isActive, true),
        ),
      )
      .orderBy(asc(metrics.displayOrder), asc(metrics.nameAr)),
  ])

  const onSite = new Set(progress.map((metric) => metric.metricId))

  return [
    ...progress.map((metric) => ({
      metricId: metric.metricId,
      metricNameAr: metric.metricNameAr,
      unitAr: metric.unitAr,
      decimals: metric.decimals,
      aggregation: metric.aggregation,
      target: metric.target,
      actual: metric.actual,
      unverified: metric.unverified,
    })),
    ...campaign
      .filter((metric) => !onSite.has(metric.metricId))
      .map((metric) => ({
        ...metric,
        target: null,
        actual: 0,
        unverified: 0,
      })),
  ]
}

/**
 * أعضاء المجموعة وحضور كلٍّ منهم في يوم بعينه.
 *
 * الهاتف يخرج هنا لأن من يصل هذه الورقة قائد المجموعة أو المنسّق، وهما من
 * يحتاجانه ليسألا من تأخر. لا يخرج في أي استجابة أخرى من التطبيق.
 */
export async function loadMembers(groupId: string, day: string) {
  const rows = await db
    .select({
      id: fieldGroupMembers.id,
      participantId: participants.id,
      fullNameAr: participants.fullNameAr,
      phone: participants.phone,
      role: fieldGroupMembers.role,
      rsvp: fieldGroupMembers.rsvp,
      attendanceId: attendance.id,
      checkedInAt: attendance.checkedInAt,
      method: attendance.method,
    })
    .from(fieldGroupMembers)
    .innerJoin(
      participants,
      eq(fieldGroupMembers.participantId, participants.id),
    )
    .leftJoin(
      attendance,
      and(
        eq(attendance.groupId, fieldGroupMembers.groupId),
        eq(attendance.participantId, fieldGroupMembers.participantId),
        eq(attendance.attendedOn, day),
        isNull(attendance.undoneAt),
      ),
    )
    .where(eq(fieldGroupMembers.groupId, groupId))
    .orderBy(asc(participants.nameKey), asc(participants.createdAt))

  return rows.map((row) => ({
    id: row.id,
    participantId: row.participantId,
    fullNameAr: row.fullNameAr,
    phone: row.phone,
    role: row.role,
    rsvp: row.rsvp,
    attendance:
      row.attendanceId && row.checkedInAt && row.method
        ? {
            id: row.attendanceId,
            checkedInAt: row.checkedInAt.toISOString(),
            method: row.method,
          }
        : null,
  }))
}

export function serializePhoto(row: typeof attachments.$inferSelect) {
  return {
    id: row.id,
    url: row.url,
    workItemId: row.workItemId,
    takenAt: row.takenAt?.toISOString() ?? null,
    captionAr: row.captionAr,
    hasPeople: row.hasPeople,
    createdAt: row.createdAt.toISOString(),
  }
}

async function loadGroupPhotos(groupId: string) {
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(attachments)
      .where(eq(attachments.groupId, groupId))
      .orderBy(desc(attachments.createdAt))
      .limit(SHEET_PHOTOS),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(attachments)
      .where(eq(attachments.groupId, groupId)),
  ])

  return { photos: rows.map(serializePhoto), photoCount: total?.count ?? 0 }
}

/**
 * ورقة يوم المجموعة في نداء واحد: تُجلب مرة عند الفتح وتُقرأ بعدها من
 * الجهاز. كل ما تحتاجه تبويبات التطبيق هنا، فلا تبويب ينتظر الشبكة.
 */
export async function loadSheet(groupId: string, principal: StaffPrincipal) {
  const { group, leadNameAr, initiative, site, areaNameAr } =
    await requireAccessibleGroup(groupId, principal)

  const day = damascusDay(new Date())

  const [tasks, targets, members, gallery, announcements] = await Promise.all([
    loadSheetTasks(
      {
        siteId: site.id,
        initiativeId: initiative.id,
        leadUserId: group.leadUserId,
      },
      principal,
    ),
    loadSheetTargets(site.id, initiative.id),
    loadMembers(group.id, day),
    loadGroupPhotos(group.id),
    loadAnnouncements({
      initiativeId: initiative.id,
      groupIds: [group.id],
      reader: 'LEADS',
    }),
  ])

  return {
    group: {
      id: group.id,
      nameAr: group.nameAr,
      meetsAt: group.meetsAt?.toISOString() ?? null,
      meetingPointAr: group.meetingPointAr,
      instructionsAr: group.instructionsAr,
      leadUserId: group.leadUserId,
      leadNameAr,
    },
    initiative: {
      id: initiative.id,
      nameAr: initiative.nameAr,
      status: initiative.status,
      acceptsEntries: acceptsEntries(initiative),
    },
    site: {
      id: site.id,
      nameAr: site.nameAr,
      descriptionAr: site.descriptionAr,
      status: site.status,
      areaNameAr,
      lat: site.lat === null ? null : Number(site.lat),
      lng: site.lng === null ? null : Number(site.lng),
    },
    day,
    permissions: {
      /**
       * من يعتمد الإنجاز ينهي المهمة، ومن لا يعتمده يرسلها للاعتماد.
       * التطبيق يعرض الفعل الذي سيقع فعلًا، لا فعلًا يُرفض بعد النقر.
       */
      canApproveTasks: principal.auth.capabilities.includes('work.approve'),
    },
    announcements,
    tasks,
    targets,
    members,
    ...gallery,
    generatedAt: new Date().toISOString(),
  }
}
