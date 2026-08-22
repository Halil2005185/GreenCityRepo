import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  HOME_PATH,
  SESSION_HINT_COOKIE_NAME,
  parseSessionKind,
} from "@/lib/auth/session-hint";

/**
 * توجيه فقط، لا تفويض.
 *
 * الغرض أن يهبط الزائر على مساره الصحيح دون وميض صفحة خاطئة، وأن يُعاد
 * غير المسجّل إلى الدخول. أما ما يراه فعلًا فيقرره الـAPI في كل طلب عبر
 * `requireAuth` و`requireCapability` — تجاوز هذا الملف يعطي صفحة فارغة
 * لا بيانات.
 *
 * لماذا `middleware.ts` لا `proxy.ts` رغم أن Next.js 16 أهمل الاسم الأول؟
 * `proxy` يعمل على Node.js حصرًا ولا يقبل ضبط `runtime`، ومحوّل OpenNext
 * الذي ينشر اللوحة على Cloudflare Workers لا يقبل إلا middleware الـedge
 * ويُسقط البناء عند غيره («Node.js middleware is not currently supported»).
 * الكود هنا Web APIs فقط فلا يخسر شيئًا على الـedge. لا تُعِد التسمية إلى
 * `proxy.ts` قبل أن يدعم OpenNext ذلك، وإلا عاد النشر إلى الفشل.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const kind = parseSessionKind(
    request.cookies.get(SESSION_HINT_COOKIE_NAME)?.value,
  );

  const isStaffArea = pathname.startsWith("/dashboard");
  const isPartnerArea = pathname.startsWith("/portal");
  const isAuthArea =
    pathname === "/login" ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  if (isAuthArea) {
    // المسجَّل لا يرى صفحة الدخول؛ يُعاد إلى لوحته.
    if (kind && pathname === "/login") {
      return NextResponse.redirect(new URL(HOME_PATH[kind], request.url));
    }

    return NextResponse.next();
  }

  if (!isStaffArea && !isPartnerArea) return NextResponse.next();

  if (!kind) {
    const login = new URL("/login", request.url);

    // يعود إلى ما كان يقصده بعد الدخول بدل أن يهبط على الصفحة الرئيسية.
    login.searchParams.set("next", pathname);

    return NextResponse.redirect(login);
  }

  const allowed = kind === "STAFF" ? isStaffArea : isPartnerArea;

  if (!allowed) {
    return NextResponse.redirect(new URL(HOME_PATH[kind], request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * بدون استثناء الأصول الساكنة يعمل الحارس على كل ملف CSS وصورة، فيحوّل
   * إعادة توجيه الدخول إلى صفحة بلا تنسيق.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2?)$).*)",
  ],
};
