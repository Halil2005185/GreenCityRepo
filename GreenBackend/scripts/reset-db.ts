import { sql } from 'drizzle-orm'

import { closeDatabaseConnection, db } from '../src/db/client.js'
import { runSeed } from '../src/db/seed.js'

/**
 * يمحو كل بيانات العمل ثم يعيد البذر — لتنظيف مخلفات التطوير.
 *
 * قائمة الجداول تُقرأ من `information_schema` لا مكتوبة يدويًا: القائمة
 * اليدوية تُنسى عند إضافة جدول، فتبقى بيانات قديمة تتسرب وتُربك ما بعدها.
 * وهذا بالضبط ما حدث في مساعِد الاختبارات حين أُضيفت جداول الشركاء.
 */

/** جداول البنية التحتية — لا تحمل بيانات عمل ولا تُمسح. */
const PRESERVED = ['__drizzle_migrations', 'app_metadata']

if (process.env['NODE_ENV'] === 'production') {
  console.error('[reset] refusing to run with NODE_ENV=production.')
  process.exit(1)
}

try {
  const result = await db.execute<{ table_name: string }>(sql`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
     order by table_name
  `)

  const tables = result.rows
    .map((row) => row.table_name)
    .filter((name) => !PRESERVED.includes(name))

  if (tables.length === 0) {
    console.info('[reset] no business tables found — run db:migrate first.')
  } else {
    // `cascade` يتكفل بالترتيب، و`restart identity` يعيد أي تسلسل للبداية.
    const list = sql.raw(tables.map((name) => `"${name}"`).join(', '))

    await db.execute(sql`truncate table ${list} restart identity cascade`)
    console.info(`[reset] truncated ${tables.length} tables`)
  }

  const seeded = await runSeed()

  console.info(`[reset] offices: ${seeded.officeIds.size}`)
  console.info(`[reset] roles: ${seeded.roleIds.size}`)
  console.info(`[reset] admin: ${seeded.admin.email}`)

  if (seeded.admin.generatedPassword) {
    console.info('')
    console.info('  ┌──────────────────────────────────────────────────────┐')
    console.info('  │  كلمة المرور الأولية — تظهر مرة واحدة فقط            │')
    console.info(`  │  ${seeded.admin.generatedPassword.padEnd(52)}│`)
    console.info('  └──────────────────────────────────────────────────────┘')
    console.info('')
  }

  console.info('[reset] done')
} catch (error) {
  console.error('[reset] failed', error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
