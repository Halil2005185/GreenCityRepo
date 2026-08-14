import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { openApiJson } from '../src/openapi/openapi.service.js'

/**
 * يكتب العقد على القرص ليولّد كل تطبيق واجهة عميله منه.
 *
 * لا تُشارك ملفات TypeScript بين التطبيقات: المشاركة الوحيدة هي هذا
 * الملف، فيبقى كل تطبيق قابلًا للبناء وحده.
 */
const outputPath = resolve(process.argv[2] ?? 'openapi.json')

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${openApiJson()}\n`, 'utf8')

console.info(`[openapi] wrote ${outputPath}`)
