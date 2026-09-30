"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";

import { INPUT_CLASS } from "@/components/field/form";
import { Button } from "@/components/field/button";
import type { FieldTarget } from "@/lib/field/api";
import { enteredValue, isCounter } from "@/lib/field/targets";
import { latinDigits } from "@/lib/field/text";
import { cn, formatNumber } from "@/lib/utils";

/** زرّا الزيادة والنقص بواحد؛ وهذه لمن يعدّ بالصناديق والصفوف. */
const QUICK_STEPS = [5, 10, 50] as const;

/** سقف الخادم للقيد الواحد. */
const MAX_VALUE = 999_999_999_999;

function parse(text: string, decimals: number) {
  // الفاصلة العشرية العربية «٫» والفاصلة اللاتينية تُقرآن نقطة.
  const value = Number(latinDigits(text).replace(/[٫,]/g, ".").trim());

  if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE) return null;

  const scale = 10 ** decimals;

  // ما زاد على خانات المؤشر يُقرَّب: الخادم يحفظه بخاناته هو.
  return Math.round(value * scale) / scale;
}

/**
 * مؤشر من أهداف الموقع، ومعه تسجيل رقمه.
 *
 * الرقم المعروض ما أُدخل كله — الموثَّق وما ينتظر — لأن القائد يسأل «كم
 * زرعنا؟» لا «كم اعتُمد؟». والتفصيل تحته يبقي الفرق ظاهرًا.
 *
 * العدّاد يُزاد عليه: «أضف 40 شجرة». والقراءة — منسوب، مساحة قائمة —
 * تُكتب كاملة، فلا أزرار زيادة لها.
 */
export function TargetRow({
  target,
  writable,
  onRecord,
}: {
  target: FieldTarget;
  writable: boolean;
  onRecord: (value: number, noteAr?: string) => Promise<boolean>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const counter = isCounter(target);
  const entered = enteredValue(target);
  const hasTarget = target.target !== null && target.target > 0;
  const percent = hasTarget
    ? Math.min(100, Math.round((entered / target.target!) * 100))
    : null;

  const value = parse(text, target.decimals);

  function bump(by: number) {
    const next = Math.max(0, (parse(text, target.decimals) ?? 0) + by);

    setText(next > 0 ? String(Number(next.toFixed(target.decimals))) : "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (value === null) return;

    setSaving(true);

    try {
      const saved = await onRecord(value, note.trim() || undefined);

      if (saved) {
        setText("");
        setNote("");
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {target.metricNameAr}
        </p>
        <p className="text-sm text-foreground">
          <span className="numeric text-lg font-bold text-accent-ink">
            {formatNumber(entered, target.decimals)}
          </span>
          {hasTarget ? (
            <>
              {" "}
              من{" "}
              <span className="numeric font-semibold">
                {formatNumber(target.target!, target.decimals)}
              </span>
            </>
          ) : null}{" "}
          {target.unitAr}
        </p>
      </div>

      {percent !== null ? (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`ما أُدخل من هدف ${target.metricNameAr}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[inline-size] duration-300"
            style={{ inlineSize: `${percent}%` }}
          />
        </div>
      ) : null}

      {target.unverified > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {counter ? "منها " : "القراءة "}
          <span className="numeric">
            {formatNumber(target.unverified, target.decimals)}
          </span>{" "}
          بانتظار تحقق المنسّق
        </p>
      ) : null}

      {!writable ? null : open ? (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg bg-surface p-3">
          <label
            htmlFor={`${id}-value`}
            className="block text-sm font-semibold text-foreground"
          >
            {counter
              ? `كم ${target.unitAr} تضيف الآن؟`
              : `القراءة الآن (${target.unitAr})`}
          </label>

          <div className="flex items-center gap-2">
            {counter ? (
              <StepButton
                label="أنقص"
                disabled={(value ?? 0) <= 0}
                onClick={() => bump(-1)}
              >
                <Minus aria-hidden />
              </StepButton>
            ) : null}

            <input
              id={`${id}-value`}
              inputMode={target.decimals > 0 ? "decimal" : "numeric"}
              autoComplete="off"
              enterKeyHint="done"
              dir="ltr"
              placeholder="0"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={text.trim() !== "" && value === null}
              className={cn(
                INPUT_CLASS,
                "numeric h-14 text-center text-2xl font-bold",
              )}
            />

            {counter ? (
              <StepButton label="زد" onClick={() => bump(1)}>
                <Plus aria-hidden />
              </StepButton>
            ) : null}
          </div>

          {counter ? (
            <div className="flex gap-2" role="group" aria-label="زيادة سريعة">
              {QUICK_STEPS.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => bump(quick)}
                  className="numeric h-10 flex-1 rounded-full border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  +{quick}
                </button>
              ))}
            </div>
          ) : null}

          <input
            aria-label="ملاحظة على الرقم (اختياري)"
            placeholder="ملاحظة (اختياري)"
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={INPUT_CLASS}
          />

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={saving || value === null}
            >
              {saving ? "…جارٍ الحفظ" : counter ? "أضف إلى العدد" : "سجّل القراءة"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            يُحسب في المجموع حين يتحقق منه المنسّق. أخطأت في رقم أُرسل؟ أخبر
            المنسّق ليعكسه.
          </p>
        </form>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          <Plus aria-hidden />
          {counter ? "سجّل عددًا" : "سجّل قراءة"}
        </Button>
      )}
    </li>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 [&_svg]:size-5"
    >
      {children}
    </button>
  );
}
