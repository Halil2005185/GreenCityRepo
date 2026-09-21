"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { IconButton } from "@/components/ui/actions";
import { Button } from "@/components/ui/button";
import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import { CheckboxField, SelectField, TextField } from "@/components/ui/form-fields";
import type { SelectOption } from "@/components/ui/select";
import {
  CONDITION_OP_LABELS,
  CONTACT_ROLE_LABELS,
  CONTACT_ROLE_TYPES,
  FIELD_TYPE_LABELS,
  SELECT_TYPES,
  TEXT_TYPES,
  addField,
  updateField,
  type ContactRole,
  type FieldCondition,
  type FieldInput,
  type FieldType,
  type FormField,
} from "@/lib/api/forms";
import { latinize, uniqueKey } from "@/lib/text/slug";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const TYPE_OPTIONS: SelectOption[] = Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const OP_OPTIONS: SelectOption[] = Object.entries(CONDITION_OP_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const BOOLEAN_VALUES = [
  { value: "true", labelAr: "نعم" },
  { value: "false", labelAr: "لا" },
];

/** مفتاح السؤال بقواعد الخادم: يبدأ بحرف لاتيني، وبشرطة سفلية لا وصلة. */
function suggestKey(labelAr: string, taken: readonly string[]) {
  const base = latinize(labelAr, "_").slice(0, 50);
  const valid = /^[a-z]/.test(base) ? base : base ? `q_${base}` : "question";

  return uniqueKey(valid, taken, "_");
}

const numberText = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max), {
      message: `عدد صحيح من 1 إلى ${max}.`,
    });

/**
 * قواعد الخادم (`fieldBodySchema`) منقولة إلى النموذج: خطأ يظهر تحت حقله
 * قبل الإرسال خير من رفض بعده. الخادم يبقى المرجع، وأخطاؤه تصل إلى الحقل
 * نفسه لأن الأسماء أسماء العقد.
 */
const questionSchema = z
  .object({
    labelAr: z.string().trim().min(1, "اكتب نص السؤال.").max(300, "النص طويل جدًا."),
    key: z.union([
      z
        .string()
        .trim()
        .min(2, "المفتاح قصير جدًا.")
        .max(60, "المفتاح طويل جدًا.")
        .regex(/^[a-z][a-z0-9_]*$/, "يبدأ بحرف لاتيني صغير، ثم حروف صغيرة وأرقام وشرطة سفلية."),
      z.literal(""),
    ]),
    hintAr: z.string().trim().max(300, "التلميح طويل جدًا."),
    type: z.string(),
    isRequired: z.boolean(),
    minSelections: numberText(100),
    maxSelections: numberText(100),
    maxLength: numberText(10000),
    options: z.array(
      z.object({
        labelAr: z.string().trim().min(1, "اكتب نص الخيار.").max(160, "النص طويل جدًا."),
        value: z.string().trim().max(80, "القيمة طويلة جدًا."),
      }),
    ),
    contactRole: z.string(),
    conditionKey: z.string(),
    conditionOp: z.enum(["eq", "in", "notEmpty"]),
    conditionValue: z.string().trim().max(160, "القيمة طويلة جدًا."),
    conditionValues: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    const isSelect = SELECT_TYPES.includes(values.type as FieldType);

    if (isSelect && values.options.length === 0) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "أضف خيارًا واحدًا على الأقل." });
    }

    const min = values.minSelections ? Number(values.minSelections) : null;
    const max = values.maxSelections ? Number(values.maxSelections) : null;

    if (min !== null && max !== null && max < min) {
      ctx.addIssue({ code: "custom", path: ["maxSelections"], message: "الحد الأقصى لا يقل عن الأدنى." });
    }

    if (max !== null && values.options.length > 0 && max > values.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["maxSelections"],
        message: "الحد الأقصى أكبر من عدد الخيارات المتاحة.",
      });
    }

    if (values.conditionKey && values.conditionOp === "eq" && !values.conditionValue) {
      ctx.addIssue({ code: "custom", path: ["conditionValue"], message: "حدّد القيمة." });
    }

    if (
      values.conditionKey &&
      values.conditionOp === "in" &&
      values.conditionValues.length === 0 &&
      !values.conditionValue
    ) {
      ctx.addIssue({ code: "custom", path: ["conditionValues"], message: "حدّد قيمة واحدة على الأقل." });
    }
  });

