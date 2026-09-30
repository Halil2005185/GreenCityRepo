import type { Metadata } from "next";

import { CheckinScreen } from "@/components/field/checkin-screen";

export const metadata: Metadata = {
  title: "تسجيل الحضور",
  // رمز الحضور في جزء العنوان: لا يُرسَل عنوان هذه الصفحة إلى موقع آخر.
  referrer: "no-referrer",
};

/**
 * ما يفتحه الرمز المربّع عند نقطة اللقاء. قشرة ثابتة كبقية صفحات التطبيق:
 * المجموعة ورمزها في جزء العنوان يقرؤهما المتصفح وحده.
 */
export default function FieldCheckinPage() {
  return <CheckinScreen />;
}
