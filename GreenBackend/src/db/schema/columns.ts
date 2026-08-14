import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Drizzle يستنتج عمود `uuid` كنوع قالبي `${string}-${string}-...`، فلا
 * يقبل أي `string` عادي قادم من مسار أو خدمة دون تأكيد نوع في كل مرة.
 *
 * التحقق من صحة الـUUID مسؤولية طبقة Zod على الحدود، لا نظام الأنواع
 * داخل الخدمات، لذلك نثبّت النوع على `string` هنا مرة واحدة.
 */
export function uuidColumn(name: string) {
  return uuid(name).$type<string>()
}

/**
 * كل الطوابع الزمنية تُحفظ UTC مع المنطقة الزمنية، وتُعرض بتوقيت Asia/Damascus
 * في طبقة العرض وحدها. لا يُحفظ وقت محلي في القاعدة إطلاقًا.
 */
export function tsColumn(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' })
}

export const timestamps = {
  createdAt: tsColumn('created_at').defaultNow().notNull(),
  updatedAt: tsColumn('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}

/** الجداول الإضافية فقط (سجل التدقيق، الأحداث) لا تحمل `updated_at` لأنها لا تُعدَّل. */
export const createdAtOnly = {
  createdAt: tsColumn('created_at').defaultNow().notNull(),
}
