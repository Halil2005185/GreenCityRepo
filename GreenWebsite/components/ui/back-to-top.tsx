"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * زر العودة إلى أعلى الصفحة. يظهر بعد تمرير شاشة تقريبًا، لا قبلها — زرٌّ
 * للعودة وأنت في الأعلى أصلًا زينةٌ تحجب المحتوى.
 *
 * `inert` وهو مخفي: الإخفاء بالشفافية وحدها يُبقي الزر في ترتيب التبويب
 * وفي شجرة الوصولية، فيقع عليه التركيز ولا يُرى — وهذا ما كان في التصميم
 * المُسلَّم. `inert` يرفعه من الاثنين ويُبقي انتقال الظهور سلسًا، بخلاف
 * `display: none`.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 600);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      inert={!shown}
      onClick={() =>
        window.scrollTo({
          top: 0,
          /**
           * `smooth` يُلغيه المتصفح نفسه لمن ضبط تقليل الحركة، فلا فحص هنا.
           */
          behavior: "smooth",
        })
      }
      aria-label="العودة إلى أعلى الصفحة"
      className={cn(
        "fixed bottom-6 end-6 z-50 inline-flex size-11 items-center justify-center rounded-full",
        "border border-primary/40 bg-surface/90 text-primary shadow-lg backdrop-blur",
        "transition duration-300 hover:bg-primary hover:text-primary-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  );
}
