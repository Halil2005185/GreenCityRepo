import { z } from "zod";

/**
 * نمط أرقام الهواتف الموحد: يقبل البادئة الدولية الاختيارية +،
 * والأرقام والمسافات والشرطات، بطول بين 6 و 32 محرفًا.
 */
export const PHONE_PATTERN = /^[+]?[\d\s()-]{6,32}$/;

/** التحقق من رقم الهاتف مع اقتطاع المسافات الزائدة */
export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_PATTERN, "صيغة رقم الهاتف غير صحيحة.");

/** التحقق من البريد الإلكتروني */
export const emailSchema = z
  .string()
  .trim()
  .email("صيغة البريد الإلكتروني غير صحيحة.")
  .max(254, "البريد الإلكتروني طويل جدًا.");

/**
 * تحويل آمن للتاريخ إلى ISO String دون رمي استثناءات RangeError في حال كان الإدخال غير صالح.
 */
export function safeToIsoString(
  dateInput: string | null | undefined,
): string | undefined {
  if (!dateInput || !dateInput.trim()) return undefined;
  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** فحص صحة التاريخ إن وُجد */
export const optionalDateSchema = z
  .string()
  .optional()
  .refine(
    (val) => {
      if (!val || !val.trim()) return true;
      const parsed = new Date(val);
      return !isNaN(parsed.getTime());
    },
    { message: "التاريخ المُدخل غير صالح." },
  );

/** نص مطلوب بعد إزالة الفراغات مع حدود أدنى وأقصى */
export function requiredTrimmedString(fieldName: string, min = 1, max = 255) {
  return z
    .string()
    .trim()
    .min(min, min === 1 ? `${fieldName} مطلوب.` : `${fieldName} يجب ألا يقل عن ${min} أحرف.`)
    .max(max, `${fieldName} يجب ألا يتجاوز ${max} حرفًا.`);
}
