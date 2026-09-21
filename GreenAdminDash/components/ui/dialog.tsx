"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { captureInvoker, restoreFocus } from "@/lib/focus";
import { cn } from "@/lib/utils";

type AutoFocusHandlers = {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * يلتقط زر الفتح لحظة الفتح ويعيد التركيز إليه عند الإغلاق — للنوافذ
 * المفتوحة بالحالة لا بـ`Trigger` (انظر `lib/focus.ts`).
 */
export function useInvokerFocus({ onOpenAutoFocus, onCloseAutoFocus }: AutoFocusHandlers) {
  const invoker = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus(event: Event) {
      invoker.current = captureInvoker();
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);

      if (!event.defaultPrevented) {
        event.preventDefault();
        restoreFocus(invoker.current);
      }
    },
  };
}

/**
 * نافذة منبثقة على Radix مع ثلاثة مقاسات ثابتة.
 *
 * التوسيط بـ`inset-0 m-auto h-fit` كما يفعل عنصر `<dialog>` الأصلي، لا
 * بـ`translate(-50%)`: الإزاحة الأفقية تحتاج عكسًا تحت RTL وتتعارض مع
 * حركة التكبير، وهذا الأسلوب لا اتجاه له أصلًا.
 *
 * على الشاشات الصغيرة تملأ النافذة الشاشة: نموذج من ستة حقول لا يُقرأ في
 * بطاقة عائمة عرضها ثلاثمئة بكسل.
 */
const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
} as const;

export type DialogSize = keyof typeof SIZES;

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  size = "md",
  showCloseButton = true,
  closeDisabled = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  showCloseButton?: boolean;
  /** يعطّل زر الإغلاق أثناء الحفظ؛ منع Esc والنقر خارجها مسؤولية المستدعي. */
  closeDisabled?: boolean;
}) {
  const focus = useInvokerFocus({ onOpenAutoFocus, onCloseAutoFocus });

  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={focus.onOpenAutoFocus}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        className={cn(
          "fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none duration-150",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          "max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0",
          SIZES[size],
          className,
        )}
        {...props}
      >
        {children}

        {showCloseButton ? (
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute end-3 top-3"
              disabled={closeDisabled}
              aria-label="إغلاق"
            >
              <XIcon />
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** الترويسة تترك مكانًا لزر الإغلاق في جهة النهاية (`pe-12`). */
export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border px-5 py-4 pe-12 text-start",
        className,
      )}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}
      {...props}
    />
  );
}

/**
 * التذييل ثابت تحت جسم يُمرَّر. `justify-end` مع ترتيب «إلغاء» ثم الزر
 * الأساسي يضع الأساسي في أقصى جهة النهاية تحت أي اتجاه.
 */
export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-snug", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
