import { closeDatabaseConnection } from '../src/db/client.js'
import { runSeed } from '../src/db/seed.js'

try {
  console.info('[seed] starting')

  const result = await runSeed()

  console.info(`[seed] offices: ${result.officeIds.size}`)
  console.info(`[seed] roles: ${result.roleIds.size}`)

  if (result.admin.generatedPassword) {
    console.info(`[seed] root admin created: ${result.admin.email}`)
    console.info('')
    console.info('  ┌──────────────────────────────────────────────────────┐')
    console.info('  │  كلمة المرور الأولية — تظهر مرة واحدة فقط            │')
    console.info(`  │  ${result.admin.generatedPassword.padEnd(52)}│`)
    console.info('  │  غيّرها بعد أول تسجيل دخول.                          │')
    console.info('  └──────────────────────────────────────────────────────┘')
    console.info('')
  } else {
    console.info(
      `[seed] root admin ready: ${result.admin.email} (كلمة المرور لم تُمَس)`,
    )
  }

  console.info('[seed] done')
} catch (error) {
  console.error('[seed] failed', error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
