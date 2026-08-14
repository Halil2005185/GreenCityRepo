import { env } from '../src/config/env.js'
import { closeDatabaseConnection } from '../src/db/client.js'
import {
  processOutboxBatch,
  requeueStuckJobs,
} from '../src/modules/mail/outbox.service.js'

/**
 * عامل الصادر — عملية مستقلة عن الـAPI.
 *
 * فصلها يعني أن إعادة نشر الـAPI لا توقف الإرسال، وأن بطء المزوّد لا
 * يشغل خيط الطلبات. وفي Compose تُشغَّل كخدمة `worker` مستقلة.
 */

let stopping = false
let cycles = 0

async function tick() {
  // الرسائل العالقة تُفحص كل عشرين دورة لا كل دورة: الفحص نادر الفائدة
  // ويكلّف استعلامًا في كل مرة.
  if (cycles % 20 === 0) {
    await requeueStuckJobs().catch((error) =>
      console.error('[worker:requeue]', error),
    )
  }

  cycles += 1

  const result = await processOutboxBatch()

  if (result.claimed > 0) {
    console.info('[worker:batch]', result)
  }
}

async function loop() {
  console.info(
    `[worker:ready] polling every ${env.OUTBOX_POLL_MS}ms · mail ${
      env.MAIL_ENABLED ? 'enabled' : 'disabled (logging only)'
    }`,
  )

  while (!stopping) {
    try {
      await tick()
    } catch (error) {
      // دورة فاشلة لا تُسقط العامل: الفشل غالبًا عابر، والخروج يوقف كل
      // الرسائل لا الرسالة المعطوبة وحدها.
      console.error('[worker:tick]', error)
    }

    await new Promise((resolve) => setTimeout(resolve, env.OUTBOX_POLL_MS))
  }
}

function shutdown(signal: NodeJS.Signals) {
  console.info(`[worker:shutdown] received ${signal}`)
  stopping = true
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

try {
  await loop()
} finally {
  await closeDatabaseConnection()
  console.info('[worker:stopped]')
}
