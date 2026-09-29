"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";

import { dismissToast, useToasts } from "@/lib/field/toast";
import { cn } from "@/lib/utils";

/**
 * الرسائل العابرة. فوق شريط التبويب في التطبيق، وأسفل الصفحة في المتصفح.
 *
 * منطقة حيّة واحدة ثابتة في الصفحة: قارئ الشاشة يعلن ما يُضاف إليها، ولو
 * رُكّبت مع كل رسالة لما أعلن شيئًا.
 */
export function FieldToaster() {
  const toasts = useToasts();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 print:hidden mx-auto flex w-full max-w-[30rem] flex-col gap-2 px-4 app:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-lg",
            toast.tone === "danger"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-accent-ink bg-accent-ink text-[var(--brand-warm-beige)]",
          )}
        >
          {toast.tone === "danger" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <p className="min-w-0 flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="إخفاء الرسالة"
            className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
