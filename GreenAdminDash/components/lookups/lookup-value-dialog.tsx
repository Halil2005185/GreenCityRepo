"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { FormDialog } from "@/components/ui/form-dialog";
import { TextareaField, TextField } from "@/components/ui/form-fields";
import {
  type LookupCode,
  type LookupList,
  type LookupValue,
  createLookupValue,
  lookupKeys,
  updateLookupValue,
} from "@/lib/api/lookups";
import { latinize, uniqueKey } from "@/lib/text/slug";

const valueSchema = z.object({
  nameAr: z.string().trim().min(1, "اكتب الاسم.").max(160, "الاسم طويل جدًا."),
  code: z
    .string()
    .trim()
    .max(64, "الرمز طويل جدًا.")
    .regex(/^([A-Z][A-Z0-9_]*)?$/, "أحرف لاتينية كبيرة وأرقام وشرطة سفلية، ويبدأ بحرف."),
  descriptionAr: z.string().trim().max(1000, "الوصف طويل جدًا."),
});

type ValueForm = z.infer<typeof valueSchema>;

const EMPTY: ValueForm = { nameAr: "", code: "", descriptionAr: "" };

/** «نادي رياضي» ← `NADY_RYADY`؛ الفارغ يترك للخادم أن يولّد رمزًا. */
function suggestCode(nameAr: string, taken: readonly string[]) {
  const base = latinize(nameAr, "_").toUpperCase();

  if (!base) return "";

  return uniqueKey(/^[A-Z]/.test(base) ? base : `V_${base}`, taken, "_");
}

/**
 * إضافة قيمة إلى تعريف أو تعديلها، من مكانين:
 *
 * - زر «+» في القائمة المنسدلة (`detailed` غائب): الاسم وحده، كما طُلب —
 *   من يملأ نموذج جهة لا يُسأل عن رمز تقني، فيولّده الخادم.
 * - شاشة الإعدادات (`detailed`): الاسم والرمز مقترحًا من الاسم والوصف.
 *
 * بعد الحفظ تُضاف القيمة إلى مخزن القوائم فورًا ثم تُبطل البادئة كلها، فتظهر
 * في كل قائمة بالرمز نفسه على الصفحة دون إعادة تحميل.
 */
export function LookupValueDialog({
  code,
  listName,
  value,
  initialName = "",
  detailed = false,
  takenCodes = [],
  open,
  onOpenChange,
  onSaved,
}: {
  code: LookupCode;
  listName: string;
  /** `null` للإضافة. */
  value: LookupValue | null;
  initialName?: string;
  detailed?: boolean;
  takenCodes?: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (value: LookupValue) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ValueForm>({
    resolver: zodResolver(valueSchema),
    defaultValues: EMPTY,
  });
  const nameAr = useWatch({ control: form.control, name: "nameAr" });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={value ? `تعديل «${value.nameAr}»` : `إضافة قيمة إلى «${listName}»`}
      description={
        value || detailed
          ? undefined
          : "تظهر القيمة فورًا في هذه القائمة وفي كل شاشة تستعمل التعريف نفسه."
      }
      form={form}
      values={
        value
          ? { nameAr: value.nameAr, code: value.code, descriptionAr: value.descriptionAr ?? "" }
          : { ...EMPTY, nameAr: initialName }
      }
      submitLabel={value ? "حفظ" : "إضافة"}
      onSubmit={(values) => {
        if (value) {
          return updateLookupValue(code, value.id, {
            nameAr: values.nameAr,
            ...(detailed ? { descriptionAr: values.descriptionAr || null } : {}),
          });
        }

        const valueCode = detailed ? values.code || suggestCode(values.nameAr, takenCodes) : "";

        return createLookupValue(code, {
          nameAr: values.nameAr,
          ...(valueCode ? { code: valueCode } : {}),
          ...(detailed && values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
        });
      }}
      successMessage={(saved) => (value ? "حُفظ التعديل." : `أُضيفت «${saved.nameAr}».`)}
      onSuccess={(saved) => {
        if (!value) {
          queryClient.setQueryData<LookupList>(lookupKeys.options(code), (current) =>
            current ? { ...current, values: [...current.values, saved] } : current,
          );
        }

        void queryClient.invalidateQueries({ queryKey: lookupKeys.all });
        onSaved?.(saved);
      }}
    >
      <TextField control={form.control} name="nameAr" label="الاسم" maxLength={160} autoFocus />

      {detailed && !value ? (
        <TextField
          control={form.control}
          name="code"
          label="الرمز (اختياري)"
          hint="اتركه فارغًا ليُشتق من الاسم. لا يتغيّر بعد الحفظ."
          dir="ltr"
          className="text-start font-mono"
          placeholder={nameAr.trim() ? suggestCode(nameAr, takenCodes) : "SPORTS_CLUB"}
        />
      ) : null}

      {detailed && value ? (
        <p className="text-xs text-muted-foreground">
          الرمز <span dir="ltr" className="font-mono">{value.code}</span> ثابت لا يتغيّر.
        </p>
      ) : null}

      {detailed ? (
        <TextareaField
          control={form.control}
          name="descriptionAr"
          label="وصف (اختياري)"
          hint="متى تُختار هذه القيمة."
          rows={3}
        />
      ) : null}
    </FormDialog>
  );
}
