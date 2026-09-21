"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { useInvokerFocus } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * لوحة جانبية تنفتح من جهة النهاية لعرض سجل دون مغادرة القائمة، ومن جهة
 * البداية لتنقل الجوال وحده.
 *
 * الجهة منطقية (`start`/`end`) والموضع بـ`start-0`/`end-0`. حركة الانزلاق
 * وحدها فيزيائية مشروطة بالاتجاه (`rtl:`/`ltr:`): أدوات الانزلاق المنطقية
 * في `tw-animate-css` لا تعمل كما ينبغي، ودليل shadcn ينبّه إلى ذلك.
 */
const SIDE = {
  end: "end-0 border-s data-open:ltr:slide-in-from-right data-closed:ltr:slide-out-to-right data-open:rtl:slide-in-from-left data-closed:rtl:slide-out-to-left",
  start:
    "start-0 border-e data-open:ltr:slide-in-from-left data-closed:ltr:slide-out-to-left data-open:rtl:slide-in-from-right data-closed:rtl:slide-out-to-right",
} as const;

const WIDTH = {
  sm: "sm:max-w-xs",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
} as const;

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = "end",
  width = "md",
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDE;
  width?: keyof typeof WIDTH;
  showCloseButton?: boolean;
}) {
  const focus = useInvokerFocus({ onOpenAutoFocus, onCloseAutoFocus });

  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        onOpenAutoFocus={focus.onOpenAutoFocus}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        className={cn(
          "fixed inset-y-0 z-50 flex h-dvh w-full flex-col border-border bg-card text-card-foreground shadow-xl outline-none duration-200 ease-out data-open:animate-in data-closed:animate-out",
          SIDE[side],
          WIDTH[width],
          className,
        )}
        {...props}
      >
        {children}

        {showCloseButton ? (
          <SheetPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute end-3 top-3"
              aria-label="إغلاق"
            >
              <XIcon />
            </Button>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border px-5 py-4 pe-12 text-start",
        className,
      )}
      {...props}
    />
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-lg font-semibold leading-snug", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
