import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeScreen } from "@/components/field/home-screen";
import { FieldSkeleton } from "@/components/field/states";

export const metadata: Metadata = { title: "اليوم" };

/**
 * مدخل التطبيق، وهو ما تفتحه الأيقونة المثبّتة.
 *
 * الصفحة قشرة ثابتة: لا تقرأ على الخادم شيئًا، وبياناتها كلها من الـAPI في
 * المتصفح. هكذا تُحفظ ملفًا واحدًا وتُفتح بلا شبكة، وما يتغيّر — المجموعة
 * وورقتها — يأتي من المحفوظ على الجهاز.
 *
 * `Suspense` لأن الشاشة تقرأ استعلام العنوان (`?group=`)، وهذا غير معروف
 * عند البناء.
 */
export default function FieldHomePage() {
  return (
    <Suspense fallback={<FieldSkeleton />}>
      <HomeScreen />
    </Suspense>
  );
}
