"use client";

import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * شريط أدوات القائمة: البحث في جهة البداية، ثم المرشحات، ثم «مسح
 * المرشحات» آخرًا. لا أفعال هنا — الأفعال في الترويسة.
 *
 * على الجوال تنتقل المرشحات إلى لوحة يفتحها زر بجوار البحث وعليه عدد
 * الفعّال منها: خمس قوائم مكدّسة بعرض الشاشة كانت تدفع الجدول نفسه
 * إلى ما تحت الطيّة. المرشحات تُطبَّق وهي تُختار، فزر اللوحة يغلقها فقط.
 */
export function Toolbar({
  search,
  children,
  hasActiveFilters = false,
  activeCount = 0,
  mobile = "sheet",
  onReset,
  className,
}: {
  search?: React.ReactNode;
  children?: React.ReactNode;
  hasActiveFilters?: boolean;
  /** عدد المرشحات الفعّالة دون البحث — يظهر على زر لوحة الجوال. */
  activeCount?: number;
  /** مرشح واحد صغير (رقائق حالة) يبقى في مكانه على الجوال بلا لوحة. */
  mobile?: "sheet" | "inline";
  onReset?: () => void;
  className?: string;
}) {
  const reset =
    hasActiveFilters && onReset ? (
      <Button type="button" variant="ghost" className="h-9" onClick={onReset}>
        <XIcon aria-hidden />
        مسح المرشحات
      </Button>
    ) : null;

  return (
    <div role="search" className={cn("flex flex-wrap items-center gap-2", className)}>
      {search ? <div className="min-w-0 flex-1 sm:w-72 sm:flex-none">{search}</div> : null}

      {children && mobile === "sheet" ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="h-9 sm:hidden">
              <SlidersHorizontalIcon aria-hidden />
              المرشحات
              {activeCount > 0 ? (
                <span className="numeric rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                  {activeCount}
                  <span className="sr-only"> فعّالة</span>
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="end" width="sm">
            <SheetHeader>
              <SheetTitle>المرشحات</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-3 *:w-full">{children}</SheetBody>
            <SheetFooter>
              {reset}
              <SheetClose asChild>
                <Button type="button">عرض النتائج</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}

      {children || reset ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 sm:ms-auto",
            mobile === "sheet" ? "max-sm:hidden" : "max-sm:w-full",
          )}
        >
          {children}
          {reset}
        </div>
      ) : null}
    </div>
  );
}

/**
 * بحث فوري بتأخير نحو 300ms بعد آخر ضغطة، لا بزر إرسال. النص المكتوب
 * محلي والقيمة المؤخَّرة تصعد إلى الصفحة؛ ومسح المرشحات من الخارج يفرّغه.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "بحث…",
  label,
  delay = 300,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** اسم الحقل لقارئ الشاشة؛ الافتراضي نص التلميح. */
  label?: string;
  delay?: number;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // قيمة جاءت من الخارج (مسح المرشحات، الرجوع في المتصفح) تحلّ محل المكتوب.
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value.trim()) return;

    const timer = window.setTimeout(() => onChange(text.trim()), delay);

    return () => window.clearTimeout(timer);
  }, [text, value, delay, onChange]);

  return (
    <div className={cn("relative", className)}>
      <SearchIcon
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter تطبّق فورًا لمن لا يريد الانتظار.
          if (event.key === "Enter") onChange(text.trim());
          if (event.key === "Escape" && text) {
            event.stopPropagation();
            setText("");
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background pe-8 ps-9 text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            setText("");
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="مسح البحث"
          className="absolute end-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export type ChipOption = { value: string; label: string; count?: number };

/**
 * رقائق لمرشح واحد بخيارات قليلة (ستة فأقل)؛ ما زاد يأخذ `Select`.
 * مجموعة أزرار راديو: الأسهم تنقل بينها وTab يخرج منها كلها بضغطة.
 *
 * للمرشحات وحدها. الأفعال التي تحفظ فورًا (نقل المرحلة) لا تستعمل هذا
 * الشكل — لها زر ونافذة، كي لا يُحسب الحفظ تصفيةً.
 */
export function FilterChips({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly ChipOption[];
  label: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function move(from: number, step: number) {
    const next = (from + step + options.length) % options.length;

    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      onKeyDown={(event) => {
        const index = refs.current.findIndex((element) => element === document.activeElement);

        if (index < 0) return;

        // الأسهم الأفقية تتبع اتجاه القراءة: «التالي» يسار الصفحة تحت RTL.
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const forward = rtl ? "ArrowLeft" : "ArrowRight";
        const backward = rtl ? "ArrowRight" : "ArrowLeft";

        if (event.key === forward || event.key === "ArrowDown") {
          event.preventDefault();
          move(index, 1);
        } else if (event.key === backward || event.key === "ArrowUp") {
          event.preventDefault();
          move(index, -1);
        }
      }}
    >
      {options.map((option, index) => {
        const active = index === selectedIndex;

        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="numeric text-[11px] opacity-70">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
