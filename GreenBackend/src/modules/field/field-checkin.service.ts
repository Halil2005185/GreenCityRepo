import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { isUniqueViolation } from '../../common/utils/db-errors.js'
import { db } from '../../db/client.js'
import {
  attendance,
  fieldGroupMembers,
  fieldGroups,
} from '../../db/schema/field.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type { ParticipantPrincipal } from './field-auth.js'
import { loadCard } from './field-card.service.js'
import type * as dto from './field.schemas.js'
import {
  assertWritable,
  clientMoment,
  damascusDay,
  loadGroupContext,
} from './field.shared.js'

/**
 * رمز الحضور الذاتي — رقم يتبدّل كل دقيقة، يعرضه هاتف القائد عند نقطة اللقاء
 * ويكتبه المتطوع في بطاقته (أو يمسحه رمزًا مربّعًا يحمله).
 *
 * يُحسب من سرّ المجموعة ومن الوقت وحدهما (HOTP على SHA-256، RFC 4226 و6238)،
 * فهاتف القائد يحسبه بلا شبكة والخادم يتحقق منه بلا أن يخزّن رمزًا.
 *
 * **ما يثبته وما لا يثبته.** يثبت أن صاحبه رأى رقمًا عُرض عند نقطة اللقاء في
 * دقائق بعينها. لا يثبت أنه وقف هناك: رقم يُملى بالهاتف يُكتب من البيت.
 * لذلك يظهر من سجّل نفسه في ورقة القائد بطريقته («سجّل نفسه»)، وللقائد أن
 * يتراجع عن حضور من لا يراه. الحملة تطوّع لا دوام، والرمز يختصر الطابور عند
 * نقطة اللقاء ولا يحرس بابًا.
 */
export const CHECKIN_PERIOD_SECONDS = 60
export const CHECKIN_DIGITS = 6

/**
 * كم دقيقة تُقبل قبل وقت الكتابة وبعده. ساعتا هاتفين لا تتطابقان، والمتطوع
 * يقرأ الرقم ثم يكتبه؛ دقيقتان في كل جهة تسعان ذلك ولا تفتحان الرمز ساعة.
 */
const CHECKIN_WINDOW = 2

const WRONG_CODE =
  'الرمز غير صحيح أو انتهى وقته. اكتب الرمز الظاهر الآن على هاتف قائد مجموعتك.'

/** رمز لمرة واحدة من مفتاح وعدّاد — خوارزمية RFC 4226 على SHA-256. */
export function oneTimeCode(key: Buffer, counter: number, digits: number) {
  const message = Buffer.alloc(8)

  message.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac('sha256', key).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const value = digest.readUInt32BE(offset) & 0x7fffffff

  return String(value % 10 ** digits).padStart(digits, '0')
}

const counterAt = (moment: Date) =>
  Math.floor(moment.getTime() / 1000 / CHECKIN_PERIOD_SECONDS)

export function checkinCode(secret: string, moment: Date, step = 0) {
  return oneTimeCode(
    Buffer.from(secret, 'hex'),
    counterAt(moment) + step,
    CHECKIN_DIGITS,
  )
}

export function matchesCheckinCode(secret: string, code: string, moment: Date) {
  const given = Buffer.from(code)
  let matched = false

  // كل النوافذ تُقارَن، وبمقارنة ثابتة الزمن: لا يُعرف من مدة الجواب أيّها قارب.
  for (let step = -CHECKIN_WINDOW; step <= CHECKIN_WINDOW; step += 1) {
    const expected = Buffer.from(checkinCode(secret, moment, step))

    if (
      expected.length === given.length &&
      timingSafeEqual(expected, given)
    ) {
      matched = true
    }
  }

  return matched
}

/**
 * سرّ المجموعة، ويُولَّد عند أول طلب. الشرط في التحديث يحسم السباق: ورقتان
 * تُفتحان معًا تأخذان السرّ نفسه، لا سرّين يُبطل أحدهما رموز الآخر.
 */
