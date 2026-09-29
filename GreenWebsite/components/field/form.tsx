import { cn } from "@/lib/utils";

/**
 * حقل بارتفاع هدف لمس كامل وخط 16px على الأقل: دون ذلك يكبّر Safari على
 * iOS الصفحة كلها عند التركيز، فيضيع الزر خارج الشاشة.
 */
export const INPUT_CLASS =
  "h-12 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive";

export const TEXTAREA_CLASS = cn(INPUT_CLASS, "h-auto min-h-24 py-3 leading-relaxed");

/** حقل بعنوانه وتلميحه. العنوان ظاهر دائمًا: النص البديل يختفي عند أول حرف. */
export function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">
        {label}
        {optional ? (
          <span className="font-normal text-muted-foreground"> (اختياري)</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * خيار بنعم ولا، بصفّ كامل يُلمس: مربع الاختيار وحده هدف صغير لإبهام في
 * الشمس. الصف كله عنوانٌ للمربع.
 */
export function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked && "border-accent-ink bg-surface",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent-ink)]"
      />
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-semibold text-foreground">
          {label}
        </span>
        {hint ? (
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
