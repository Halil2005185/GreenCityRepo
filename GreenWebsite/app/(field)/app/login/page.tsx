import type { Metadata } from "next";

import { LoginForm } from "@/components/field/login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

/**
 * دخول قادة المجموعات بحساباتهم في الفريق. لا `middleware` يحرس التطبيق:
 * الصفحات قشور بلا بيانات، وما يحميها فحص الخادم لكل طلب إلى الـAPI.
 */
export default function FieldLoginPage() {
  return <LoginForm />;
}
