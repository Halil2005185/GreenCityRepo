import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, uuidColumn } from './columns.js'
import { actorType, auditSeverity } from './enums.js'
import { users } from './identity.js'

/**
 * سجل تدقيق إضافي فقط: لا UPDATE ولا DELETE. التصحيح حدث جديد لا تعديل صف.
 * منع التعديل يُفرض بصلاحيات القاعدة عند النشر، لا بالكود وحده.
 *
 * `partnerVisible` يحدد ما يظهر للشريك في «سجل نشاطه». الافتراضي مخفي:
 * أي حدث لا يُعلَن صراحةً أنه مرئي يبقى داخليًا، حتى لا يسرّب سهوٌ برمجي
 * ملاحظات إيفا الداخلية إلى بوابة الشريك.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),

    actorType: actorType('actor_type').default('USER').notNull(),
    actorUserId: uuidColumn('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** معرّف نقطي مثل `auth.login` أو `invitation.accepted`. */
    action: varchar('action', { length: 100 }).notNull(),
    severity: auditSeverity('severity').default('INFO').notNull(),

    entityType: varchar('entity_type', { length: 64 }),
    entityId: uuidColumn('entity_id'),
    /** وصف الكيان وقت الحدث، ليبقى السجل مقروءًا بعد تغيّر الكيان أو حذفه. */
    entityLabel: varchar('entity_label', { length: 200 }),

    summaryAr: text('summary_ar'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),

    partnerVisible: boolean('partner_visible').default(false).notNull(),

    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 400 }),
    requestId: varchar('request_id', { length: 128 }),

    ...createdAtOnly,
  },
  (table) => [
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_action_idx').on(table.action, table.createdAt),
    index('audit_logs_created_idx').on(table.createdAt),
  ],
)

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
