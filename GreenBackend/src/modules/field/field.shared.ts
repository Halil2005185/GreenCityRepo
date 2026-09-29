import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import { fieldGroupMembers, fieldGroups } from '../../db/schema/field.js'
import { areas } from '../../db/schema/geo.js'
import { users } from '../../db/schema/identity.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import type { FieldPrincipal } from './field-auth.js'

export const DAY_MS = 86_400_000

/**
 * ما يُقبل بعد إغلاق المبادرة: ما التُقط في الميدان بلا شبكة يصل حين تعود،
 * وقد يكون المنسّق أغلق الحملة مساء يومها. رفضه يُضيّع ما سُجّل فعلًا.
 */
export const ENTRY_GRACE_DAYS = 14

/** ساعة الهاتف تسبق ساعة الخادم قليلًا أحيانًا؛ أبعد من هذا خطأ لا انحراف. */
const CLOCK_SKEW_MS = 5 * 60_000

export const groupLead = alias(users, 'field_group_lead')

type InitiativeRow = typeof initiatives.$inferSelect

export function acceptsEntries(
  initiative: Pick<InitiativeRow, 'status' | 'completedAt'>,
  now = new Date(),
) {
  if (initiative.status === 'ACTIVE') return true

  return (
    initiative.status === 'COMPLETED' &&
    initiative.completedAt !== null &&
    now.getTime() - initiative.completedAt.getTime() <= ENTRY_GRACE_DAYS * DAY_MS
  )
}

const DAMASCUS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Damascus',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * اليوم بتوقيت دمشق بصيغة `YYYY-MM-DD`. يوم الحضور يوم الموقع لا يوم
 * الخادم: نقرة عند الواحدة فجرًا بتوقيت دمشق ما زالت أمسِ في UTC.
 */
export function damascusDay(moment: Date) {
  return DAMASCUS_DAY.format(moment)
}

/**
 * وقت الحدث كما سجّله الهاتف.
 *
 * يُقبل ما مضى حتى مهلة الاستقبال — ما التُقط بلا شبكة يصل متأخرًا — ولا
 * يُقبل المستقبل: رقم مؤرَّخ بالغد لا يثبته شيء.
 */
export function clientMoment(value: string | undefined, now = new Date()) {
  if (!value) return now

  const moment = new Date(value)

  if (moment.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw errors.unprocessable(
      'وقت التسجيل في المستقبل. تحقّق من ساعة هاتفك وتاريخه.',
    )
  }

  if (now.getTime() - moment.getTime() > ENTRY_GRACE_DAYS * DAY_MS) {
    throw errors.unprocessable(
      `مضى على هذا التسجيل أكثر من ${ENTRY_GRACE_DAYS} يومًا. راجع المنسّق ليُدخله من اللوحة.`,
    )
  }

  // لا يتقدّم وقت الحدث على وقت وصوله، ولو سبقت ساعة الهاتف بدقائق.
  return moment.getTime() > now.getTime() ? now : moment
}

/** المجموعة بمبادرتها وموقعها، بلا سؤال عمّن يطلبها. */
export async function loadGroupContext(groupId: string) {
  const [row] = await db
    .select({
      group: fieldGroups,
      leadNameAr: groupLead.fullNameAr,
      initiative: initiatives,
      site: initiativeSites,
      areaNameAr: areas.nameAr,
    })
    .from(fieldGroups)
    .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .leftJoin(areas, eq(initiativeSites.areaId, areas.id))
    .leftJoin(groupLead, eq(fieldGroups.leadUserId, groupLead.id))
    .where(eq(fieldGroups.id, groupId))
    .limit(1)

  return row ?? null
}

export type AccessibleGroup = NonNullable<
  Awaited<ReturnType<typeof loadGroupContext>>
>

/**
 * مساعد القائد: مشارك برابطه، سمّاه المنسّق مساعدًا في **هذه** المجموعة.
 * عضو عادي فيها لا يفتح ورقتها، ومساعد في غيرها لا يفتح هذه.
 */
async function isAssistant(
  group: AccessibleGroup['group'],
  principal: Extract<FieldPrincipal, { kind: 'PARTICIPANT' }>,
) {
  if (group.initiativeId !== principal.initiativeId) return false

  const [member] = await db
    .select({ id: fieldGroupMembers.id })
    .from(fieldGroupMembers)
    .where(
      and(
        eq(fieldGroupMembers.groupId, group.id),
        eq(fieldGroupMembers.participantId, principal.participantId),
        eq(fieldGroupMembers.role, 'ASSISTANT'),
      ),
    )
    .limit(1)

  return member !== undefined
}

/**
 * المجموعة كما يراها مبدأ بعينه، أو 404.
 *
 * «ليست لك» و«غير موجودة» جواب واحد: قائد يجرّب معرّفات لا يعرف منها أي
 * مجموعات قائمة. وكل مسار ميداني يمرّ من هنا، قراءةً وكتابةً، فلا يبقى
 * مسار نسي أن يسأل «أهي مجموعته؟».
 *
 * ثلاثة يفتحونها: قائدها، ومن يدير الميدان، ومساعد قائدها. المسارات التي
 * لا تجوز للمساعد — الأعداد والمهام والصور — يحرسها `requireFieldStaff`
 * قبل أن تصل إلى هنا.
 */
export async function requireAccessibleGroup(
  groupId: string,
  principal: FieldPrincipal,
) {
  const row = await loadGroupContext(groupId)

  if (!row) throw errors.notFound('المجموعة غير موجودة.')

  const allowed =
    principal.kind === 'STAFF'
      ? principal.auth.capabilities.includes('field.manage') ||
        (principal.auth.capabilities.includes('field.lead') &&
          row.group.leadUserId === principal.userId)
      : await isAssistant(row.group, principal)

  if (!allowed) throw errors.notFound('المجموعة غير موجودة.')

  return row
}

/**
 * من يُنسب إليه ما يُسجَّل: عضو فريق بحسابه، أو مشارك برابطه. عمودان لا عمود
 * واحد: كلٌّ مفتاح إلى جدوله، فلا يبقى حضور منسوبًا إلى معرّف لا يُعرف لمن.
 */
export function recorderOf(principal: FieldPrincipal) {
  return principal.kind === 'STAFF'
    ? { userId: principal.userId, participantId: null }
    : { userId: null, participantId: principal.participantId }
}

/** هل تقبل المجموعة تسجيلًا الآن؟ الرسالة تقول ما يُفعل لا ما فشل. */
export function assertWritable(row: AccessibleGroup) {
  if (!acceptsEntries(row.initiative)) {
    throw errors.conflict(
      row.initiative.status === 'DRAFT' || row.initiative.status === 'PLANNING'
        ? 'لم يبدأ تنفيذ المبادرة بعد، فلا يُسجَّل عليها شيء. راجع المنسّق.'
        : 'أُغلقت المبادرة وانتهت مهلة استقبال ما سُجّل في الميدان. راجع المنسّق.',
    )
  }

  if (row.site.status === 'CANCELLED') {
    throw errors.conflict('أُلغي هذا الموقع، فلا يُسجَّل عليه شيء.')
  }

  return row
}

/**
 * بوابة الكتابة الميدانية: المجموعة له، والمبادرة تقبل تسجيلًا، والموقع
 * قائم.
 */
export async function requireWritableGroup(
  groupId: string,
  principal: FieldPrincipal,
) {
  return assertWritable(await requireAccessibleGroup(groupId, principal))
}
