"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useFieldCache } from "@/components/field/group-dialog";
import { Alert } from "@/components/ui/card";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/form-fields";
import {
  listFeedbackForms,
  updateFieldSettings,
  type FieldSettings,
  type InitiativeField,
} from "@/lib/api/field";

const schema = z.object({ feedbackFormId: z.string() });

type Values = z.infer<typeof schema>;

/**
 * عزل اتجاه المسار: يبدأ بشرطة مائلة، وبلا عزله تنتقل إلى آخره في سطر عربي.
 * برمز المحرف لا بالمحرف نفسه: محرف لا يُرى في المصدر يضيع عند أول تحرير.
 */
const LTR_ISOLATE = String.fromCharCode(0x2066);
const POP_ISOLATE = String.fromCharCode(0x2069);

/**
 * إعدادات ميدان المبادرة. اليوم إعداد واحد: استمارة التقييم التي يصل
 * رابطها المتطوعَ في بطاقته بعد اليوم.
 *
 * تُختار من الاستمارات المنشورة، لا تُبنى هنا: منشئ الاستمارات قائم، ومحرّك
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
    defaultValues: { feedbackFormId: "" },
  });

  const forms = useQuery({
    queryKey: ["field-feedback-forms", initiativeId],
    queryFn: () => listFeedbackForms(initiativeId),
    enabled: open,
    staleTime: 60_000,
  });

  // اختيرت ثم أُغلق استقبالها أو أُلغي نشرها: المتطوع لا يرى رابطها.
  const hidden = Boolean(settings?.feedbackFormId) && !settings?.feedbackFormUrl;

  return (
    <FormDialog<Values, InitiativeField>
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="إعدادات الميدان"
      form={form}
      values={{ feedbackFormId: settings?.feedbackFormId ?? "" }}
      submitLabel="حفظ الإعدادات"
      onSubmit={(values) =>
        updateFieldSettings(initiativeId, {
          feedbackFormId: values.feedbackFormId || null,
        })
      }
      successMessage="حُفظت إعدادات الميدان."
      onSuccess={apply}
      fieldForError={(error) => (error.status === 422 ? "feedbackFormId" : null)}
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
    </FormDialog>
  );
}
