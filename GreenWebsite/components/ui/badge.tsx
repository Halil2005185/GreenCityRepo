import { cn } from "@/lib/utils";

/**
 * كل نغمة تحمل سطحها الصلب، فتبقى الشارة مقروءة فوق اللوحات المرسومة
 * كما فوق الخلفية السادة — الشارات تظهر في رأس صفحة المبادرة وهو لوحة.
 *
 * «الجاري» وحده بالأخضر الحيوي كاملًا: النغمات في `lib/content/labels.ts`
 * تقول إن الجاري يُبرَز والملغى يخفت، والإبراز لون كامل لا درجة مخفَّفة.
 */
const TONES = {
  primary: "bg-primary text-primary-foreground",
  success: "bg-surface-strong text-success",
  /** للمتعثّر وما يستوقف: يُستعمل في التطبيق الميداني. */
  warning: "bg-surface-strong text-warning",
  muted: "bg-surface-strong text-muted-foreground",
  outline: "border border-border bg-background/85 text-foreground backdrop-blur-sm",
} as const;

export function Badge({
  tone = "muted",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
