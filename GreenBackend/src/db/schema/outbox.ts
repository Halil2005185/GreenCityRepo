import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'

import { timestamps, tsColumn, uuidColumn } from './columns.js'
import { outboxStatus } from './enums.js'

/**
 * صندوق الصادر — رسالة تُدرج في المعاملة نفسها التي أنتجتها.
 *
 * السبب أن الإرسال المباشر بعد الكتابة يخسر الرسالة عند أي انهيار بين
 * الاثنين: تُنشأ الدعوة ولا يصل بريدها، ولا أثر يدل على ذلك. الإدراج
 * داخل المعاملة يجعل الحدث والرسالة يقعان معًا أو لا يقعان.
 *
 * ولا يحتاج هذا وسيطًا خارجيًا: القاعدة نفسها طابور كافٍ عند هذا الحجم،
 * و`for update skip locked` يمنع عاملين من التقاط الرسالة ذاتها.
 */
export const outboxJobs = pgTable(
  'outbox_jobs',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),

    /** مفتاح القالب — يُصيَّر وقت الإرسال لا وقت الإدراج. */
    templateKey: text('template_key').notNull(),
    recipient: text('recipient').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),

    status: outboxStatus('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    /**
     * موعد الأهلية للالتقاط. التأجيل بعد الفشل يُكتب هنا، فتكفي فهرسة
     * واحدة لاختيار ما هو جاهز الآن دون حساب في الكود.
     */
    availableAt: tsColumn('available_at').defaultNow().notNull(),

    lastError: text('last_error'),
    sentAt: tsColumn('sent_at'),
    /** معرّف المزوّد بعد الإرسال — يربط سطرنا بسجلّه عند التقصّي. */
    providerMessageId: text('provider_message_id'),

    ...timestamps,
  },
  (table) => [
    // فهرس الالتقاط: الحالة والموعد معًا، فالعامل يسأل عنهما دائمًا.
    index('outbox_jobs_claim_idx').on(table.status, table.availableAt),
    index('outbox_jobs_recipient_idx').on(table.recipient),
    check(
      'outbox_jobs_sent_consistency',
      sql`(${table.status} = 'SENT') = (${table.sentAt} is not null)`,
    ),
  ],
)

export type OutboxJob = typeof outboxJobs.$inferSelect
export type NewOutboxJob = typeof outboxJobs.$inferInsert
