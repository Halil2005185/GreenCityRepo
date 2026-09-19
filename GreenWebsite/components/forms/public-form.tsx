"use client";

import { useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { PublicForm, PublicFormField } from "@/lib/api/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const PHONE_PATTERN = /^[+]?[\d\s()-]{6,32}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * الإرسال من متصفح الزائر مباشرةً إلى الـAPI، لا عبر خادم الموقع.
 *
 * حدّ الطلبات وبصمة العنوان يُحسبان من عنوان المُرسِل: لو مرّ كل شيء عبر
 * خادم الموقع لصار المتقدّمون كلهم عنوانًا واحدًا، فيُحجب الثاني ويُقرأ
 * الطلب مكرّرًا. والثمن سطرٌ في `CORS_ORIGINS` على الخادم.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

type Value = string | string[] | boolean;
type Values = Record<string, Value>;

const isBlank = (value: Value | undefined) =>
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * نسخة من تقييم الشرط في الخادم، حرفًا بحرف.
 *
 * التكرار مقصود ولا يغني عن الأصل: هذه للتجربة — سؤال يظهر ويختفي وأنت
 * تكتب — والحقيقة هناك، لأن الطلب قد لا يأتي من هذه الصفحة أصلًا. ولأن
 * الخادم يرفض إجابةً على سؤال مخفي، يجب أن يتطابق الحكمان وإلا رُدّ طلب
 * صحيح في نظر الزائر.
 */
function isVisible(field: PublicFormField, values: Values): boolean {
  if (!field.condition) return true;

  const value = values[field.condition.fieldKey];

  if (field.condition.op === "notEmpty") return !isBlank(value);

  if (field.condition.op === "in") {
    const allowed = (field.condition.value ?? []) as string[];

    return Array.isArray(value)
      ? value.some((item) => allowed.includes(String(item)))
      : allowed.includes(String(value));
  }

  // `eq` على إجابة متعددة تعني «اختار هذا الخيار» لا «اختاره وحده».
  if (Array.isArray(value)) {
    return value.map(String).includes(String(field.condition.value ?? ""));
  }

  return String(value ?? "") === String(field.condition.value ?? "");
}

const FIELD_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive";

/** أنواع النص التي يفهمها المتصفح فيتحقق منها ويعرض لوحة الإدخال المناسبة. */
const INPUT_TYPES: Partial<Record<PublicFormField["type"], string>> = {
  EMAIL: "email",
  PHONE: "tel",
  URL: "url",
  NUMBER: "number",
  DATE: "date",
};

export function PublicFormRenderer({ form }: { form: PublicForm }) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sendCopy, setSendCopy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<{ copiedTo: string | null } | null>(null);

  const emailField = useMemo(
    () => form.fields.find((field) => field.isContactEmail) ?? null,
    [form.fields],
  );

  const visible = form.fields.filter((field) => isVisible(field, values));
  const contactEmail = emailField
    ? String(values[emailField.key] ?? "").trim()
    : "";

  function setValue(key: string, value: Value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;

      const next = { ...current };

      delete next[key];

      return next;
    });
  }

  function getFieldZodValidator(field: PublicFormField): z.ZodTypeAny {
    switch (field.type) {
      case "EMAIL":
        return z
          .string()
          .trim()
          .regex(EMAIL_PATTERN, "صيغة البريد الإلكتروني غير صحيحة.");

      case "PHONE":
        return z
          .string()
          .trim()
          .regex(PHONE_PATTERN, "صيغة رقم الهاتف غير صحيحة.");

      case "URL":
        return z
          .string()
          .trim()
          .regex(URL_PATTERN, "الرابط غير صحيح (يجب أن يبدأ بـ http:// أو https://).");

      case "DATE":
        return z
          .string()
          .trim()
          .regex(DATE_PATTERN, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD.");

      case "NUMBER":
        return z
          .unknown()
          .transform((val) => (typeof val === "string" ? val.trim() : val))
          .refine((val) => {
            const num = typeof val === "number" ? val : Number(val);
            return Number.isFinite(num);
          }, "القيمة يجب أن تكون رقمًا.");

      case "BOOLEAN":
        return z.boolean({ message: "القيمة يجب أن تكون نعم أو لا." });

      case "MULTI_SELECT": {
        let arr = z.array(z.string());
        if (field.minSelections) {
          arr = arr.min(
            field.minSelections,
            `اختر ${field.minSelections} على الأقل.`,
          );
        }
        if (field.maxSelections) {
          arr = arr.max(
            field.maxSelections,
            `اختر ${field.maxSelections} على الأكثر.`,
          );
        }
        return arr;
      }

      case "SINGLE_SELECT":
      case "AREA_REF":
      case "OFFICE_REF":
      case "PROGRAM_REF":
        return z.string().trim();

      case "TEXT":
      case "LONG_TEXT":
      default: {
        let str = z.string().trim();
        if (field.maxLength) {
          str = str.max(field.maxLength, `الحد الأقصى ${field.maxLength} حرفًا.`);
        }
        return str;
      }
    }
  }

  /**
   * تحقّق أولي في المتصفح باستخدام Zod ليقف الخطأ عند سؤاله بدل رحلة إلى الخادم.
   */
  function validate() {
    const found: Record<string, string> = {};

    for (const field of visible) {
      const raw = values[field.key];
      const empty = isBlank(raw);

      if (field.isRequired && empty && typeof raw !== "boolean") {
        found[field.key] = "هذا السؤال مطلوب.";
        continue;
      }

      if (empty) {
        continue;
      }

      const validator = getFieldZodValidator(field);
      const parsed = validator.safeParse(raw);
      if (!parsed.success) {
        found[field.key] =
          parsed.error.issues[0]?.message ?? "قيمة غير صالحة.";
      }
    }

    setErrors(found);

    return Object.keys(found).length === 0;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    if (!validate()) return;

    // المخفيّ لا يُرسل: الخادم يرفض إجابةً على سؤال لا يظهر.
    const answers: Record<string, unknown> = {};

    for (const field of visible) {
      const value = values[field.key];

      if (isBlank(value)) continue;

      answers[field.key] =
        field.type === "NUMBER" && typeof value === "string"
          ? Number(value.trim())
          : typeof value === "string"
            ? value.trim()
            : value;
    }

    setSending(true);

    try {
      const response = await fetch(
        `${API_ORIGIN}/api/public/forms/${encodeURIComponent(form.slug)}/submissions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            answers,
            ...(sendCopy && contactEmail ? { sendCopy: true } : {}),
          }),
        },
      );

      if (response.status === 202) {
        setSentTo({ copiedTo: sendCopy && contactEmail ? contactEmail : null });
        return;
      }

      const problem = (await response.json().catch(() => null)) as {
        detail?: string;
        details?: Array<{ path?: string; message?: string }>;
      } | null;

      if (response.status === 422 && Array.isArray(problem?.details)) {
        const issues: Record<string, string> = {};

        for (const issue of problem.details) {
          if (issue.path && issue.message) issues[issue.path] = issue.message;
        }

        setErrors(issues);
        setFailure("راجع الأسئلة المعلَّمة بالأحمر.");
        return;
      }

      setFailure(
        response.status === 429
          ? "أرسلتَ طلبات كثيرة في وقت قصير. جرّب بعد قليل."
          : (problem?.detail ?? "تعذّر إرسال الطلب. حاول مرة أخرى."),
      );
    } catch {
      setFailure("تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.");
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-6">
        <h2 className="text-lg font-bold text-primary">وصلنا طلبك</h2>
        <p className="mt-2 text-sm leading-loose text-muted-foreground">
          شكرًا لك. سنراجع ما أرسلته ونتواصل معك إن احتجنا تفاصيل أكثر.
          {sentTo.copiedTo ? (
            <>
              {" "}
              وأرسلنا نسخة من إجاباتك إلى{" "}
              <span dir="ltr" className="font-medium text-foreground">
                {sentTo.copiedTo}
              </span>
              .
            </>
          ) : null}
        </p>
      </div>
    );
  }

  if (!form.isAccepting) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-bold">الاستمارة مغلقة حاليًا</h2>
        <p className="mt-2 text-sm leading-loose text-muted-foreground">
          لا تستقبل هذه الاستمارة طلبات في الوقت الحالي. تابعنا لتعرف موعد
          فتحها من جديد.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {failure ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : null}

      {visible.map((field) => {
        const error = errors[field.key];
        const describedBy = [
          field.hintAr ? `${field.key}-hint` : null,
          error ? `${field.key}-error` : null,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={field.key} className="space-y-2">
            <label
              htmlFor={field.key}
              className="block text-sm font-medium text-foreground"
            >
              {field.labelAr}
              {field.isRequired ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </label>

            {field.hintAr ? (
              <p id={`${field.key}-hint`} className="text-xs text-muted-foreground">
                {field.hintAr}
              </p>
            ) : null}

            <FieldControl
              field={field}
              value={values[field.key]}
              invalid={Boolean(error)}
              describedBy={describedBy || undefined}
              onChange={(value) => setValue(field.key, value)}
            />

            {error ? (
              <p
                id={`${field.key}-error`}
                role="alert"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      {emailField ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendCopy}
              onChange={(event) => setSendCopy(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>أرسل لي نسخة من إجاباتي على بريدي.</span>
          </label>

          {sendCopy && !contactEmail ? (
            <p className="mt-2 text-xs text-muted-foreground">
              اكتب بريدك في «{emailField.labelAr}» لتصلك النسخة.
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={sending} className="w-full sm:w-auto">
        {sending ? "…جارٍ الإرسال" : "إرسال الطلب"}
      </Button>

      <p className="text-xs leading-loose text-muted-foreground">
        تُستعمل بياناتك لغرض هذه الاستمارة وحدها، ولا تُنشر ولا تُشارك مع جهة
        خارجية.
      </p>
    </form>
  );
}

function FieldControl({
  field,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  field: PublicFormField;
  value: Value | undefined;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: Value) => void;
}) {
  const shared = {
    id: field.key,
    name: field.key,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
    className: FIELD_CLASS,
  };

  if (field.type === "LONG_TEXT") {
    return (
      <textarea
        {...shared}
        rows={4}
        maxLength={field.maxLength ?? undefined}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === "BOOLEAN") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          id={field.key}
          name={field.key}
          type="checkbox"
          aria-describedby={describedBy}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        <span className="text-muted-foreground">نعم</span>
      </label>
    );
  }

  if (field.type === "SINGLE_SELECT") {
    return (
      <select
        {...shared}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">اختر…</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.labelAr}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value : [];

    return (
      <div
        role="group"
        aria-describedby={describedBy}
        className="space-y-2 rounded-lg border border-border bg-background p-3"
      >
        {field.options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
              className="size-4 accent-[var(--primary)]"
            />
            {option.labelAr}
          </label>
        ))}
      </div>
    );
  }

  /**
   * المراجع تصل بخياراتها من الخادم كبقية القوائم، فتُعرض قائمةً لا حقل
   * نصّ: معرّف يكتبه الزائر بيده لا يعني شيئًا.
   */
  if (field.options.length > 0) {
    return (
      <select
        {...shared}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">اختر…</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.labelAr}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      {...shared}
      type={INPUT_TYPES[field.type] ?? "text"}
      dir={field.type === "EMAIL" || field.type === "URL" ? "ltr" : undefined}
      maxLength={field.maxLength ?? undefined}
      value={String(value ?? "")}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
