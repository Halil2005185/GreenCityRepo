"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDown, Loader2, XIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { normalizeArabic } from "@/lib/text/normalize-ar";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** سطر ثانوي تحت التسمية: المكتب الأب، البريد، الموسم. */
  description?: string;
  /** عنوان مجموعة؛ تُعرض المجموعات بترتيب أول ظهور. */
  group?: string;
  /** مستوى التدرج — المكاتب الفرعية تحت مكتبها. */
  depth?: number;
  disabled?: boolean;
  /** كلمات إضافية يطابقها البحث ولا تُعرض. */
  keywords?: readonly string[];
};

/** خيارات من الخادم: تُجلب عند الفتح وتُصفّى بمعامل `q`. */
export type SelectSource = {
  queryKey: readonly unknown[];
  load: (query: string, signal: AbortSignal) => Promise<SelectOption[]>;
};

type CommonProps = {
  id?: string;
  options?: readonly SelectOption[];
  source?: SelectSource;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** `auto`: البحث يظهر حين تزيد الخيارات عن سبعة أو تأتي من الخادم. */
  searchable?: boolean | "auto";
  clearable?: boolean;
  disabled?: boolean;
  /** الخيارات الثابتة ما زالت تُحمَّل. */
  loading?: boolean;
  size?: "default" | "sm";
  /** بادئة ظاهرة في الزر لمرشحات شريط الأدوات: «المرحلة: الكل». */
  label?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
};

type SingleProps = CommonProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null, option: SelectOption | null) => void;
  /** تسمية القيمة المختارة حين لا تكون ضمن الخيارات المحمّلة (بحث الخادم). */
  selectedOption?: SelectOption | null;
};

type MultiProps = CommonProps & {
  multiple: true;
  value: readonly string[];
  onChange: (values: string[], options: SelectOption[]) => void;
  selectedOptions?: readonly SelectOption[];
};

export type SelectProps = SingleProps | MultiProps;

const AUTO_SEARCH_THRESHOLD = 7;
const NO_OPTIONS: readonly SelectOption[] = [];

/**
 * المطابقة على نص مطبَّع: «اسامه» تجد «أسامة». ما يبدأ بالعبارة يتقدّم
 * على ما يحويها في وسطه.
 */
function arabicFilter(_value: string, search: string, keywords?: string[]) {
  const needle = normalizeArabic(search);

  if (!needle) return 1;

  const haystack = normalizeArabic((keywords ?? []).join(" "));

  if (haystack.startsWith(needle)) return 1;

  return haystack.includes(needle) ? 0.5 : 0;
}

function groupOptions(options: readonly SelectOption[]) {
  const groups = new Map<string, SelectOption[]>();

  for (const option of options) {
    const key = option.group ?? "";
    const list = groups.get(key);

    if (list) list.push(option);
    else groups.set(key, [option]);
  }

  return [...groups.entries()];
}

/**
 * قائمة الاختيار الوحيدة في اللوحة، مفردة ومتعددة، تستبدل كل `<select>`
 * أصلي.
 *
 * زر بدور `combobox` تفتحه لوحة المفاتيح (Enter ومسافة والأسهم)، ثم قائمة
 * cmdk تتنقل بالأسهم وتختار بـEnter، وEsc يغلقها ويعيد التركيز إلى الزر.
 * يعمل داخل `Field` مباشرة: يستقبل `id` و`aria-invalid` و`aria-describedby`
 * منه، فتربط التسمية ورسالة الخطأ بالزر كما في أي حقل.
 */
