"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import {
  CONDITION_OP_LABELS,
  CONTACT_ROLE_LABELS,
  CONTACT_ROLE_TYPES,
  FIELD_TYPE_LABELS,
  type ContactRole,
  type FieldCondition,
  type FieldInput,
  type FieldType,
  type FormField,
  SELECT_TYPES,
  TEXT_TYPES,
} from "@/lib/api/forms";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

type Option = { value: string; labelAr: string };

/**
 * محرّر سؤال واحد.
 *
 * `earlierFields` هي وحدها ما يُعرض في قائمة الشرط: الحد الرابع في
 * PLAN.md يمنع الإشارة إلى سؤال لاحق، والخادم يرفضها — فحجبها من القائمة
 * أصلًا أفضل من رسالة خطأ بعد المحاولة.
 */
export function FieldEditor({
  field,
  earlierFields,
  saving,
  onSubmit,
}: {
  field: FormField | null;
  earlierFields: FormField[];
  saving: boolean;
  onSubmit: (input: FieldInput) => void;
}) {
  const [key, setKey] = useState(field?.key ?? "");
  const [labelAr, setLabelAr] = useState(field?.labelAr ?? "");
  const [hintAr, setHintAr] = useState(field?.hintAr ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "TEXT");
  const [isRequired, setIsRequired] = useState(field?.isRequired ?? false);
  const [options, setOptions] = useState<Option[]>(field?.options ?? []);
  const num = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  const [minSelections, setMinSelections] = useState(num(field?.minSelections));
  const [maxSelections, setMaxSelections] = useState(num(field?.maxSelections));
  const [maxLength, setMaxLength] = useState(num(field?.maxLength));
  const [contactRole, setContactRole] = useState<ContactRole | "">(
    field?.contactRole ?? "",
  );

  const [conditionKey, setConditionKey] = useState(
    field?.condition?.fieldKey ?? "",
  );
  const [conditionOp, setConditionOp] = useState<FieldCondition["op"]>(
    field?.condition?.op ?? "notEmpty",
  );
  const [conditionValue, setConditionValue] = useState(
    field?.condition && field.condition.op !== "notEmpty"
      ? Array.isArray(field.condition.value)
        ? field.condition.value.join(", ")
        : String(field.condition.value)
      : "",
  );

  const needsOptions = SELECT_TYPES.includes(type);

  /**
   * الأدوار المتاحة لهذا النوع وحدها.
   *
   * الخادم يرفض «بريد المتقدّم» على سؤال نصّي — ونسخُ نصّ حر إلى عمود بريد
   * يعني ملفًا لا يُراسَل صاحبه. وحصر القائمة أوضح من رسالة رفض بعد الحفظ.
   */
  const roleFor = Object.fromEntries(
    Object.entries(CONTACT_ROLE_TYPES).filter(([, allowed]) => allowed === type),
  ) as Partial<Record<ContactRole, FieldType>>;
  const conditionSource = earlierFields.find(
    (item) => item.key === conditionKey,
  );

  const buildCondition = (): FieldCondition | null => {
    if (!conditionKey) return null;

    if (conditionOp === "notEmpty") {
      return { fieldKey: conditionKey, op: "notEmpty" };
    }

    if (conditionOp === "in") {
      return {
        fieldKey: conditionKey,
        op: "in",
        value: conditionValue
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      } as FieldCondition;
    }

    return {
      fieldKey: conditionKey,
      op: "eq",
      value: conditionValue.trim(),
    } as FieldCondition;
  };

  const submit = () => {
    onSubmit({
      key: key.trim(),
      labelAr: labelAr.trim(),
      hintAr: hintAr.trim() || null,
      type,
      isRequired,
      // الحدود تخص أنواعها وحدها؛ إرسالها على غيرها يرفضه الخادم.
      minSelections:
        type === "MULTI_SELECT" && minSelections ? Number(minSelections) : null,
      maxSelections:
        type === "MULTI_SELECT" && maxSelections ? Number(maxSelections) : null,
      maxLength:
        TEXT_TYPES.includes(type) && maxLength ? Number(maxLength) : null,
      options: needsOptions ? options : [],
      // الدور يسقط مع نوعه: بريدٌ صار نصًّا حرًّا لا يُنسخ إلى عمود البريد.
      contactRole: contactRole && contactRole in roleFor ? contactRole : null,
      condition: buildCondition(),
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="field-label" label="نص السؤال">
          {(props) => (
            <Input
              {...props}
              // التركيز عند فتح المحرّر: النقر على «تعديل» يجب أن يُرى أثره.
              autoFocus
              value={labelAr}
              onChange={(event) => setLabelAr(event.target.value)}
              placeholder="ما اسمك الكامل؟"
            />
          )}
        </Field>

        <Field
          id="field-key"
          label="المفتاح"
          hint="ثابت لا يتغير بعد النشر — به تُقرأ الإجابة."
        >
          {(props) => (
            <Input
              {...props}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              dir="ltr"
              className="text-start"
              placeholder="full_name"
            />
          )}
        </Field>
      </div>

      <Field id="field-hint" label="تلميح (اختياري)">
        {(props) => (
          <Input
            {...props}
            value={hintAr}
            onChange={(event) => setHintAr(event.target.value)}
          />
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="field-type">النوع</Label>
          <select
            id="field-type"
            value={type}
            onChange={(event) => setType(event.target.value as FieldType)}
            className={selectClass}
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(event) => setIsRequired(event.target.checked)}
              className="size-4 rounded border-input"
            />
            إجابة إلزامية
          </label>
        </div>
      </div>

      {type === "MULTI_SELECT" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="field-min" label="أقل عدد اختيارات">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                value={minSelections}
                onChange={(event) => setMinSelections(event.target.value)}
                placeholder="بلا حد"
              />
            )}
          </Field>

          <Field id="field-max" label="أكثر عدد اختيارات">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                value={maxSelections}
                onChange={(event) => setMaxSelections(event.target.value)}
                placeholder="بلا حد"
              />
            )}
          </Field>
        </div>
      ) : null}

      {TEXT_TYPES.includes(type) ? (
        <Field
          id="field-maxlen"
          label="حد الأحرف"
          hint="يُفرض على الخادم أيضًا، لا في المتصفح وحده."
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              value={maxLength}
              onChange={(event) => setMaxLength(event.target.value)}
              placeholder="بلا حد"
            />
          )}
        </Field>
      ) : null}

      {needsOptions ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">الخيارات</p>

          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={option.labelAr}
                onChange={(event) =>
                  setOptions((previous) =>
                    previous.map((item, position) =>
                      position === index
                        ? { ...item, labelAr: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="النص المعروض"
              />

              <Input
                value={option.value}
                onChange={(event) =>
                  setOptions((previous) =>
                    previous.map((item, position) =>
                      position === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
                dir="ltr"
                className="text-start"
                placeholder="VALUE"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="حذف الخيار"
                onClick={() =>
                  setOptions((previous) =>
                    previous.filter((_, position) => position !== index),
                  )
                }
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setOptions((previous) => [...previous, { value: "", labelAr: "" }])
            }
          >
            <Plus className="size-4" aria-hidden />
            خيار
          </Button>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">
          شرط الظهور (اختياري)
        </p>

        {earlierFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا سؤال يسبقه ليُشترط عليه.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              aria-label="السؤال المشروط عليه"
              value={conditionKey}
              onChange={(event) => setConditionKey(event.target.value)}
              className={selectClass}
            >
              <option value="">بلا شرط — يظهر دائمًا</option>
              {earlierFields.map((item) => (
                <option key={item.id} value={item.key}>
                  {item.labelAr}
                </option>
              ))}
            </select>

            <select
              aria-label="العملية"
              value={conditionOp}
              disabled={!conditionKey}
              onChange={(event) =>
                setConditionOp(event.target.value as FieldCondition["op"])
              }
              className={selectClass}
            >
              {Object.entries(CONDITION_OP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            {conditionOp === "notEmpty" ? (
              <p className="self-center text-xs text-muted-foreground">
                يكفي أن يُجاب عليه.
              </p>
            ) : (
              <Input
                aria-label="القيمة"
                value={conditionValue}
                disabled={!conditionKey}
                onChange={(event) => setConditionValue(event.target.value)}
                placeholder={
                  conditionOp === "in" ? "قيم مفصولة بفاصلة" : "القيمة"
                }
                dir="ltr"
                className="text-start"
              />
            )}
          </div>
        )}

        {conditionSource && SELECT_TYPES.includes(conditionSource.type) ? (
          <p className="text-xs text-muted-foreground">
            قيم «{conditionSource.labelAr}»:{" "}
            <span dir="ltr">
              {conditionSource.options.map((o) => o.value).join(" · ")}
            </span>
          </p>
        ) : null}
      </div>

      {Object.keys(roleFor).length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="field-contact-role">دور السؤال في ملف المتقدّم</Label>

          <select
            id="field-contact-role"
            className={selectClass}
            value={contactRole}
            onChange={(event) =>
              setContactRole(event.target.value as ContactRole | "")
            }
          >
            <option value="">لا دور — سؤال عادي</option>
            {Object.keys(roleFor).map((role) => (
              <option key={role} value={role}>
                {CONTACT_ROLE_LABELS[role as ContactRole]}
              </option>
            ))}
          </select>

          <p className="text-xs text-muted-foreground">
            يُستخرج إلى عمود مستقل فيصير الطلب قابلًا للفرز، ودور البريد هو
            الذي تصله نسخة الطلب.
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        loading={saving}
        disabled={!key.trim() || !labelAr.trim()}
        onClick={submit}
      >
        حفظ السؤال
      </Button>
    </div>
  );
}
