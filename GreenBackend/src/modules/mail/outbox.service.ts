import { and, eq, inArray, lte, sql } from 'drizzle-orm'

import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import { outboxJobs } from '../../db/schema/outbox.js'
import { sendEmail } from './resend.client.js'
import { type TemplateKey, isTemplateKey, renderTemplate } from './templates.js'

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * يُستدعى داخل معاملة العملية التي أنتجت الرسالة.
 *
 * تمرير `tx` ليس اختياريًا في الممارسة: إدراج خارج المعاملة يعيد المشكلة
 * التي وُجد الصندوق لحلّها — رسالة تُرسل لدعوة تراجعت، أو دعوة بلا رسالة.
 */
export async function enqueueEmail(
  tx: Executor,
  input: {
    templateKey: TemplateKey
    recipient: string
    payload: Record<string, unknown>
  },
) {
  await tx.insert(outboxJobs).values({
    templateKey: input.templateKey,
    recipient: input.recipient,
    payload: input.payload,
  })
}

/** تأجيل أُسّي: 1د، 2د، 4د… يمنح المزوّد وقتًا للتعافي دون طرق متواصل. */
function backoffMinutes(attempts: number) {
  return Math.min(2 ** (attempts - 1), 60)
}

export type OutboxRunResult = {
  claimed: number
  sent: number
  failed: number
  retried: number
}

/**
 * يلتقط دفعة ويرسلها.
 *
 * `for update skip locked` هو ما يسمح بتشغيل أكثر من عامل دون تنسيق
 * بينهما: كلٌّ يتخطّى ما التقطه غيره بدل أن ينتظره.
 */
export async function processOutboxBatch(): Promise<OutboxRunResult> {
  const now = new Date()

  const claimed = await db.transaction(async (tx) => {
    const ready = await tx
      .select({ id: outboxJobs.id })
      .from(outboxJobs)
      .where(
        and(
          eq(outboxJobs.status, 'PENDING'),
          lte(outboxJobs.availableAt, now),
        ),
      )
      .orderBy(outboxJobs.availableAt)
      .limit(env.OUTBOX_BATCH_SIZE)
      .for('update', { skipLocked: true })

    if (ready.length === 0) return []

    const ids = ready.map((row) => row.id)

    return tx
      .update(outboxJobs)
      .set({ status: 'SENDING', attempts: sql`${outboxJobs.attempts} + 1` })
      .where(inArray(outboxJobs.id, ids))
      .returning()
  })

  const result: OutboxRunResult = {
    claimed: claimed.length,
    sent: 0,
    failed: 0,
    retried: 0,
  }

  for (const job of claimed) {
    try {
      if (!isTemplateKey(job.templateKey)) {
        throw new Error(`Unknown template "${job.templateKey}".`)
      }

      const rendered = renderTemplate(job.templateKey, job.payload)

      const { id } = await sendEmail({
        to: job.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })

      await db
        .update(outboxJobs)
        .set({
          status: 'SENT',
          sentAt: new Date(),
          lastError: null,
          ...(id ? { providerMessageId: id } : {}),
        })
        .where(eq(outboxJobs.id, job.id))

      result.sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const exhausted = job.attempts >= env.OUTBOX_MAX_ATTEMPTS

      await db
        .update(outboxJobs)
        .set({
          // المستنفَد يبقى `FAILED` ظاهرًا لا محذوفًا: رسالة لم تصل خبرٌ
          // يحتاجه أحد، ومحوها يجعل الصمت يبدو نجاحًا.
          status: exhausted ? 'FAILED' : 'PENDING',
          lastError: message.slice(0, 2000),
          availableAt: exhausted
            ? new Date()
            : new Date(Date.now() + backoffMinutes(job.attempts) * 60_000),
        })
        .where(eq(outboxJobs.id, job.id))

      if (exhausted) {
        result.failed += 1
        console.error('[outbox:failed]', { id: job.id, to: job.recipient, message })
      } else {
        result.retried += 1
        console.warn('[outbox:retry]', {
          id: job.id,
          attempt: job.attempts,
          message,
        })
      }
    }
  }

  return result
}

/**
 * يعيد الرسائل التي عَلِقت في `SENDING` لأن العامل انهار وهي بيده.
 *
 * بدونها تبقى معلّقة إلى الأبد: لا هي معلّقة تُلتقط، ولا هي فاشلة تُرى.
 */
export async function requeueStuckJobs(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)

  const requeued = await db
    .update(outboxJobs)
    .set({ status: 'PENDING', availableAt: new Date() })
    .where(and(eq(outboxJobs.status, 'SENDING'), lte(outboxJobs.updatedAt, cutoff)))
    .returning({ id: outboxJobs.id })

  if (requeued.length > 0) {
    console.warn('[outbox:requeued-stuck]', requeued.length)
  }

  return requeued.length
}