export async function ensureCheckinSecret(group: {
  id: string
  checkinSecret: string | null
}) {
  if (group.checkinSecret) return group.checkinSecret

  await db
    .update(fieldGroups)
    .set({ checkinSecret: randomBytes(20).toString('hex') })
    .where(and(eq(fieldGroups.id, group.id), isNull(fieldGroups.checkinSecret)))

  const [row] = await db
    .select({ checkinSecret: fieldGroups.checkinSecret })
    .from(fieldGroups)
    .where(eq(fieldGroups.id, group.id))
    .limit(1)

  if (!row?.checkinSecret) throw new Error('Failed to create a check-in secret.')

  return row.checkinSecret
}

/**
 * المتطوع يسجّل حضوره بنفسه برمز قائده. يعيد بطاقته وفيها حضوره.
 *
 * آمن التكرار كحضور القائد: `clientId` يعيد ما كُتب، ومن سُجّل حضوره اليوم —
 * بيده أو بيد قائده — يبقى حاضرًا ولا يُكتب له صف ثانٍ.
 */
export async function selfCheckIn(
  principal: ParticipantPrincipal,
  input: dto.SelfCheckinBody,
  trace: RequestTrace,
) {
  const [sent] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(
      and(
        eq(attendance.clientId, input.clientId),
        eq(attendance.participantId, principal.participantId),
      ),
    )
    .limit(1)

  if (sent) return loadCard(principal)

  const context = await loadGroupContext(input.groupId)

  const [member] = context
    ? await db
        .select({ id: fieldGroupMembers.id })
        .from(fieldGroupMembers)
        .where(
          and(
            eq(fieldGroupMembers.groupId, context.group.id),
            eq(fieldGroupMembers.participantId, principal.participantId),
          ),
        )
        .limit(1)
    : []

  // مجموعة غيره، ومجموعة حملة أخرى، ومجموعة لا وجود لها: جواب واحد.
  if (
    !context ||
    !member ||
    context.group.initiativeId !== principal.initiativeId
  ) {
    throw errors.notFound('لست عضوًا في هذه المجموعة.')
  }

  const { group, site } = assertWritable(context)

  const scannedAt = clientMoment(input.scannedAt)

  if (
    !group.checkinSecret ||
    !matchesCheckinCode(group.checkinSecret, input.code, scannedAt)
  ) {
    throw errors.unprocessable(WRONG_CODE, [
      { path: 'code', in: 'body', message: WRONG_CODE },
    ])
  }

  const attendedOn = damascusDay(scannedAt)

  try {
    await db.transaction(async (tx) => {
      const [present] = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(
          and(
            eq(attendance.groupId, group.id),
            eq(attendance.participantId, principal.participantId),
            eq(attendance.attendedOn, attendedOn),
            isNull(attendance.undoneAt),
          ),
        )
        .limit(1)

      if (present) return

      const [created] = await tx
        .insert(attendance)
        .values({
          groupId: group.id,
          participantId: principal.participantId,
          attendedOn,
          checkedInAt: scannedAt,
          checkedInByParticipantId: principal.participantId,
          method: 'SELF',
          clientId: input.clientId,
        })
        .returning({ id: attendance.id })

      if (!created) throw new Error('Failed to record attendance.')

      await recordAudit(
        {
          action: 'field.self_check_in',
          actorType: 'SYSTEM',
          entityType: 'attendance',
          entityId: created.id,
          entityLabel: group.nameAr,
          summaryAr: `تسجيل ذاتي للحضور في ${site.nameAr}`,
          metadata: {
            groupId: group.id,
            participantId: principal.participantId,
            attendedOn,
          },
          ...trace,
        },
        tx,
      )
    })
  } catch (error) {
    // نقرتان متزامنتان سبقت إحداهما إلى الفهرس: هو حاضر، وهذا المطلوب.
    if (!isUniqueViolation(error)) throw error
  }

  return loadCard(principal)
}
