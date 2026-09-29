import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { VerifyScreen } from "@/components/verify/verify-screen";

export const metadata: Metadata = {
  title: "التحقق من شهادة مشاركة",
  description: "تحقّق من شهادة مشاركة صادرة عن المدن الخضراء برمزها.",
  // صفحة خدمة لا محتوى: لا تُفهرس، ولا يُفهرس عنوانٌ فيه رمز شهادة.
  robots: { index: false, follow: false },
};

/**
 * باب التحقق من شهادة: `/verify` تسأل عن الرمز، و`/verify?code=…` — ما يحمله
 * الرمز المربّع على الورقة — تعرض ما في السجل عنه.
 *
 * صفحة ثابتة لا تسأل الـAPI من الخادم، بخلاف صفحة الاستمارة: الاستمارة
 * عنوان واحد يقرؤه الجميع فيُحفظ جوابه دقيقة، والشهادات رمز لكل ورقة —
 * لا جواب يُحفظ فيغني عن السؤال، وحدّ التحقق على العنوان يُحسب على خادم
 * الموقع لو سأل هو. فالسؤال من متصفح الزائر. الشرح في `lib/certificates.ts`.
 *
 * `Suspense` لأن الشاشة تقرأ استعلام العنوان، وهذا غير معروف ساعة البناء.
 */
export default function VerifyPage() {
  return (
    <section className="py-8 sm:py-12">
      <Container>
        <div className="mx-auto max-w-xl">
          <Card className="overflow-hidden">
            <div className="h-2 bg-primary" />
            <div className="space-y-5 p-6">
              <h1 className="text-2xl font-bold tracking-tight">
                التحقق من شهادة مشاركة
              </h1>

              <Suspense
                fallback={
                  <div className="h-24 animate-pulse rounded-lg bg-surface-strong motion-reduce:animate-none" />
                }
              >
                <VerifyScreen />
              </Suspense>
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}
