import type { Metadata } from "next";

import { LinkScreen } from "@/components/field/link-screen";

export const metadata: Metadata = {
  title: "بطاقتي",
  // الرابط اعتمادٌ شخصي: لا يُرسَل عنوان هذه الصفحة إلى موقع آخر.
  referrer: "no-referrer",
};

/**
 * مدخل الرابط الشخصي. قشرة ثابتة كبقية صفحات التطبيق: الرمز في جزء العنوان
 * يقرؤه المتصفح وحده، فالصفحة نفسها واحدة لكل المتطوعين وتُحفظ مرة.
 */
export default function FieldLinkPage() {
  return <LinkScreen />;
}
