import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

/**
 * يجب أن يُنفَّذ التوسيع مرة واحدة قبل تعريف أي مخطط يستعمل `.openapi()`.
 *
 * لذلك تستورد كل ملفات المخططات `z` من هنا لا من `zod` مباشرة: الاستيراد
 * نفسه هو ما يضمن ترتيب التنفيذ، فلا يعتمد الأمر على من استورد أولًا.
 */
extendZodWithOpenApi(z)

export { z }