type QuestionValues = z.infer<typeof questionSchema>;

const EMPTY: QuestionValues = {
  labelAr: "",
  key: "",
  hintAr: "",
  type: "TEXT",
  isRequired: false,
  minSelections: "",
  maxSelections: "",
  maxLength: "",
  options: [],
  contactRole: "",
  conditionKey: "",
  conditionOp: "notEmpty",
  conditionValue: "",
  conditionValues: [],
};

function valuesOf(field: FormField): QuestionValues {
  const text = (value: number | null) => (value === null ? "" : String(value));
  const condition = field.condition;

  return {
    labelAr: field.labelAr,
    key: field.key,
    hintAr: field.hintAr ?? "",
    type: field.type,
    isRequired: field.isRequired,
    minSelections: text(field.minSelections),
    maxSelections: text(field.maxSelections),
    maxLength: text(field.maxLength),
    options: field.options.map((option) => ({ labelAr: option.labelAr, value: option.value })),
    contactRole: field.contactRole ?? "",
    conditionKey: condition?.fieldKey ?? "",
    conditionOp: condition?.op ?? "notEmpty",
    conditionValue: condition?.op === "eq" ? String(condition.value) : "",
    conditionValues: condition?.op === "in" ? (condition.value as unknown as string[]) : [],
  };
}

/** خيارات السؤال المشروط عليه، إن كانت له خيارات تُختار منها القيمة. */
function sourceChoices(source: FormField | undefined) {
  if (!source) return null;
  if (source.type === "BOOLEAN") return BOOLEAN_VALUES;
  if (SELECT_TYPES.includes(source.type)) return source.options;

  return null;
}

/**
 * محرّر السؤال في لوحة جانبية بطول الشاشة بدل نموذج يُفتح أسفل قائمة
 * طويلة: النقر على «تعديل» يُرى أثره فورًا، ولا يضيع موضع القائمة.
 *
 * القوائم تأتي من أسئلة تسبقه وحدها: الشرط لا يشير إلى سؤال لاحق (والخادم
 * يرفضه)، فحجبها من القائمة أصلًا أفضل من رسالة بعد المحاولة. والمفاتيح
 * تُشتق من النص حين تُترك فارغة، وقيم الخيارات كذلك.
 */