export function Select(props: SelectProps) {
  const {
    id,
    options,
    source,
    placeholder = "اختر…",
    searchPlaceholder = "ابحث…",
    emptyText = "لا نتائج",
    searchable = "auto",
    clearable = false,
    disabled = false,
    loading = false,
    size = "default",
    label,
    className,
  } = props;

  const generatedId = useId();
  const listId = `${id ?? generatedId}-list`;
  const commandRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  // ما اختاره المستخدم من نتائج الخادم يبقى معروف التسمية بعد تغيّر النتائج.
  const [picked, setPicked] = useState<readonly SelectOption[]>(NO_OPTIONS);

  const remote = useQuery({
    queryKey: [...(source?.queryKey ?? ["select-source"]), debouncedSearch],
    queryFn: ({ signal }) =>
      source ? source.load(debouncedSearch, signal) : Promise.resolve([]),
    enabled: Boolean(source) && open,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const shownOptions = source ? (remote.data ?? NO_OPTIONS) : (options ?? NO_OPTIONS);

  const hintSingle = props.multiple ? undefined : props.selectedOption;
  const hintMulti = props.multiple ? props.selectedOptions : undefined;
  const selectedHints = useMemo(
    () => hintMulti ?? (hintSingle ? [hintSingle] : NO_OPTIONS),
    [hintMulti, hintSingle],
  );

  const known = useMemo(() => {
    const map = new Map<string, SelectOption>();

    for (const list of [picked, selectedHints, remote.data ?? NO_OPTIONS, options ?? NO_OPTIONS]) {
      for (const option of list) map.set(option.value, option);
    }

    return map;
  }, [picked, selectedHints, remote.data, options]);

  const selectedValues: readonly string[] = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];

  const showSearch =
    searchable === true ||
    (searchable === "auto" && (Boolean(source) || shownOptions.length > AUTO_SEARCH_THRESHOLD));

  const labels = selectedValues.map((value) => known.get(value)?.label ?? "…");
  const display =
    labels.length === 0
      ? null
      : props.multiple && labels.length > 2
        ? `${labels.length} مختارة`
        : labels.join("، ");

  const hasValue = selectedValues.length > 0;

  function remember(option: SelectOption) {
    if (source) setPicked((current) => [...current.filter((item) => item.value !== option.value), option]);
  }

  function choose(option: SelectOption) {
    remember(option);

    if (props.multiple) {
      const exists = props.value.includes(option.value);
      const next = exists
        ? props.value.filter((value) => value !== option.value)
        : [...props.value, option.value];

      props.onChange(
        next,
        next.map((value) => known.get(value) ?? (value === option.value ? option : { value, label: value })),
      );
      return;
    }

    props.onChange(option.value, option);
    setOpen(false);
  }

  function clear() {
    if (props.multiple) props.onChange([], []);
    else props.onChange(null, null);
  }

  const heightClass = size === "sm" ? "h-9" : "h-10";

  return (
    <div className={cn("relative w-full", className)}>
      <Popover
        open={open}
        modal
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listId : undefined}
            aria-invalid={props["aria-invalid"] || undefined}
            aria-describedby={props["aria-describedby"]}
            aria-label={props["aria-label"] ?? label}
            disabled={disabled}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-start text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30",
              heightClass,
              clearable && hasValue && "pe-14",
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              {label ? <span className="text-muted-foreground">{label}: </span> : null}
              {display ?? <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-56 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            // بلا حقل بحث يتلقى الجذر التركيز فتعمل الأسهم وEnter فورًا.
            if (!showSearch) {
              event.preventDefault();
              commandRef.current?.focus();
            }
          }}
        >
          <Command
            ref={commandRef}
            tabIndex={-1}
            loop
            shouldFilter={!source}
            filter={arabicFilter}
          >
            {showSearch ? (
              <CommandInput
                value={search}
                onValueChange={setSearch}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            ) : null}

            <CommandList id={listId} aria-label={props["aria-label"] ?? label ?? placeholder}>
              {source && remote.isFetching ? (
                <div className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  جارٍ البحث…
                </div>
              ) : null}

              {loading && !source ? (
                <div className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  جارٍ التحميل…
                </div>
              ) : (
                <CommandEmpty>{source && remote.isPending ? "جارٍ البحث…" : emptyText}</CommandEmpty>
              )}

              {groupOptions(shownOptions).map(([group, items]) => (
                <CommandGroup key={group || "_"} heading={group || undefined}>
                  {items.map((option) => {
                    const selected = selectedValues.includes(option.value);

                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={[option.label, option.description ?? "", ...(option.keywords ?? [])]}
                        disabled={option.disabled}
                        data-checked={selected}
                        onSelect={() => choose(option)}
                        style={option.depth ? { paddingInlineStart: `${0.5 + option.depth}rem` } : undefined}
                      >
                        <CheckIcon
                          aria-hidden
                          className={cn("size-4 text-primary", selected ? "opacity-100" : "opacity-0")}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        {selected ? <span className="sr-only">(مختار)</span> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {clearable && hasValue && !disabled ? (
        <button
          type="button"
          onClick={clear}
          aria-label="مسح الاختيار"
          className="absolute end-8 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
