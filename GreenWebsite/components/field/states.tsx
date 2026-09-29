import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * عنوان الصفحة في وضع المتصفح وحده. في التطبيق يحمله الشريط المرسوم، وعنوان
 * ثانٍ تحته يكرر ما فوقه ويأكل من شاشة صغيرة.
 */
export function PageTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6 space-y-1.5 app:hidden">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** بطاقة قسم بعنوانها. الزاوية أوسع في التطبيق: `--radius` يكبر هناك. */
export function FieldCard({
  title,
  aside,
  className,
  children,
}: {
  title?: string;
  /** ما يقابل العنوان في طرف البطاقة: عدّاد أو زر صغير. */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm",
        className,
      )}
    >
      {title || aside ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-base font-bold text-foreground">{title}</h2>
          ) : null}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const NOTICE_TONES = {
  neutral: "border-border bg-surface",
  warning: "border-warning/40 bg-warning/10",
  danger: "border-destructive/40 bg-destructive/10",
} as const;

/**
 * رسالة حال: فراغ، أو انقطاع، أو رفض. تُكتب من موقع من يقرؤها في الميدان —
 * ما الذي حدث، وما الذي يفعله الآن — لا من موقع النظام.
 */
export function FieldNotice({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: keyof typeof NOTICE_TONES;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-5 py-8 text-center",
        NOTICE_TONES[tone],
      )}
    >
      <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="text-base font-bold text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-loose text-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-5 flex justify-center">{children}</div> : null}
    </div>
  );
}

/** هيكل تحميل بشكل البطاقات التي ستحلّ مكانه، فلا تقفز الصفحة عند وصولها. */
export function FieldSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="h-4 w-1/3 rounded-full bg-surface-strong motion-safe:animate-pulse" />
          <div className="h-3 w-full rounded-full bg-surface motion-safe:animate-pulse" />
          <div className="h-3 w-2/3 rounded-full bg-surface motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
