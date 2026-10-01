import { registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

/**
 * قيمة من تعريفات النظام كما تظهر على سجل: جهة، إعلامي، إقرار، نقطة خضراء.
 *
 * ملف مستقل عن `lookups.schemas.ts` لأن وحدات الشركاء والإعلام والمبادرات
 * تستورده: لو استوردت ملف المسارات لسُجّلت مسارات التعريفات في العقد قبل
 * مسارات تلك الوحدات، فتبدّل ترتيب العقد كله مع كل تعديل.
 *
 * `isActive` يُعاد مع الاسم: قيمة عُطّلت بعد أن صُنّف بها السجل تبقى ظاهرة
 * عليه، والواجهة تعلّمها «معطّلة» بدل أن تختفي أو تظهر كأنها سارية.
 */
const shape = {
  id: z.uuid(),
  code: z.string(),
  nameAr: z.string(),
  isActive: z.boolean(),
}

export const lookupRefSchema = registry.register('LookupRef', z.object(shape))

/**
 * القيمة الاختيارية على سجل: أفق العلاقة، نوعها، منفّذ النقطة الخضراء.
 *
 * مضمَّنة لا مرجعًا إلى `LookupRef`: `lookupRefSchema.nullable()` يُكتب في
 * العقد `allOf` مع `null`، فيولّد منه openapi-typescript نوعًا لا يقبل `null`
 * أصلًا، وتمرّ في الواجهة شروط «إن وُجدت» دون أن يرى المترجم أنها قد تغيب.
 */
export const optionalLookupRefSchema = z.object(shape).nullable()

export type LookupRef = z.infer<typeof lookupRefSchema>
