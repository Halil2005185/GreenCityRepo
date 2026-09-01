"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FieldEditor } from "@/components/forms/field-editor";
import { FormPreview } from "@/components/forms/form-preview";
import { IntroEditor } from "@/components/forms/intro-editor";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import {
  CONDITION_OP_LABELS,
  FIELD_TYPE_LABELS,
  type FieldInput,
  type FormDetail,
  type FormField,
  addField,
  deleteField,
  getForm,
  publishForm,
  reorderFields,
  updateField,
  updateForm,
} from "@/lib/api/forms";

export default function FormBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<FormField | null>(null);
  const [adding, setAdding] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useQuery({ queryKey: ["forms", id], queryFn: () => getForm(id) });

  /**
   * محرّر السؤال يفتح أسفل القائمة، فالنقر على «تعديل» في استمارة طويلة
   * كان لا يُحدث شيئًا مرئيًا — الاستمارة تُقرأ فلا تُنشأ إلا طويلة.
   */
  useEffect(() => {
    if (!editing && !adding) return;

    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editing, adding]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["forms", id] });
    void queryClient.invalidateQueries({ queryKey: ["forms"] });
  };

  const report = (thrown: unknown) =>
    setError(
      thrown instanceof ApiError
        ? thrown.message
        : "تعذّر الاتصال بالخادم. حاول مجددًا.",
    );

  const save = useMutation({
    mutationFn: (input: FieldInput) =>
      editing ? updateField(id, editing.id, input) : addField(id, input),
    onSuccess: () => {
      setEditing(null);
      setAdding(false);
      setError(null);
      refresh();
    },
    onError: report,
  });

  const remove = useMutation({
    mutationFn: (fieldId: string) => deleteField(id, fieldId),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: report,
  });

  const publish = useMutation({
    mutationFn: () => publishForm(id),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: report,
  });

  /**
   * المقدّمة والصورة على الاستمارة لا على الإصدار: تصحيح جملة في الشرح لا
   * يستحق إصدارًا جديدًا ولا يغيّر ما وقّع عليه من قدّم من قبل — الأسئلة
   * وحدها هي العقد المجمَّد.
   */
  const intro = useMutation({
    mutationFn: (input: {
      introJson: FormDetail["introJson"];
      coverImageUrl: string | null;
    }) => updateForm(id, input),
    onSuccess: refresh,
    onError: report,
  });

  const toggle = useMutation({
    mutationFn: (input: { isAccepting: boolean }) => updateForm(id, input),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: report,
  });

  const reorder = useMutation({
    mutationFn: (keys: string[]) => reorderFields(id, keys),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: report,
  });

  if (form.isPending) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (form.isError || !form.data.draft) {
    return (
      <div className="space-y-4">
        <Alert>
          {form.isError
            ? "تعذّر تحميل الاستمارة."
            : "لا مسوّدة قابلة للتحرير في هذه الاستمارة."}
        </Alert>
        <Link
          href="/dashboard/forms"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          الاستمارات
        </Link>
      </div>
    );
  }

  const fields = form.data.draft.fields;
  const fieldsCount = fields.length;

  /** النقل خطوة واحدة: يرسل الترتيب كاملًا لأن الخادم يتحقق منه كوحدة. */
  const move = (index: number, delta: number) => {
    const target = index + delta;

    if (target < 0 || target >= fields.length) return;

    const keys = fields.map((field) => field.key);
    const moved = keys[index]!;

    keys.splice(index, 1);
    keys.splice(target, 0, moved);

    reorder.mutate(keys);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/forms"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          الاستمارات
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/dashboard/forms/${id}/submissions`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            الطلبات ←
          </Link>

          <span className="text-xs text-muted-foreground">
            المسوّدة — الإصدار {form.data.draft.version}
            {form.data.publishedVersion
              ? ` · المنشور ${form.data.publishedVersion}`
              : " · لم يُنشر بعد"}
          </span>

          {form.data.publishedVersion ? (
            <Button
              type="button"
              variant={form.data.isAccepting ? "outline" : "default"}
              size="sm"
              loading={toggle.isPending}
              onClick={() =>
                toggle.mutate({ isAccepting: !form.data.isAccepting })
              }
            >
              {form.data.isAccepting ? "إغلاق الاستقبال" : "فتح الاستقبال"}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={fieldsCount === 0}
            loading={publish.isPending}
            onClick={() => publish.mutate()}
          >
            نشر المسوّدة
          </Button>
        </div>
      </div>

      {form.data.published ? (
        <p className="text-xs text-muted-foreground">
          الإصدار {form.data.published.version} منشور ومجمَّد —{" "}
          {form.data.published.fields.length} سؤالًا. تعديلاتك هنا تخص المسوّدة
          التالية ولا تمسّه.
        </p>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {/*
        سؤال بلا دور يعني طلبًا بلا اسم في القائمة، ونسخةً لا تصل بريد
        المتقدّم — والعطل لا يظهر إلا بعد أن يتقدّم أول متطوع.
      */}
      {fields.length > 0 && !fields.some((field) => field.contactRole) ? (
        <Alert variant="info">
          لا سؤال موسوم باسم المتقدّم أو بريده. الطلبات ستصل بلا اسم في
          القائمة، ولن تصل نسخة إلى بريد من يقدّم. حدّد الدور من «تعديل» على
          سؤال الاسم وسؤال البريد.
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>رأس الاستمارة</CardTitle>
              <CardDescription>
                الصورة والمقدّمة تعلوان الأسئلة في صفحة الاستمارة. تُحفظ
                فورًا ولا تنتظر نشر إصدار.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <IntroEditor
                intro={form.data.introJson}
                coverImageUrl={form.data.coverImageUrl}
                saving={intro.isPending}
                onSave={(input) => intro.mutate(input)}
              />
            </CardContent>
          </Card>

          <Card>
          <CardHeader>
            <CardTitle>{form.data.nameAr}</CardTitle>
            <CardDescription>
              الأسئلة بترتيب عرضها. شرط الظهور لا يشير إلا إلى سؤال يسبقه.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا أسئلة بعد.</p>
            ) : (
              <ul className="space-y-2">
                {fields.map((field, index) => (
                  <li
                    key={field.id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {field.labelAr}
                          {field.isRequired ? (
                            <span className="text-destructive"> *</span>
                          ) : null}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          <span dir="ltr">{field.key}</span>
                          {" · "}
                          {FIELD_TYPE_LABELS[field.type]}
                        </p>

                        {field.condition ? (
                          <p className="mt-1 text-xs text-primary">
                            يظهر إذا كان{" "}
                            <span dir="ltr">{field.condition.fieldKey}</span>{" "}
                            {CONDITION_OP_LABELS[field.condition.op]}
                            {field.condition.op === "notEmpty"
                              ? ""
                              : ` ${
                                  Array.isArray(field.condition.value)
                                    ? field.condition.value.join("، ")
                                    : field.condition.value
                                }`}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="تحريك لأعلى"
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => move(index, -1)}
                        >
                          <ChevronUp className="size-4" aria-hidden />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="تحريك لأسفل"
                          disabled={
                            index === fields.length - 1 || reorder.isPending
                          }
                          onClick={() => move(index, 1)}
                        >
                          <ChevronDown className="size-4" aria-hidden />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="تعديل"
                          onClick={() => {
                            setAdding(false);
                            setEditing(field);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="حذف"
                          loading={
                            remove.isPending && remove.variables === field.id
                          }
                          onClick={() => remove.mutate(field.id)}
                        >
                          <Trash2 className="size-4 text-destructive" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {adding || editing ? (
              <div
                ref={editorRef}
                className="rounded-md border border-primary/40 bg-muted/30 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {editing ? `تعديل: ${editing.labelAr}` : "سؤال جديد"}
                  </p>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="إلغاء"
                    onClick={() => {
                      setAdding(false);
                      setEditing(null);
                      setError(null);
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>

                <FieldEditor
                  key={editing?.id ?? "new"}
                  field={editing}
                  earlierFields={
                    editing
                      ? fields.filter(
                          (item) => item.displayOrder < editing.displayOrder,
                        )
                      : fields
                  }
                  saving={save.isPending}
                  onSubmit={(input) => save.mutate(input)}
                />
              </div>
            ) : (
              <Button type="button" onClick={() => setAdding(true)}>
                إضافة سؤال
              </Button>
            )}
          </CardContent>
        </Card>

        </div>

        <Card>
          <CardHeader>
            <CardTitle>المعاينة</CardTitle>
            <CardDescription>
              كما يراها المتقدّم. جرّب الإجابات لترى أثر الشروط.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-xl border border-border p-4">
              {form.data.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.data.coverImageUrl}
                  alt=""
                  className="aspect-[16/7] w-full rounded-lg object-cover"
                />
              ) : null}

              <h2 className="text-lg font-bold">{form.data.nameAr}</h2>

              {form.data.descriptionAr ? (
                <p className="text-sm text-muted-foreground">
                  {form.data.descriptionAr}
                </p>
              ) : null}

              {form.data.introJson ? (
                <p className="text-xs text-muted-foreground">
                  المقدّمة تظهر هنا كما حُرِّرت أعلاه.
                </p>
              ) : null}
            </div>

            <FormPreview fields={fields} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
