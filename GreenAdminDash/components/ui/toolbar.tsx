"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * شريط أدوات القائمة: البحث في جهة البداية، ثم المرشحات، ثم «مسح
 * المرشحات» آخرًا. لا أفعال هنا — الأفعال في الترويسة.
 */
export function Toolbar({
  search,
  children,
  hasActiveFilters = false,
  onReset,
  className,
}: {
  search?: React.ReactNode;
  children?: React.ReactNode;
  hasActiveFilters?: boolean;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div
      role="search"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {search ? <div className="w-full sm:w-72">{search}</div> : null}

      {children || (hasActiveFilters && onReset) ? (
        // على الجوال يأخذ كل مرشح عرض الشاشة بدل أعمدة متفاوتة العرض.
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:*:w-full sm:ms-auto">
          {children}
          {hasActiveFilters && onReset ? (
            <Button type="button" variant="ghost" className="h-9" onClick={onReset}>
              <XIcon aria-hidden />
              مسح المرشحات
            </Button>
          ) : null}
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
