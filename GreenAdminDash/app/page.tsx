import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  HOME_PATH,
  SESSION_HINT_COOKIE_NAME,
  parseSessionKind,
} from "@/lib/auth/session-hint";

/**
 * الجذر لا يعرض شيئًا: يقرأ تلميح الجلسة ويحوّل إلى لوحة الفريق أو بوابة
 * الشريك أو صفحة الدخول. `cookies()` غير متزامنة في Next.js 16.
 */
export default async function RootPage() {
  const store = await cookies();
  const kind = parseSessionKind(store.get(SESSION_HINT_COOKIE_NAME)?.value);

  redirect(kind ? HOME_PATH[kind] : "/login");
}
