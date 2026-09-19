import { Sprout } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * كل قائمة تأتي من الـAPI تمر بهذه الحالة: قبل صدور المسارات العامة،
 * وعند انقطاع الـAPI، وحين لا يوجد محتوى بعد. الرسالة تُكتب من موقع
 * الزائر لا من موقع النظام — «قريبًا» لا «تعذّر الجلب».
 *
 * وليست شكلًا مهملًا: مسارات `/api/public/*` لم تصدر بعد، فهذه هي الحالة
 * التي يراها الزائر فعليًا اليوم في أكثر صفحات الموقع.
 */
export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Sprout className="size-6" aria-hidden />
      </span>
      <p className="text-base font-bold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-loose text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
