import { jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

/**
 * Small infrastructure table for application-level metadata such as the
 * installed data version. Business tables should live in their own module
 * schema files and be exported from schema/index.ts.
 */
export const appMetadata = pgTable('app_metadata', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
})

export type AppMetadata = typeof appMetadata.$inferSelect
export type NewAppMetadata = typeof appMetadata.$inferInsert
