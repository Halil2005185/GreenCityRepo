import { cn } from "@/lib/utils";

/**
 * هيكل تحميل بشكل المحتوى الآتي بدل نص «جارٍ التحميل…»: العين تقرأ
 * التخطيط قبل البيانات، فلا يقفز شيء حين تصل.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
