import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * بطاقة رقم تنقل بالنقر إلى القائمة المرشَّحة بما تعدّه: «متأخرة» تفتح
 * المهام المتأخرة لا كل المهام. أثناء التحميل هيكل لا صفر — الصفر معلومة
 * خاطئة، والهيكل انتظار صادق.
 *
 * الأرقام لاتينية (`.numeric`) كما في كل المؤشرات والجداول.
 */
export function StatCard({
  label,
  value,
  href,
  tone,
  loading = false,
  className,
}: {
  label: string;
  value: number | undefined;
  href?: string;
  /** يُلوَّن حين تكون القيمة أكبر من صفر فقط. */
  tone?: "danger" | "warning" | "success";
  loading?: boolean;
  className?: string;
}) {
  const highlighted = Boolean(tone) && (value ?? 0) > 0;

  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading || value === undefined ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        // `.numeric` على عنصر داخلي لا على الفقرة: اتجاهه ltr، ولو وُضع على
        // الكتلة كلها لانحاز الرقم إلى اليسار بعيدًا عن تسميته.
        <p
          className={cn(
            "mt-1 text-2xl font-bold",
            highlighted && tone === "danger" && "text-destructive",
            highlighted && tone === "warning" && "text-[color-mix(in_oklch,var(--warning)_55%,var(--foreground))]",
            highlighted && tone === "success" && "text-success",
          )}
        >
          <span className="numeric">{value.toLocaleString("en-US")}</span>
        </p>
      )}
    </>
  );

  const base = cn(
    "block rounded-xl border border-border bg-card p-4 text-start text-card-foreground",
    highlighted && tone === "danger" && "border-destructive/30",
    highlighted && tone === "warning" && "border-warning/40",
    className,
  );

  if (!href) return <div className={base}>{body}</div>;

  return (
    <Link
      href={href}
      className={cn(
        base,
        "transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {body}
    </Link>
  );
}
