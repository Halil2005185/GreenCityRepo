"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  CirclePause,
  CirclePlay,
  Inbox,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { RegistrationLinkDialog } from "@/components/forms/form-dialogs";
import { FormPreview } from "@/components/forms/form-preview";
import { IntroEditor } from "@/components/forms/intro-editor";
import { QuestionSheet } from "@/components/forms/question-sheet";
import { IconButton, type ActionDef } from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DetailSkeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/client";
import {
  CONDITION_OP_LABELS,
  CONTACT_ROLE_LABELS,
  FIELD_TYPE_LABELS,
  deleteField,
  getForm,
  publishForm,
  reorderFields,
  updateForm,
  type FormDetail,
  type FormField,
} from "@/lib/api/forms";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { countAr } from "@/lib/text/plural-ar";

const BREADCRUMB_ROOT = { label: "الاستمارات", href: "/dashboard/forms" };

const QUESTIONS = { one: "سؤال واحد", two: "سؤالان", few: "أسئلة", many: "سؤالًا", other: "سؤال" };

/** الشرط بجملة يقرؤها المحرّر: «يظهر إذا كان «الصفة» يساوي طالب». */
function conditionText(field: FormField, fields: readonly FormField[]) {
  const condition = field.condition;

  if (!condition) return null;

  const source = fields.find((item) => item.key === condition.fieldKey);
  const values = condition.op === "notEmpty" ? [] : [condition.value].flat().map(String);
  const labels = values.map(
    (value) => source?.options.find((option) => option.value === value)?.labelAr ?? value,
  );

  return `يظهر إذا كان «${source?.labelAr ?? condition.fieldKey}» ${CONDITION_OP_LABELS[condition.op]}${
    labels.length > 0 ? ` ${labels.join("، ")}` : ""
  }`;
}

export default function FormBuilderPage() {
  const { id } = useParams<{ id: string }>();

  const form = useQuery({ queryKey: ["forms", id], queryFn: () => getForm(id) });

  if (form.isPending) return <DetailSkeleton />;

  if (form.isError || !form.data.draft) {
    const notFound = form.isError && form.error instanceof ApiError && form.error.status === 404;

    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[BREADCRUMB_ROOT]} title="تحرير الاستمارة" />
        <div className="rounded-xl border border-border bg-card">
          <ErrorState
            title={
              notFound
                ? "لا توجد استمارة بهذا الرابط."
                : form.isError
                  ? "تعذّر تحميل الاستمارة."
                  : "لا مسوّدة قابلة للتحرير في هذه الاستمارة."
            }
            error={form.isError && !notFound ? form.error : undefined}
            onRetry={form.isError && !notFound ? () => void form.refetch() : undefined}
          />
        </div>
      </div>
    );
  }

  return <Builder form={form.data} draft={form.data.draft} />;
}

/**
 * المحرّر الصفحة الكاملة الوحيدة في اللوحة: الأسئلة وتحريرها في جهة البداية
 * والمعاينة ثابتة في جهة النهاية، فأثر كل تعديل يُرى دون تمرير. تحرير السؤال
 * لوحة جانبية بدل نموذج يُفتح أسفل قائمة طويلة لا يُرى أثر النقر عليه.
 */
