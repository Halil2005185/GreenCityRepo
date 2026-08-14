import 'dotenv/config'

import { defineConfig } from 'drizzle-kit'

/**
 * أوامر الترحيل تستخدم الرابط المباشر حين يتوفر.
 *
 * مزودو PostgreSQL المُدارون (Neon مثلًا) يقدّمون نقطتين: مُجمَّعة عبر
 * PgBouncer للتطبيق، ومباشرة للأدوات. تشغيل DDL عبر المُجمَّعة يعمل
 * أحيانًا ويفشل أحيانًا حسب وضع التجميع، فالمباشر هو الصحيح هنا.
 * محليًا لا فرق: يبقى `DATABASE_URL` وحده.
 */
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env first.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
          }
        : false,
  },
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public',
  },
  /** يمنع حذف جدول أو عمود دون تأكيد صريح أثناء التوليد. */
  strict: true,
  verbose: true,
})
