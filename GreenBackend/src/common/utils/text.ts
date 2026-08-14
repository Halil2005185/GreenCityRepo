/**
 * تطبيع البريد: قصّ المسافات وتحويل الأحرف لصغيرة.
 *
 * الجزء المحلي حساس لحالة الأحرف نظريًا في RFC 5321، لكن لا مزوّد عملي
 * يفرّق بينها، والتفريق هنا يعني حسابين لشخص واحد ودعوة لا تُقبل لأن
 * الشخص كتب بريده بحرف كبير.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** يمنع الفراغ المزدوج والمسافات الطرفية في الأسماء والعناوين العربية. */
export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}
