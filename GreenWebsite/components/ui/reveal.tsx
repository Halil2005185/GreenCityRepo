"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * مجموعة تظهر بالتدرّج حين تدخل الشاشة.
 *
 * مراقبٌ واحد للمجموعة لا لكل عنصر: الأبناء يبقون مكوّنات خادم ويكفيهم
 * صنف `reveal`، ولا يُرسَل إلى المتصفح إلا هذا الغلاف. المراقب يفصل نفسه
 * بعد أول ظهور — العنصر لا «يُخفى» ثانيةً عند الرجوع إليه.
 *
 * التنسيق كله في `globals.css` حيث يُلغى تحت `prefers-reduced-motion`
 * وتحت `scripting: none`.
 */
export function RevealGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    /**
     * لا فرع احتياطي لغياب `IntersectionObserver`: هو مدعوم في كل متصفح
     * يشغّل React 19 أصلًا، وفرعٌ لا يُنفَّذ أبدًا لا يُصان. الخطر الحقيقي
     * — تعطيل JavaScript — يغطّيه `scripting: none` في `globals.css`.
     */
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      /**
       * `rootMargin` سالب من الأسفل: لا تبدأ الحركة والعنصر ما زال بطرف
       * الشاشة، فينتهي ظهوره قبل أن يصل إليه النظر.
       */
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal-visible={visible} className={className} {...props}>
      {children}
    </div>
  );
}

/** عنصر واحد يظهر بالتدرّج — مجموعة من طفل واحد. */
export function Reveal({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <RevealGroup {...props}>
      <div className={cn("reveal", className)}>{children}</div>
    </RevealGroup>
  );
}
