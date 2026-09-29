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

/**
 * صورة الاسم للمطابقة لا للعرض: «أسامة الحلبي» و«اسامه الحلبى» شخص واحد.
 *
 * يُسقط التشكيل والتطويل، ويوحّد صور الألف والتاء المربوطة والألف
 * المقصورة، فلا يصير اختلاف الإملاء بين استمارتين مشاركَين.
 */
export function nameKey(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\p{Mn}/gu, '')
    .replace(/ـ/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * صورة الهاتف للمطابقة: أرقامه وحدها بلا مفتاح البلد ولا الصفر البادئ.
 *
 * `+963 944 123 456` و`0944123456` و`00963944123456` رقم واحد يكتبه صاحبه
 * بثلاث صور. الأرقام الهندية تُحوَّل، وما بقي أقل من ستة أرقام ليس هاتفًا.
 */
export function phoneKey(value: string | null | undefined) {
  if (!value) return null

  const digits = value
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '')
    .replace(/^00/, '')
    .replace(/^963/, '')
    .replace(/^0+/, '')

  return digits.length >= 6 ? digits.slice(0, 20) : null
}
