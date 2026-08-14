/**
 * كوكي تلميح الجلسة — يضبطه الباك‌اند مع كل تسجيل دخول أو تدوير.
 *
 * لا يحمل سرًّا: قيمته `STAFF` أو `PARTNER` فقط. سببه أن رمز التحديث
 * محصور بمسار `/api/auth` فلا يراه خادم Next، وبدون أي إشارة لا يستطيع
 * `proxy.ts` توجيه الزائر إلى مساره ولا إعادته لصفحة الدخول.
 *
 * كل قرار صلاحية حقيقي يبقى في الـAPI. تزوير هذا الكوكي يمنح المهاجم
 * هيكل صفحة فارغة، لأن كل محتواها يأتي من مسارات محمية.
 */
export const SESSION_HINT_COOKIE =
  process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME ?? "gc_refresh";

export const SESSION_HINT_COOKIE_NAME = `${SESSION_HINT_COOKIE}_hint`;

export type SessionKind = "STAFF" | "PARTNER";

/** المسار الرئيسي لكل نوع حساب بعد الدخول. */
export const HOME_PATH: Record<SessionKind, string> = {
  STAFF: "/dashboard",
  PARTNER: "/portal",
};

export function parseSessionKind(value: string | undefined): SessionKind | null {
  return value === "STAFF" || value === "PARTNER" ? value : null;
}
