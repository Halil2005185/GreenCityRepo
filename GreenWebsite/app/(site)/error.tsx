"use client";

import { useEffect } from "react";

import { Backdrop } from "@/components/ui/backdrop";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/**
 * حدّ الخطأ الأعلى: يمنع خطأ في قسم واحد من إسقاط الموقع كله على شاشة
 * بيضاء. الرسالة عامة عمدًا — تفاصيل الخطأ تذهب إلى السجل لا إلى الزائر.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="on-painted relative isolate">
      <Backdrop src="/bg/section.webp" />

      <Container>
        {/* النص هنا بيجٌ كامل لا مخفَّف — القاعدة مشروحة عند `.on-painted` في globals.css. */}
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 py-24 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            حدث خطأ غير متوقع
          </h1>
          <p className="max-w-md text-base leading-loose text-foreground">
            تعذّر عرض هذه الصفحة. حاول مجددًا، وإن تكرر الأمر فأخبرنا به.
          </p>
          <Button onClick={reset} className="mt-2">
            أعد المحاولة
          </Button>
        </div>
      </Container>
    </div>
  );
}
