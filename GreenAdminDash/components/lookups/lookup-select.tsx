"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
  type PathValue,
  type UseFormReturn,
} from "react-hook-form";

import { LookupValueDialog } from "@/components/lookups/lookup-value-dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Select, type SelectAction, type SelectOption } from "@/components/ui/select";
import {
  type LookupCode,
  type LookupRef,
  type LookupValue,
  getLookup,
  lookupKeys,
} from "@/lib/api/lookups";

/**
 * القيم النشطة لتعريف، مشتركة بين كل القوائم بالرمز نفسه عبر مخزن
 * الاستعلامات. خمس دقائق كالمرجعيات قبلها: القيم تتغير نادرًا، وما يُضاف
 * من هذا المتصفح يُدرج في المخزن فورًا لا بعد انقضائها.
 */
export function useLookup(code: LookupCode) {
  return useQuery({
    queryKey: lookupKeys.options(code),
    queryFn: () => getLookup(code),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * يضع في حقل النموذج القيمة المقفلة التي يضعها الخادم نفسه حين لا تُرسل —
 * الأولوية `MEDIUM` — فتظهر مختارة بدل حقل فارغ يوحي بأن لا أولوية.
 *
 * أثر لا قيمة فتح: القيم قد تصل بعد أن تُفتح النافذة ويُضبط نموذجها، فيُملأ
 * الحقل حين تصل ما دام فارغًا، ولا يُمسّ ما اختاره المستخدم.
 */
export function useLookupDefault<T extends FieldValues>(
  form: UseFormReturn<T>,
  name: FieldPath<T>,
  code: LookupCode,
  valueCode: string,
  active: boolean,
) {
  const lookup = useLookup(code);
  const id = lookup.data?.values.find((value) => value.code === valueCode)?.id;

  useEffect(() => {
    if (active && id && !form.getValues(name)) {
      form.setValue(name, id as PathValue<T, FieldPath<T>>);
    }
  }, [active, id, form, name]);
}

/** تسمية قيمة على سجل؛ المعطّلة معلَّمة كي لا تُقرأ كأنها سارية. */
export function lookupLabel(ref: LookupRef) {
  return ref.isActive ? ref.nameAr : `${ref.nameAr} (معطّلة)`;
}

function refOption(ref: LookupRef): SelectOption {
  return { value: ref.id, label: lookupLabel(ref) };
}

function valueOption(value: LookupValue): SelectOption {
  return {
    value: value.id,
    label: value.nameAr,
    ...(value.descriptionAr ? { description: value.descriptionAr } : {}),
    keywords: [value.code],
  };
}

type CommonProps = {
  code: LookupCode;
  id?: string;
  placeholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  size?: "default" | "sm";
  /** بادئة المرشح في شريط الأدوات: «الأولوية: الكل». */
  label?: string;
  /**
   * زر «＋ إضافة» في ذيل القائمة، لمن يحرّر التعريف. الحقول تريده؛ المرشحات
   * لا — قيمة جديدة لا سجل عليها لا تصفّي شيئًا.
   */
  creatable?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
};

type SingleProps = CommonProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
  /** القيمة كما على السجل — تسمية قيمة عُطّلت بعد أن صُنّف بها. */
  selected?: LookupRef | null;
};

type MultiProps = CommonProps & {
  multiple: true;
  value: readonly string[];
  onChange: (values: string[]) => void;
  selected?: readonly LookupRef[];
};

export type LookupSelectProps = SingleProps | MultiProps;

/**
 * قائمة منسدلة مربوطة بتعريف من تعريفات النظام برمزه وحده:
 * `<LookupSelect code="ORGANIZATION_KIND" … />`.
 *
 * لا تعرف الشاشة ولا مكانها فيها؛ كل قائمة بالرمز نفسه تقرأ القيم نفسها،
 * وما يُعدَّل في «الإعدادات ← تعريفات النظام» يظهر فيها كلها. فوق `Select`
 * المشترك لا بديلًا عنه: البحث ولوحة المفاتيح والاختيار المتعدد منه.
 *
 * قيم النظام (`STAGE_CHANGE`) لا تظهر: يكتبها الخادم وحده ويرفضها من
 * المستخدم. والمعطّلة لا تظهر إلا قيمةً حاليةً على السجل، بعلامتها.
 */
export function LookupSelect(props: LookupSelectProps) {
  const {
    code,
    creatable = true,
    placeholder = "اختر…",
    emptyText = "لا قيم مطابقة",
    ...rest
  } = props;
  const lookup = useLookup(code);
  const [adding, setAdding] = useState<string | null>(null);

  const options = useMemo(
    () => (lookup.data?.values ?? []).filter((value) => !value.isSystem).map(valueOption),
    [lookup.data],
  );

  const action: SelectAction | undefined =
    creatable && lookup.data?.canEdit && !props.disabled
      ? {
          label: (search) => (search ? `إضافة «${search}»` : "إضافة قيمة جديدة"),
          onSelect: (search) => setAdding(search),
        }
      : undefined;

  function added(value: LookupValue) {
    if (props.multiple) props.onChange([...props.value, value.id]);
    else props.onChange(value.id);
  }

  const shared = {
    id: rest.id,
    options,
    placeholder,
    searchPlaceholder: "ابحث…",
    emptyText,
    searchable: true as const,
    clearable: rest.clearable,
    disabled: rest.disabled,
    loading: lookup.isPending,
    size: rest.size,
    label: rest.label,
    action,
    className: rest.className,
    "aria-invalid": rest["aria-invalid"],
    "aria-describedby": rest["aria-describedby"],
    "aria-label": rest["aria-label"],
  };

  return (
    <>
      {props.multiple ? (
        <Select
          {...shared}
          multiple
          value={props.value}
          selectedOptions={props.selected?.map(refOption)}
          onChange={(values) => props.onChange(values)}
        />
      ) : (
        <Select
          {...shared}
          value={props.value}
          selectedOption={props.selected ? refOption(props.selected) : null}
          onChange={(value) => props.onChange(value)}
        />
      )}

      {action ? (
        <LookupValueDialog
          code={code}
          listName={lookup.data?.nameAr ?? ""}
          value={null}
          initialName={adding ?? ""}
          open={adding !== null}
          onOpenChange={(open) => {
            if (!open) setAdding(null);
          }}
          onSaved={added}
        />
      ) : null}
    </>
  );
}

type FieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
} & (
  | (Omit<SingleProps, "value" | "onChange" | "id" | "label"> & { multiple?: false })
  | (Omit<MultiProps, "value" | "onChange" | "id" | "label"> & { multiple: true })
);

/**
 * `LookupSelect` داخل نموذج react-hook-form. القيمة معرّف (أو مصفوفة
 * معرّفات)، والفارغ `""` لا `null` كما في `SelectField`، واسم الحقل اسمه في
 * جسم الطلب، فيصل خطأ الخادم «القيمة معطّلة» إلى حقله.
 */
export function LookupSelectField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  ...selectProps
}: FieldProps<T>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field id={id} label={label} hint={hint} error={fieldState.error?.message}>
          {(aria) =>
            selectProps.multiple ? (
              <LookupSelect
                {...selectProps}
                {...aria}
                multiple
                value={(field.value as string[] | undefined) ?? []}
                onChange={(values) => {
                  field.onChange(values);
                  field.onBlur();
                }}
              />
            ) : (
              <LookupSelect
                {...selectProps}
                {...aria}
                multiple={false}
                value={(field.value as string | undefined) || null}
                onChange={(value) => {
                  field.onChange(value ?? "");
                  field.onBlur();
                }}
              />
            )
          }
        </Field>
      )}
    />
  );
}

/**
 * ألوان بعض القيم برمزها. عرضٌ لا منطق: قيمة يضيفها الفريق تظهر محايدة،
 * والتسمية من القاعدة دائمًا لا من هنا.
 */
const TONES: Partial<Record<LookupCode, Record<string, BadgeTone>>> = {
  CONTACT_PRIORITY: { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" },
};

export function LookupBadge({
  code,
  value,
  className,
}: {
  code: LookupCode;
  value: LookupRef;
  className?: string;
}) {
  return (
    <Badge tone={TONES[code]?.[value.code] ?? "neutral"} className={className}>
      {lookupLabel(value)}
    </Badge>
  );
}
