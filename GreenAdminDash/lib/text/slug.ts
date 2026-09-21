const LATIN: Record<string, string> = {
  ا: "a", أ: "a", إ: "i", آ: "a", ى: "a", ب: "b", ت: "t", ث: "th", ج: "j",
  ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s",
  ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l",
  م: "m", ن: "n", ه: "h", ة: "a", و: "w", ؤ: "u", ي: "y", ئ: "y",
};

/**
 * يكتب النص العربي بحروف لاتينية تقريبية: «سؤال شارع» ← «sual-shara».
 *
 * المفاتيح (`slug` المرجعيات والاستمارات، ومفتاح السؤال) لاتينية بقواعد
 * الخادم، ويثبت المفتاح بعد الحفظ بينما يتغيّر الاسم تحريريًا. طلبه من
 * المستخدم حقلٌ تقني في نموذج يملؤه غير المبرمجين، وحذف الحروف العربية
 * يخرج «item-2»؛ فالاشتقاق التقريبي مع إمكانية التحرير أفضل من الاثنين.
 */
export function latinize(text: string, separator: "-" | "_" = "-") {
  const edges = separator === "-" ? /^-+|-+$/g : /^_+|_+$/g;

  return [...text.trim().toLowerCase()]
    .map((char) => LATIN[char] ?? char)
    .join("")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    // التشكيل (علامات غير متباعدة) والتطويل والهمزة المفردة لا تقابلها حروف.
    .replace(/[\p{Mn}ـء]/gu, "")
    .replace(/[^a-z0-9]+/g, separator)
    .replace(edges, "");
}

/** يضيف رقمًا متزايدًا حين يكون المفتاح مأخوذًا: «podcast-2». */
export function uniqueKey(base: string, existing: readonly string[], separator: "-" | "_" = "-") {
  if (!existing.includes(base)) return base;

  let index = 2;

  while (existing.includes(`${base}${separator}${index}`)) index += 1;

  return `${base}${separator}${index}`;
}
