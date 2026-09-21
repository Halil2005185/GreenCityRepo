"use client";

import { type LucideIcon, RotateCw, SearchX } from "lucide-react";

import { ActionButton, type ActionDef } from "@/components/ui/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

/**
 * حالة فارغة فيها دعوة لفعل: «لا شركاء بعد» وحدها طريق مسدود، ومعها زر
 * «تسجيل جهة» تصير أول خطوة.
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: ActionDef | React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-2">
          {isActionDef(action) ? <ActionButton action={action} size="sm" /> : action}
        </div>
      ) : null}
    </div>
  );
}

function isActionDef(value: unknown): value is ActionDef {
  return typeof value === "object" && value !== null && "key" in value && "label" in value;
}

/** «لا نتائج لهذه المرشحات» — رسالة غير «لا بيانات أصلًا»، ومعها زر يمسحها. */
export function NoResultsState({
  onClear,
  className,
}: {
  onClear?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title="لا نتائج لهذه المرشحات"
      description="جرّب كلمة بحث أخرى أو امسح المرشحات لترى كل السجلات."
      action={
        onClear ? (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            مسح المرشحات
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

/** خطأ تحميل مع إعادة المحاولة، ونص الخادم إن أرسل واحدًا. */
export function ErrorState({
  title = "تعذّر تحميل البيانات.",
  error,
  onRetry,
  className,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const detail = error ? errorMessage(error, "") : "";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-destructive">{title}</p>
      {detail && detail !== title ? (
        <p className="max-w-md text-sm text-muted-foreground">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RotateCw aria-hidden />
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}

/** هيكل صفوف بعدد أعمدة الجدول الآتي. */
export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-3 py-3.5">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn("h-4", column === 0 ? "w-1/4" : "flex-1", column === columns - 1 && "max-w-20")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** هيكل صفحة تفاصيل: ترويسة ثم شبكة ملخص ثم تبويبات. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="جارٍ التحميل">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-40" />
        <Skeleton className="h-8 w-full max-w-72" />
        <Skeleton className="h-4 w-full max-w-96" />
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border p-5 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/** هيكل صفحة قائمة — بديل الانتظار الافتراضي في `AppShell`. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="جارٍ التحميل">
      <div className="space-y-2">
        <Skeleton className="h-8 w-full max-w-56" />
        <Skeleton className="h-4 w-full max-w-80" />
      </div>
      <Skeleton className="h-9 w-full max-w-lg" />
      <div className="rounded-xl border border-border">
        <TableSkeleton />
      </div>
    </div>
  );
}
