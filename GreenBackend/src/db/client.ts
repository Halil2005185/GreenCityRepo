import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { env } from '../config/env.js'

const ssl = env.DATABASE_SSL
  ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED }
  : undefined

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: 30_000,
  allowExitOnIdle: env.NODE_ENV === 'test',
  ssl,
})

pool.on('error', (error) => {
  console.error('[database:pool]', error)
})

export const db = drizzle({ client: pool })

export async function checkDatabaseConnection() {
  const startedAt = performance.now()
  const result = await db.execute<{ databaseTime: Date }>(
    sql`select now() as "databaseTime"`,
  )

  return {
    databaseTime: result.rows[0]?.databaseTime ?? null,
    latencyMs: Math.round(performance.now() - startedAt),
  }
}

export async function closeDatabaseConnection() {
  await pool.end()
}
