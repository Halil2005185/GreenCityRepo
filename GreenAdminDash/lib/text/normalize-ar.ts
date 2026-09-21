/**
 * تطبيع النص العربي للبحث: من يكتب «اسامه» يجد «أسامة».
 *
 * يُسقط التشكيل والتطويل، ويوحّد صور الألف (أ إ آ ٱ ← ا)، والتاء المربوطة
 * بالهاء، والألف المقصورة بالياء، وحروف الفارسية الشائعة في النصوص
 * المنسوخة (ی ک)، والأرقام الهندية باللاتينية. يُطبَّق على النص وعلى
 * البحث معًا، فلا يغيّر ما يُعرض بل ما يُقارن.
 */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const ALEF_FORMS = /[آأإٱ]/g;

export function normalizeArabic(value: string) {
  return value
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(ALEF_FORMS, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىی]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[٠-٩]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** هل يحوي أحد النصوص عبارة البحث كاملة بعد التطبيع؟ */
export function matchesQuery(
  query: string,
  ...haystack: ReadonlyArray<string | null | undefined>
) {
  const needle = normalizeArabic(query);

  if (!needle) return true;

  return haystack.some(
    (text) => text != null && normalizeArabic(text).includes(needle),
  );
}
