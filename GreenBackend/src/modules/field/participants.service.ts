import { and, eq, isNull } from 'drizzle-orm'

import {
  nameKey,
  normalizeEmail,
  normalizeText,
  phoneKey,
} from '../../common/utils/text.js'
import type { db } from '../../db/client.js'
import { fieldGroupMembers, participants } from '../../db/schema/field.js'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ParticipantInput = {
  fullNameAr: string
  phone?: string | null | undefined
  email?: string | null | undefined
  sourceSubmissionId?: string | null | undefined
}

type Match = typeof participants.$inferSelect

/**
 * هل هذا الشخص مسجَّل من قبل؟
 *
 * الترتيب من الأوثق إلى الأضعف:
 * 1. الطلب نفسه: تحويله مرة ثانية يعيد مشاركه.
 * 2. الاسم مع الهاتف، ثم الاسم مع البريد. الهاتف وحده لا يكفي — أخوان
 *    بهاتف أبيهما شخصان — والاسم وحده لا يكفي، فالأسماء تتكرر.
 * 3. بلا هاتف ولا بريد: الاسم داخل المجموعة نفسها وحدها. قائمة كُتبت باليد
 *    وأُضيفت مرتين لا تتضاعف، و«أحمد» في مجموعة أخرى شخص آخر.
 */
async function findMatch(
  tx: Transaction,
  input: { key: string; phone: string | null; email: string | null },
  sourceSubmissionId: string | null,
  groupId: string | null,
): Promise<Match | null> {
  if (sourceSubmissionId) {
    const [bySubmission] = await tx
      .select()
      .from(participants)
      .where(eq(participants.sourceSubmissionId, sourceSubmissionId))
      .limit(1)

    if (bySubmission) return bySubmission
  }

  if (input.phone) {
    const [byPhone] = await tx
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.phoneKey, input.phone),
          eq(participants.nameKey, input.key),
        ),
      )
      .limit(1)

    if (byPhone) return byPhone
  }

  if (input.email) {
    const [byEmail] = await tx
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.email, input.email),
          eq(participants.nameKey, input.key),
        ),
      )
      .limit(1)

    if (byEmail) return byEmail
  }

  if (!input.phone && !input.email && groupId) {
    const [inGroup] = await tx
      .select({ participant: participants })
      .from(fieldGroupMembers)
      .innerJoin(
        participants,
        eq(fieldGroupMembers.participantId, participants.id),
      )
      .where(
        and(
          eq(fieldGroupMembers.groupId, groupId),
          eq(participants.nameKey, input.key),
          isNull(participants.phoneKey),
          isNull(participants.email),
        ),
      )
      .limit(1)

    if (inGroup) return inGroup.participant
  }

  return null
}

/**
 * المشارك القائم إن وُجد، وإلا صف جديد.
 *
 * من وُجد يُكمَل ما نقصه ولا يُستبدل ما عنده: هاتف كتبه المنسّق بيده أوثق
 * من هاتف في استمارة قديمة، فالفارغ وحده يُملأ.
 */
export async function resolveParticipant(
  tx: Transaction,
  input: ParticipantInput,
  options: { actorUserId: string; groupId?: string | null },
): Promise<{ id: string; created: boolean }> {
  const fullNameAr = normalizeText(input.fullNameAr)
  const phone = input.phone?.trim() || null
  const email = input.email ? normalizeEmail(input.email) : null
  const keys = { key: nameKey(fullNameAr), phone: phoneKey(phone), email }
  const sourceSubmissionId = input.sourceSubmissionId ?? null

  const match = await findMatch(
    tx,
    keys,
    sourceSubmissionId,
    options.groupId ?? null,
  )

  if (match) {
    const missing = {
      ...(!match.phone && phone ? { phone, phoneKey: keys.phone } : {}),
      ...(!match.email && email ? { email } : {}),
      ...(!match.sourceSubmissionId && sourceSubmissionId
        ? { sourceSubmissionId }
        : {}),
    }

    if (Object.keys(missing).length > 0) {
      await tx
        .update(participants)
        .set(missing)
        .where(eq(participants.id, match.id))
    }

    return { id: match.id, created: false }
  }

  const [created] = await tx
    .insert(participants)
    .values({
      fullNameAr,
      nameKey: keys.key,
      phone,
      phoneKey: keys.phone,
      email,
      sourceSubmissionId,
      createdById: options.actorUserId,
    })
    .returning({ id: participants.id })

  if (!created) throw new Error('Failed to create participant.')

  return { id: created.id, created: true }
}
