import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { z } from './zod.js'

/**
 * سجل واحد لكل الوحدات. كل وحدة تسجّل مساراتها في ملف `*.schemas.ts`
 * الخاص بها، ثم يُبنى المستند كاملًا في `openapi.service.ts`.
 *
 * العقد يُولَّد من مخططات Zod نفسها التي تتحقق من الطلبات وقت التشغيل،
 * فلا ينفصل التوثيق عن السلوك — وهو سبب اختيار Zod مصدرًا وحيدًا.
 */
export const registry = new OpenAPIRegistry()

export const bearerAuth = registry.registerComponent(
  'securitySchemes',
  'bearerAuth',
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'رمز الوصول قصير العمر. يُحفظ في ذاكرة التطبيق لا في التخزين المحلي.',
  },
)

/**
 * شكل الخطأ الموحّد. يطابق ما يبنيه `errorHandler` فعليًا، ويتبع RFC 7807
 * حتى تتعامل الواجهة مع كل الأخطاء بمعالج واحد.
 */
export const problemSchema = registry.register(
  'Problem',
  z
    .object({
      type: z.string(),
      title: z.string(),
      status: z.number().int(),
      detail: z.string(),
      instance: z.string(),
      requestId: z.string(),
      details: z.unknown().optional(),
    })
    .openapi({ description: 'استجابة خطأ بصيغة application/problem+json' }),
)

/** استجابات الأخطاء الشائعة، لتفادي تكرارها في كل مسار. */
export const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: problemSchema } },
})