function Builder({ form, draft }: { form: FormDetail; draft: NonNullable<FormDetail["draft"]> }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{ field: FormField | null; open: boolean }>({ field: null, open: false });
  const [linkOpen, setLinkOpen] = useState(false);

  const fields = draft.fields;
  const published = form.published;
  const canEdit = can(CAPABILITIES.formsManage);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["forms", form.id] });
    void queryClient.invalidateQueries({ queryKey: ["forms"] });
  };

  /**
   * المقدّمة والصورة على الاستمارة لا على الإصدار: تصحيح جملة في الشرح لا
   * يستحق إصدارًا جديدًا ولا يغيّر ما وقّع عليه من قدّم من قبل — الأسئلة
   * وحدها هي العقد المجمَّد.
   */
  const intro = useApiMutation({
    mutationFn: (input: { introJson: FormDetail["introJson"]; coverImageUrl: string | null }) =>
      updateForm(form.id, input),
    successMessage: "حُفظ رأس الاستمارة.",
    errorFallback: "تعذّر حفظ رأس الاستمارة.",
    onSuccess: refresh,
  });

  const open = useApiMutation({
    mutationFn: () => updateForm(form.id, { isAccepting: true }),
    successMessage: "فُتح الاستقبال.",
    errorFallback: "تعذّر فتح الاستقبال.",
    onSuccess: refresh,
  });

  /** النقل خطوة واحدة: يرسل الترتيب كاملًا لأن الخادم يتحقق منه كوحدة. */
  const reorder = useApiMutation({
    mutationFn: ({ keys }: { keys: string[]; moved: string }) => reorderFields(form.id, keys),
    successMessage: "نُقل السؤال.",
    errorFallback: "تعذّر نقل السؤال.",
    onSuccess: refresh,
  });

  function move(index: number, delta: number) {
    const target = index + delta;

    if (target < 0 || target >= fields.length) return;

    const keys = fields.map((field) => field.key);
    const [moved] = keys.splice(index, 1);

    keys.splice(target, 0, moved!);
    reorder.mutate({ keys, moved: moved! });
  }

  /*
    سؤال بلا دور يعني طلبًا بلا اسم في القائمة، ونسخةً لا تصل بريد المتقدّم —
    والعطل لا يظهر إلا بعد أن يتقدّم أول متطوع.
  */
  const missingContact = fields.length > 0 && !fields.some((field) => field.contactRole);
  const contactWarning = (
    <Alert variant="warning">
      لا سؤال موسوم باسم المتقدّم أو بريده: الطلبات ستصل بلا اسم في القائمة، ولن تصل نسخة إلى بريد من
      يقدّم. حدّد الدور من «تعديل» على سؤال الاسم وسؤال البريد.
    </Alert>
  );

  const publish: ActionDef = {
    key: "publish",
    label: "نشر المسوّدة",
    icon: Upload,
    requires: [CAPABILITIES.formsPublish],
    disabled: fields.length === 0,
    disabledReason: "أضف سؤالًا واحدًا على الأقل قبل النشر.",
    onSelect: () =>
      void confirm({
        title: `نشر الإصدار ${draft.version} من «${form.nameAr}»؟`,
        description:
          "يُجمَّد الإصدار بأسئلته وتُقرأ الطلبات الجديدة مقابله، ثم تُفتح مسوّدة جديدة بنسخة من أسئلته.",
        details: missingContact ? contactWarning : undefined,
        confirmLabel: "نشر المسوّدة",
        successMessage: `نُشر الإصدار ${draft.version}.`,
        onConfirm: async () => {
          await publishForm(form.id);
          refresh();
        },
      }),
  };

  const toggle: ActionDef = form.isAccepting
    ? {
        key: "close",
        label: "إغلاق الاستقبال",
        icon: CirclePause,
        requires: [CAPABILITIES.formsPublish],
        hidden: !published,
        onSelect: () =>
          void confirm({
            title: `إغلاق استقبال «${form.nameAr}»؟`,
            description: "يتوقف قبول الطلبات الجديدة من الرابط العلني فورًا. يمكن فتحه لاحقًا.",
            confirmLabel: "إغلاق الاستقبال",
            successMessage: "أُغلق الاستقبال.",
            onConfirm: async () => {
              await updateForm(form.id, { isAccepting: false });
              refresh();
            },
          }),
      }
    : {
        key: "open",
        label: "فتح الاستقبال",
        icon: CirclePlay,
        requires: [CAPABILITIES.formsPublish],
        hidden: !published,
        loading: open.isPending,
        onSelect: () => open.mutate(),
      };

  function removeQuestion(field: FormField) {
    void confirm({
      title: `حذف سؤال «${field.labelAr}»؟`,
      description: "يُحذف من المسوّدة وحدها؛ الإصدار المنشور وطلباته لا تتأثر.",
      confirmLabel: "حذف السؤال",
      destructive: true,
      successMessage: "حُذف السؤال.",
      onConfirm: async () => {
        await deleteField(form.id, field.id);
        refresh();
      },
    });
  }

  const addQuestion: ActionDef = {
    key: "add",
    label: "إضافة سؤال",
    icon: Plus,
    requires: [CAPABILITIES.formsManage],
    onSelect: () => setSheet({ field: null, open: true }),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[BREADCRUMB_ROOT, { label: form.nameAr }]}
        title={form.nameAr}
        description={`المسوّدة: الإصدار ${draft.version}${
          published ? ` · المنشور: الإصدار ${published.version} (${countAr(published.fields.length, QUESTIONS)})` : " · لم يُنشر بعد"
        }`}
        badges={
          published ? (
            <StatusBadge kind="formAccepting" value={form.isAccepting ? "OPEN" : "CLOSED"} />
          ) : (
            <Badge tone="neutral">مسوّدة</Badge>
          )
        }
        primaryAction={publish}
        secondaryActions={[
          { key: "submissions", label: "الطلبات", icon: Inbox, href: `/dashboard/forms/${form.id}/submissions` },
        ]}
        menuActions={[
          toggle,
          {
            key: "link",
            label: "رابط التسجيل",
            icon: Link2,
            hidden: !published,
            onSelect: () => setLinkOpen(true),
          },
        ]}
      />

      {missingContact ? contactWarning : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Section
            title="رأس الاستمارة"
            description="الصورة والمقدّمة فوق الأسئلة في صفحة الاستمارة. تُحفظ فورًا ولا تنتظر نشر إصدار."
            variant="card"
          >
            {canEdit ? (
              <IntroEditor
                intro={form.introJson}
                coverImageUrl={form.coverImageUrl}
                saving={intro.isPending}
                onSave={(input) => intro.mutate(input)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">تحرير رأس الاستمارة لمن يدير الاستمارات.</p>
            )}
          </Section>

          <Section
            title="الأسئلة"
            description="بترتيب عرضها. شرط الظهور لا يشير إلا إلى سؤال يسبقه."
            actions={[addQuestion]}
          >
            {fields.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border">
                <EmptyState
                  title="لا أسئلة بعد"
                  description="أضف أول سؤال — الاسم والبريد عادةً — ثم انشر المسوّدة."
                  action={addQuestion}
                />
              </div>
            ) : (
              <ol className="space-y-2">
                {fields.map((field, index) => {
                  const moving = reorder.isPendingFor((variables) => variables.moved === field.key);

                  return (
                    <li
                      key={field.id}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground"
                    >
                      <span className="numeric mt-0.5 w-5 shrink-0 text-center text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium">
                          {field.labelAr}
                          {field.isRequired ? (
                            <span className="text-destructive" aria-label="إلزامي">
                              {" "}
                              *
                            </span>
                          ) : null}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{FIELD_TYPE_LABELS[field.type]}</span>
                          <span dir="ltr" className="font-mono">
                            {field.key}
                          </span>
                          {field.contactRole ? (
                            <Badge tone="accent">{CONTACT_ROLE_LABELS[field.contactRole]}</Badge>
                          ) : null}
                        </p>
                        {field.condition ? (
                          <p className="text-xs text-primary">{conditionText(field, fields)}</p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <IconButton
                            label="نقل لأعلى"
                            icon={ChevronUp}
                            disabled={index === 0 || moving}
                            onClick={() => move(index, -1)}
                          />
                          <IconButton
                            label="نقل لأسفل"
                            icon={ChevronDown}
                            disabled={index === fields.length - 1 || moving}
                            onClick={() => move(index, 1)}
                          />
                          <IconButton
                            label={`تعديل «${field.labelAr}»`}
                            icon={Pencil}
                            onClick={() => setSheet({ field, open: true })}
                          />
                          <IconButton
                            label={`حذف «${field.labelAr}»`}
                            icon={Trash2}
                            iconClassName="text-destructive"
                            onClick={() => removeQuestion(field)}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>

        {/* المعاينة ثابتة وهي تُمرَّر الأسئلة، وتُمرَّر وحدها إن طالت. */}
        <div className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
          <Section title="المعاينة" description="كما يراها المتقدّم. جرّب الإجابات لترى أثر الشروط." variant="card">
            <div className="space-y-5">
              <div className="space-y-3 rounded-xl border border-border p-4">
                {form.coverImageUrl ? (
                  // صورة مرفوعة بأبعاد حرة؛ مكوّن الصورة يطلب أبعادًا لا نعرفها.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.coverImageUrl} alt="" className="aspect-[16/7] w-full rounded-lg object-cover" />
                ) : null}
                <h2 className="text-lg font-bold">{form.nameAr}</h2>
                {form.descriptionAr ? (
                  <p className="text-sm text-muted-foreground">{form.descriptionAr}</p>
                ) : null}
                {form.introJson ? (
                  <p className="text-xs text-muted-foreground">المقدّمة تظهر هنا كما حُرِّرت في رأس الاستمارة.</p>
                ) : null}
              </div>
              <FormPreview fields={fields} />
            </div>
          </Section>
        </div>
      </div>

      <QuestionSheet
        formId={form.id}
        field={sheet.field}
        fields={fields}
        open={sheet.open}
        onOpenChange={(next) => setSheet((current) => ({ ...current, open: next }))}
      />
      <RegistrationLinkDialog form={form} open={linkOpen} onOpenChange={setLinkOpen} />
    </div>
  );
}
