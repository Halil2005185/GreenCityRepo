"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, Label } from "@/components/ui/field";
import {
  type FormField,
  REF_TYPES,
  isFieldVisible,
} from "@/lib/api/forms";
import { listAreas, listPrograms } from "@/lib/api/initiatives";
import { listOffices } from "@/lib/api/invitations";

type Answers = Record<string, unknown>;

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/**
 * خيارات المراجع تأتي من كتالوجات النظام لا من السؤال.
 *
 * هذا ما يجعل «أي محافظة تسكن؟» بيانات قابلة للفرز بدل نص حر — وما يعني
 * أن إضافة محافظة إلى `areas` تظهر في كل استمارة دون لمس أي سؤال.
 */
function useRefOptions(enabled: boolean) {
  const areas = useQuery({
    queryKey: ["areas", "GOVERNORATE"],
    queryFn: () => listAreas("GOVERNORATE"),
    enabled,
  });
  const offices = useQuery({
    queryKey: ["offices"],
    queryFn: listOffices,
    enabled,
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: listPrograms,
    enabled,
  });

  return {
    AREA_REF: areas.data?.map((a) => ({ value: a.id, labelAr: a.nameAr })) ?? [],
    OFFICE_REF:
      offices.data?.map((o) => ({ value: o.id, labelAr: o.nameAr })) ?? [],
    PROGRAM_REF:
      programs.data?.map((p) => ({ value: p.id, labelAr: p.nameAr })) ?? [],
  };
}

function PreviewField({
  field,
  value,
  onChange,
  refOptions,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  refOptions: Record<string, Array<{ value: string; labelAr: string }>>;
}) {
  const id = `preview-${field.key}`;
  const label = field.isRequired ? `${field.labelAr} *` : field.labelAr;

  const options = REF_TYPES.includes(field.type)
    ? (refOptions[field.type] ?? [])
    : field.options;

  if (field.type === "BOOLEAN") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 rounded border-input"
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  return (
    <Field id={id} label={label} hint={field.hintAr ?? undefined}>
      {(props) => {
        if (field.type === "LONG_TEXT") {
          return (
            <textarea
              {...props}
              rows={3}
              value={String(value ?? "")}
              onChange={(event) => onChange(event.target.value)}
              className={`${selectClass} h-auto`}
            />
          );
        }

        if (field.type === "MULTI_SELECT") {
          const selected = Array.isArray(value) ? (value as string[]) : [];

          return (
            <div className="space-y-1.5 rounded-md border border-input p-3">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm"
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
                    className="size-4 rounded border-input"
                  />
                  {option.labelAr}
                </label>
              ))}
            </div>
          );
        }

        if (field.type === "SINGLE_SELECT" || REF_TYPES.includes(field.type)) {
          return (
            <select
              {...props}
              value={String(value ?? "")}
              onChange={(event) => onChange(event.target.value)}
              className={selectClass}
            >
              <option value="">اختر…</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.labelAr}
                </option>
              ))}
            </select>
          );
        }

        const inputType =
          field.type === "NUMBER"
            ? "number"
            : field.type === "DATE"
              ? "date"
              : field.type === "EMAIL"
                ? "email"
                : field.type === "PHONE"
                  ? "tel"
                  : "text";

        return (
          <Input
            {...props}
            type={inputType}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            {...(inputType === "text" ? {} : { dir: "ltr" as const })}
            className={inputType === "text" ? undefined : "text-start"}
          />
        );
      }}
    </Field>
  );
}

/**
 * معاينة حيّة: الشرطية تُقيَّم على إجابات المعاينة نفسها، فيرى من يبني
 * الاستمارة أثر شرطه فورًا بدل أن يكتشفه بعد النشر.
 */
export function FormPreview({ fields }: { fields: FormField[] }) {
  const [answers, setAnswers] = useState<Answers>({});

  const needsRefs = fields.some((field) => REF_TYPES.includes(field.type));
  const refOptions = useRefOptions(needsRefs);

  const visible = fields.filter((field) => isFieldVisible(field, answers));
  const hiddenCount = fields.length - visible.length;

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        لا أسئلة بعد. أضف سؤالًا لتظهر المعاينة.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {visible.map((field) => (
        <PreviewField
          key={field.id}
          field={field}
          value={answers[field.key]}
          onChange={(value) =>
            setAnswers((previous) => ({ ...previous, [field.key]: value }))
          }
          refOptions={refOptions}
        />
      ))}

      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} سؤال مخفي بشرط لم يتحقق بعد.
        </p>
      ) : null}
    </div>
  );
}
