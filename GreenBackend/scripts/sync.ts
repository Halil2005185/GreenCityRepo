import { closeDatabaseConnection } from '../src/db/client.js'
import { syncSystemData } from '../src/db/seed.js'

/**
 * مزامنة ما يملكه الكود بعد الترحيل — تشغّلها صورة `migrate` في كل نشر.
 *
 * بخلاف `seed.ts` لا تُنشئ حسابًا ولا تطبع سرًّا، فمخرجها آمن في سجل
 * الحاوية وفي سجل GitHub Actions. حساب المدير الأول يبقى `db:seed` يدويًا.
 */
try {
  console.info('[sync] starting')

  const result = await syncSystemData()

  console.info(`[sync] offices: ${result.officeIds.size}`)
  console.info(`[sync] roles: ${result.roleIds.size}`)
  console.info(`[sync] programs: ${result.reference.programIds.size}`)
  console.info(`[sync] metrics: ${result.reference.metricIds.size}`)
  console.info(`[sync] lookup values: ${result.reference.lookupValueIds.size}`)
  console.info('[sync] done')
} catch (error) {
  console.error('[sync] failed', error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
