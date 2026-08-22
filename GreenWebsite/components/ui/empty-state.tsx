import { cn } from "@/lib/utils";

/**
 * كل قائمة تأتي من الـAPI تمر بهذه الحالة: قبل صدور المسارات العامة،
 * وعند انقطاع الـAPI، وحين لا يوجد محتوى بعد. الرسالة تُكتب من موقع
 * الزائر لا من موقع النظام — «قريبًا» لا «تعذّر الجلب».
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
        "rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center",
        className,
      )}
    >
      <p className="text-base font-medium">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
