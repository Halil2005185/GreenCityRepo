/**
 * صورة النص للبحث لا للعرض — كما يطابق الخادم الأسماء في `nameKey`.
 *
 * القائد يكتب «اسامه» والقائمة فيها «أسامة»: التشكيل والتطويل يسقطان،
 * وصور الألف والتاء المربوطة والألف المقصورة تتوحّد.
 */
export function searchKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\p{Mn}/gu, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىی]/g, "ي")
    .replace(/ک/g, "ك")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * الأرقام بالخانات اللاتينية. لوحة المفاتيح العربية تكتب «٠٩٤٤»، والخادم
 * يفحص الهاتف والعدد بالخانات اللاتينية.
 */
export function latinDigits(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** كما يفحصه الخادم: أرقام ومسافات وأقواس وشرطة، بعلامة `+` في أوله أو بلا. */
export const PHONE_PATTERN = /^[+]?[0-9\s()-]{6,32}$/;

/** أرقام الهاتف وحدها: ما يُكتب في رابط `tel:`. */
export function dialable(phone: string) {
  const digits = latinDigits(phone).replace(/[^0-9+]/g, "");

  return digits.length >= 6 ? digits : null;
}
