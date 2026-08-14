import { closeDatabaseConnection } from '../src/db/client.js'
import {
  processOutboxBatch,
  requeueStuckJobs,
} from '../src/modules/mail/outbox.service.js'

/** تشغيلة واحدة — للاختبار اليدوي وللتحقق بعد النشر دون إبقاء عملية. */
try {
  await requeueStuckJobs()
  console.info('[outbox]', await processOutboxBatch())
} finally {
  await closeDatabaseConnection()
}
