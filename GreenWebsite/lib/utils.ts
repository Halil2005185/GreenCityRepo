import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * يدمج أصناف Tailwind ويحسم التعارض لصالح الأخير، فيمكن لمكوّن أن يقبل
 * `className` يتجاوز تنسيقه الافتراضي دون معارك خصوصية في CSS.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * تأخير ظهور عنصر داخل `RevealGroup`، يُستعمل هكذا:
 * `<li className="reveal" style={revealDelay(index)}>`
 *
 * هنا لا في `reveal.tsx` رغم أنه مكانها المنطقي: ذاك الملف `"use client"`،
 * وكل ما يُصدَّر منه يصير مرجعًا إلى العميل لا دالةً تُستدعى على الخادم —
 * والصفحات التي تستعملها مكوّنات خادم.
 *
 * السقف 240ms: العنصر الثامن في شبكة يجب ألا ينتظر ثانيتين.
 */
export function revealDelay(index: number, step = 60): React.CSSProperties {
  return { "--reveal-delay": `${Math.min(index * step, 240)}ms` } as React.CSSProperties;
}

/**
 * كل التواريخ تُحفظ UTC وتُعرض بتوقيت دمشق. التنسيق هنا لا في الخادم،
 * حتى يبقى الوقت المخزَّن واحدًا ويتغير العرض وحده.
 */
const TIME_ZONE = "Asia/Damascus";

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("ar-SY", {
    dateStyle: "long",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/**
 * الأرقام بالخانات اللاتينية لا العربية الشرقية: الرقم المعلن يُقتبس
 * ويُنسخ إلى تقارير وجداول، فيبقى قابلًا للقراءة الآلية.
 */
export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
