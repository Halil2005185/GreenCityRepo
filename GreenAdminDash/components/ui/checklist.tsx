import { Check, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  /** سطر شرح تحت البند — «هدف المبادرة 100 · مجموع المواقع 80 شجرة». */
  hint?: React.ReactNode;
};

/**
 * قائمة شروط قبل خطوة كبيرة: تفعيل الشريك، إطلاق المبادرة. الشروط تُحسب
 * في الخادم؛ هنا العرض فقط، مع نص «مستوفى» لقارئ الشاشة لأن الأيقونة
 * وحدها لا تُقرأ.
 */
export function Checklist({
  items,
  className,
}: {
  items: readonly ChecklistItem[];
  className?: string;
}) {
  const done = items.filter((item) => item.done).length;

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs text-muted-foreground">
        <span className="numeric">
          {done}/{items.length}
        </span>{" "}
        مستوفاة
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5 text-sm">
            {item.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0">
              <span className={cn(item.done ? "text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
              <span className="sr-only">{item.done ? " — مستوفى" : " — غير مستوفى"}</span>
              {item.hint ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