export function QuestionSheet({
  formId,
  field,
  fields,
  ...props
}: DialogProps & {
  formId: string;
  /** `null` لسؤال جديد يُضاف آخرًا. */
  field: FormField | null;
  /** أسئلة المسوّدة كلها بترتيبها. */
  fields: readonly FormField[];
}) {
  const queryClient = useQueryClient();
  const form = useForm<QuestionValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: EMPTY,
  });
  const options = useFieldArray({ control: form.control, name: "options" });
  const [type, labelAr, conditionKey, conditionOp] = useWatch({
    control: form.control,
    name: ["type", "labelAr", "conditionKey", "conditionOp"],
  });

  const earlier = field ? fields.filter((item) => item.displayOrder < field.displayOrder) : fields;
  const takenKeys = fields.filter((item) => item.id !== field?.id).map((item) => item.key);
  const isSelect = SELECT_TYPES.includes(type as FieldType);
  const source = earlier.find((item) => item.key === conditionKey);
  const choices = sourceChoices(source);

  /**
   * الأدوار المتاحة لهذا النوع وحدها: الخادم يرفض «بريد المتقدّم» على سؤال
   * نصّي — ونسخُ نصّ حر إلى عمود بريد يعني ملفًا لا يُراسَل صاحبه.
   */
  const roles = (Object.keys(CONTACT_ROLE_TYPES) as ContactRole[]).filter(
    (role) => CONTACT_ROLE_TYPES[role] === type,
  );

  function buildCondition(values: QuestionValues): FieldCondition | null {
    if (!values.conditionKey) return null;

    if (values.conditionOp === "notEmpty") return { fieldKey: values.conditionKey, op: "notEmpty" };

    if (values.conditionOp === "in") {
      const list =
        values.conditionValues.length > 0
          ? values.conditionValues
          : values.conditionValue.split(",").map((item) => item.trim()).filter(Boolean);

      return { fieldKey: values.conditionKey, op: "in", value: list } as unknown as FieldCondition;
    }

    return { fieldKey: values.conditionKey, op: "eq", value: values.conditionValue } as FieldCondition;
  }

  function toInput(values: QuestionValues): FieldInput {
    const fieldType = values.type as FieldType;
    const optionValues: string[] = [];

    return {
      key: values.key || suggestKey(values.labelAr, takenKeys),
      labelAr: values.labelAr,
      hintAr: values.hintAr || null,
      type: fieldType,
      isRequired: values.isRequired,
      // الحدود تخص أنواعها وحدها؛ إرسالها على غيرها يرفضه الخادم.
      minSelections: fieldType === "MULTI_SELECT" && values.minSelections ? Number(values.minSelections) : null,
      maxSelections: fieldType === "MULTI_SELECT" && values.maxSelections ? Number(values.maxSelections) : null,
      maxLength: TEXT_TYPES.includes(fieldType) && values.maxLength ? Number(values.maxLength) : null,
      options: SELECT_TYPES.includes(fieldType)
        ? values.options.map((option, index) => {
            const value = option.value || uniqueKey(latinize(option.labelAr, "_") || `option_${index + 1}`, optionValues, "_");

            optionValues.push(value);

            return { value, labelAr: option.labelAr };
          })
        : [],
      // الدور يسقط مع نوعه: بريدٌ صار نصًّا حرًّا لا يُنسخ إلى عمود البريد.
      contactRole:
        values.contactRole && CONTACT_ROLE_TYPES[values.contactRole as ContactRole] === fieldType
          ? (values.contactRole as ContactRole)
          : null,
      condition: buildCondition(values),
    };
  }

  return (
    <FormDialog
      {...props}
      presentation="sheet"
      size="lg"
      title={field ? `تعديل «${field.labelAr}»` : "سؤال جديد"}
      description={field ? "التعديل يخص المسوّدة وحدها؛ الإصدار المنشور مجمَّد لا يتأثر." : "يُضاف آخر الأسئلة، ويُنقل بعدها بسهمي الترتيب."}
      form={form}
      values={field ? valuesOf(field) : EMPTY}
      submitLabel="حفظ السؤال"
      onSubmit={(values) => {
        const input = toInput(values);

        return field ? updateField(formId, field.id, input) : addField(formId, input);
      }}
      successMessage={field ? "حُفظ السؤال." : "أُضيف السؤال."}
      onSuccess={() => {
        void queryClient.invalidateQueries({ queryKey: ["forms", formId] });
        void queryClient.invalidateQueries({ queryKey: ["forms"] });
      }}
      mapFieldPath={(path) =>
        path.startsWith("condition.value")
          ? "conditionValue"
          : path.startsWith("condition")
            ? "conditionKey"
            : null
      }
    >
      <FormSection title="السؤال">
        <TextField control={form.control} name="labelAr" label="نص السؤال" placeholder="ما اسمك الكامل؟" />
        <TextField control={form.control} name="hintAr" label="تلميح (اختياري)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={form.control} name="type" label="النوع" options={TYPE_OPTIONS} />
          <TextField
            control={form.control}
            name="key"
            label="المفتاح"
            hint={
              field
                ? "به تُقرأ الإجابة؛ تغييره بعد النشر يفصل الطلبات القديمة عن سؤالها."
                : "به تُقرأ الإجابة. اتركه فارغًا ليُشتق من النص."
            }
            dir="ltr"
            className="text-start font-mono"
            placeholder={labelAr.trim() ? suggestKey(labelAr, takenKeys) : "full_name"}
          />
        </div>
        <CheckboxField control={form.control} name="isRequired" label="إجابة إلزامية" />
      </FormSection>

      {isSelect ? (
        <FormSection title="الخيارات" description="النص ما يراه المتقدّم، والقيمة ما يُخزَّن ويُرشَّح به. تُشتق القيمة من النص إن تُركت فارغة.">
          <div className="space-y-2">
            {options.fields.map((option, index) => (
              <div key={option.id} className="grid grid-cols-[1fr_10rem_auto] items-start gap-2">
                <TextField
                  control={form.control}
                  name={`options.${index}.labelAr`}
                  label={`نص الخيار ${index + 1}`}
                />
                <TextField
                  control={form.control}
                  name={`options.${index}.value`}
                  label="القيمة"
                  dir="ltr"
                  className="text-start font-mono"
                  placeholder="تلقائي"
                />
                <IconButton
                  label={`حذف الخيار ${index + 1}`}
                  icon={X}
                  className="mt-7"
                  onClick={() => options.remove(index)}
                />
              </div>
            ))}
            {form.formState.errors.options?.message ? (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.options.message}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => options.append({ labelAr: "", value: "" })}
            >
              <Plus aria-hidden />
              إضافة خيار
            </Button>
          </div>
          {type === "MULTI_SELECT" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="minSelections"
                label="أقل عدد اختيارات"
                inputMode="numeric"
                dir="ltr"
                className="text-start"
                placeholder="بلا حد"
              />
              <TextField
                control={form.control}
                name="maxSelections"
                label="أكثر عدد اختيارات"
                inputMode="numeric"
                dir="ltr"
                className="text-start"
                placeholder="بلا حد"
              />
            </div>
          ) : null}
        </FormSection>
      ) : null}

      {TEXT_TYPES.includes(type as FieldType) ? (
        <FormSection title="الطول">
          <TextField
            control={form.control}
            name="maxLength"
            label="حد الأحرف (اختياري)"
            hint="يُفرض على الخادم أيضًا، لا في المتصفح وحده."
            inputMode="numeric"
            dir="ltr"
            className="w-40 text-start"
            placeholder="بلا حد"
          />
        </FormSection>
      ) : null}

      <FormSection
        title="شرط الظهور (اختياري)"
        description="يظهر السؤال حين تستوفي إجابة سؤال سابق الشرط. الخادم يعيد التقييم عند الاستقبال."
      >
        {earlier.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا سؤال يسبقه ليُشترط عليه.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="conditionKey"
                label="السؤال المشروط عليه"
                clearable
                placeholder="بلا شرط — يظهر دائمًا"
                options={earlier.map((item) => ({
                  value: item.key,
                  label: item.labelAr,
                  description: FIELD_TYPE_LABELS[item.type],
                }))}
              />
              <SelectField
                control={form.control}
                name="conditionOp"
                label="العملية"
                disabled={!conditionKey}
                options={OP_OPTIONS}
              />
            </div>
            {conditionKey && conditionOp !== "notEmpty" ? (
              choices ? (
                conditionOp === "in" ? (
                  <SelectField
                    control={form.control}
                    name="conditionValues"
                    label="القيم"
                    multiple
                    options={choices.map((choice) => ({ value: choice.value, label: choice.labelAr }))}
                  />
                ) : (
                  <SelectField
                    control={form.control}
                    name="conditionValue"
                    label="القيمة"
                    options={choices.map((choice) => ({ value: choice.value, label: choice.labelAr }))}
                  />
                )
              ) : (
                <TextField
                  control={form.control}
                  name="conditionValue"
                  label={conditionOp === "in" ? "القيم" : "القيمة"}
                  hint={conditionOp === "in" ? "قيم مفصولة بفاصلة." : undefined}
                  dir="ltr"
                  className="text-start"
                />
              )
            ) : null}
          </>
        )}
      </FormSection>

      {roles.length > 0 ? (
        <FormSection
          title="دور السؤال في ملف المتقدّم"
          description="يُستخرج إلى عمود مستقل فيصير الطلب قابلًا للفرز، ودور البريد هو الذي تصله نسخة الطلب."
        >
          <SelectField
            control={form.control}
            name="contactRole"
            label="الدور"
            clearable
            placeholder="لا دور — سؤال عادي"
            options={roles.map((role) => ({ value: role, label: CONTACT_ROLE_LABELS[role] }))}
          />
        </FormSection>
      ) : null}
    </FormDialog>
  );
}
