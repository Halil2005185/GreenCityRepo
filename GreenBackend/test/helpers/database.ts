import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

import { db, pool } from '../../src/db/client.js'

let readiness: Promise<boolean> | null = null

/**
 * حارس لا يُتجاوز: الاختبارات تُفرّغ كل الجداول، وخطأ في متغير بيئة
 * واحد يكفي لتوجيهها إلى قاعدة التطوير أو الإنتاج.
 *
 * الشرط على اسم القاعدة لا على المضيف: قاعدة الاختبار قد تكون على
 * الخادم نفسه الذي يحمل قاعدة التطوير — كما هي الحال مع Neon — فالمضيف
 * لا يميّز شيئًا، والاسم يميّز.
 */
function assertTestDatabase() {
  const url = process.env.DATABASE_URL

  if (!url) throw new Error('DATABASE_URL is not set for the test run.')

  const name = new URL(url).pathname.replace(/^\//, '')

  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run destructive tests against database "${name}". ` +
        'The test database name must end with "_test". ' +
        'Set TEST_DATABASE_URL to a dedicated database.',
    )
  }
}

/**
 * تتصل بقاعدة الاختبار وتطبّق الترحيلات مرة واحدة لكل تشغيل.
 *
 * تعيد `false` بدل الانهيار عندما تكون القاعدة غير متاحة، فتُتخطّى
 * اختبارات التكامل بتحذير ظاهر بدل أن يفشل التشغيل كله على جهاز لم
 * تُهيّأ قاعدته بعد. تحذير مرتفع الصوت مقصود: تخطي اختبارات أمنية
 * بصمت أسوأ من فشلها.
 */
export function ensureTestDatabase(): Promise<boolean> {
  readiness ??= (async () => {
    // خارج `try` عمدًا: توجيه الاختبارات إلى قاعدة غير مخصصة خطأ إعداد
    // يجب أن يصرخ، لا أن يتحول إلى «تخطٍّ» صامت يبدو نجاحًا.
    assertTestDatabase()

    try {
      await pool.query('select 1')
      await migrate(db, { migrationsFolder: './drizzle' })

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      console.warn(
        [
          '',
          '  ⚠️  اختبارات التكامل مُتخطّاة — تعذّر الاتصال بقاعدة الاختبار.',
          `     ${message}`,
          '     هيّئ القاعدة ثم أعد التشغيل:',
          '       CREATE DATABASE greencities_test OWNER greencities_app;',
          '     واضبط DATABASE_URL في ملف .env أو في بيئة التشغيل.',
          '',
        ].join('\n'),
      )

      return false
    }
  })()

  return readiness
}

/** جداول البنية التحتية — لا تحمل بيانات عمل ولا تُفرَّغ. */
const PRESERVED = ['__drizzle_migrations', 'app_metadata']

let cachedTableList: string | null = null

/**
 * تُفرَّغ كل جداول العمل، وقائمتها تُقرأ من `information_schema` لا مكتوبة يدويًا.
 *
 * القائمة اليدوية سبق أن أغفلت جداول الشركاء السبعة عند إضافتها، فتسربت
 * بيانات كل اختبار إلى ما بعده. الاشتقاق يجعل أي جدول جديد يدخل التنظيف
 * تلقائيًا بدل انتظار من يتذكّره.
 */
export async function resetDatabase() {
  assertTestDatabase()

  if (!cachedTableList) {
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
      throw new Error('No business tables found — run db:migrate first.')
    }

    cachedTableList = tables.map((name) => `"${name}"`).join(', ')
  }

  await db.execute(
    sql`truncate table ${sql.raw(cachedTableList)} restart identity cascade`,
  )
}

export async function closeTestDatabase() {
  await pool.end()
}
