"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useFieldCache } from "@/components/field/group-dialog";
import { Alert } from "@/components/ui/card";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, SwitchField, TextField } from "@/components/ui/form-fields";
import {
  listFeedbackForms,
  updateFieldSettings,
  type FieldSettings,
  type InitiativeField,
} from "@/lib/api/field";
import { countAr } from "@/lib/text/plural-ar";

const schema = z
  .object({
    feedbackFormId: z.string(),
    certificatesEnabled: z.boolean(),
    certificateSignerNameAr: z.string().trim().max(160, "الاسم طويل جدًا."),
    certificateSignerTitleAr: z.string().trim().max(160, "الصفة طويلة جدًا."),
  })
  // ورقة تحمل اسم المشروع بلا من يوقّعها ليست شهادة — والخادم يرفضها كذلك.
  .refine(
    (values) => !values.certificatesEnabled || values.certificateSignerNameAr !== "",
    { path: ["certificateSignerNameAr"], message: "اكتب اسم من يوقّع الشهادة." },
  );

type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  feedbackFormId: "",
  certificatesEnabled: false,
  certificateSignerNameAr: "",
  certificateSignerTitleAr: "",
};

/**
 * عزل اتجاه المسار: يبدأ بشرطة مائلة، وبلا عزله تنتقل إلى آخره في سطر عربي.
 * برمز المحرف لا بالمحرف نفسه: محرف لا يُرى في المصدر يضيع عند أول تحرير.
 */
const CERTIFICATES = {
  one: "شهادة واحدة",
  two: "شهادتان",
  few: "شهادات",
  many: "شهادة",
  other: "شهادة",
};

const LTR_ISOLATE = String.fromCharCode(0x2066);
const POP_ISOLATE = String.fromCharCode(0x2069);

/**
 * إعدادات ميدان المبادرة: استمارة التقييم التي يصل رابطها المتطوعَ في
 * بطاقته بعد اليوم، وشهادات المشاركة التي يصدرها من بطاقته.
 *
 * الاستمارة تُختار من المنشورة، لا تُبنى هنا: منشئ الاستمارات قائم، ومحرّك
 * تقييم ثانٍ تكرار له.
 */
export function SettingsDialog({
  initiativeId,
  settings,
  open,
  onOpenChange,
}: {
  initiativeId: string;
  settings: FieldSettings | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const apply = useFieldCache();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const certificatesEnabled = useWatch({
    control: form.control,
    name: "certificatesEnabled",
  });

  const forms = useQuery({
    queryKey: ["field-feedback-forms", initiativeId],
    queryFn: () => listFeedbackForms(initiativeId),
    enabled: open,
    staleTime: 60_000,
  });

  // اختيرت ثم أُغلق استقبالها أو أُلغي نشرها: المتطوع لا يرى رابطها.
  const hidden = Boolean(settings?.feedbackFormId) && !settings?.feedbackFormUrl;
  const issued = settings?.certificateCount ?? 0;

  return (
    <FormDialog<Values, InitiativeField>
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="إعدادات الميدان"
      form={form}
      values={{
        feedbackFormId: settings?.feedbackFormId ?? "",
        certificatesEnabled: settings?.certificatesEnabled ?? false,
        certificateSignerNameAr: settings?.certificateSignerNameAr ?? "",
        certificateSignerTitleAr: settings?.certificateSignerTitleAr ?? "",
      }}
      submitLabel="حفظ الإعدادات"
      onSubmit={(values) =>
        updateFieldSettings(initiativeId, {
          feedbackFormId: values.feedbackFormId || null,
          certificatesEnabled: values.certificatesEnabled,
          certificateSignerNameAr: values.certificateSignerNameAr || null,
          certificateSignerTitleAr: values.certificateSignerTitleAr || null,
        })
      }
      successMessage="حُفظت إعدادات الميدان."
      onSuccess={apply}
      // 422 بتفاصيلها تذهب إلى حقولها؛ وبلا تفاصيل فهي عن الاستمارة المختارة.
      fieldForError={(error) =>
        error.status === 422 && error.fieldIssues.length === 0
          ? "feedbackFormId"
          : null
      }
    >
      <SelectField
        control={form.control}
        name="feedbackFormId"
        label="استمارة التقييم (اختيارية)"
        hint={
          forms.data && forms.data.length === 0
            ? "لا استمارة منشورة تستقبل الآن. انشر استمارة التقييم من صفحة الاستمارات وافتح استقبالها."
            : "يظهر رابطها في بطاقة كل متطوع في هذه المبادرة."
        }
        clearable
        placeholder="بلا استمارة تقييم"
        loading={forms.isPending && open}
        options={(forms.data ?? []).map((entry) => ({
          value: entry.formId,
          label: entry.nameAr,
          description: `${LTR_ISOLATE}/join/${entry.slug}${POP_ISOLATE}`,
        }))}
        selectedOption={
          settings?.feedbackFormId
            ? {
                value: settings.feedbackFormId,
                label: settings.feedbackFormNameAr ?? "الاستمارة المختارة",
              }
            : undefined
        }
      />

      {hidden ? (
        <Alert variant="warning">
          الاستمارة المختارة لا تستقبل الآن أو ليست منشورة، فلا يراها
          المتطوعون. افتح استقبالها من صفحة الاستمارات، أو اختر غيرها.
        </Alert>
      ) : null}

      <SwitchField
        control={form.control}
        name="certificatesEnabled"
        label="شهادات المشاركة"
        hint="يصدرها المتطوع من بطاقته بعد أن يُسجَّل حضوره، وتشهد بأيامه وساعاته كما في سجل الميدان."
      />

      {certificatesEnabled ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="certificateSignerNameAr"
            label="من يوقّع الشهادة"
            hint="اسمه يُطبع في أسفلها."
            maxLength={160}
          />
          <TextField
            control={form.control}
            name="certificateSignerTitleAr"
            label="صفته (اختيارية)"
            placeholder="مدير المشروع"
            maxLength={160}
          />
        </div>
      ) : null}

      {issued > 0 ? (
        <Alert variant="info">
          صدرت {countAr(issued, CERTIFICATES)} في هذه المبادرة.{" "}
          إيقاف الشهادات يمنع إصدار الجديد وفتحها من البطاقة، ولا يُبطل ما
          طُبع: صفحة التحقق تبقى تشهد به. وتعديل اسم الموقّع يظهر في كل شهادة
          تُفتح بعده.
        </Alert>
      ) : null}
    </FormDialog>
  );
}
