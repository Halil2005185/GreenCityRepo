"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { createForm, listForms } from "@/lib/api/forms";
import { listOffices } from "@/lib/api/invitations";
import { formatDate } from "@/lib/utils";

/**
 * أصل الموقع العام — منه يُبنى رابط التسجيل الذي يُنشر للناس.
 *
 * يُقرأ من البيئة لا يُكتب في الكود: اللوحة تعمل محليًا وعلى الإنتاج
 * بنفس الحزمة، ورابط `localhost` يُنسخ ويُرسل فلا يفتح عند أحد.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/**
 * الرابط العام لاستمارة منشورة، أو `null` إن لم تُنشر بعد أو لم يُضبط
 * عنوان الموقع — رابطٌ إلى استمارة غير منشورة يعطي 404 لمن يفتحه.
 */
function publicUrlOf(form: { slug: string; publishedVersion: number | null }) {
  if (!SITE_URL || !form.publishedVersion) return null;

  return `${SITE_URL.replace(/\/$/, "")}/join/${form.slug}`;
}

/** ينسخ الرابط ويقول إنه نُسخ: زرٌّ لا يجيب لا يُصدَّق فيُنقر مرتين. */
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      title={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // متصفح يمنع الحافظة: يُعرض الرابط ليُنسخ يدويًا، فزرٌّ لا يفعل شيئًا
          // أسوأ من نافذة نسخ.
          window.prompt("انسخ رابط التسجيل:", url);
          return;
        }

        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "نُسخ" : "نسخ رابط التسجيل"}
    </Button>
  );
}

const createSchema = z.object({
  nameAr: z.string().trim().min(2, "اسم الاستمارة مطلوب."),
  slug: z
    .string()
    .trim()
    .min(2, "المعرّف مطلوب.")
    .regex(/^[a-z][a-z0-9-]*$/, "حروف لاتينية صغيرة وأرقام وشرطات فقط."),
  descriptionAr: z.string().trim().max(1000).optional(),
  officeId: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;

export default function FormsPage() {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const forms = useQuery({ queryKey: ["forms"], queryFn: listForms });
  const offices = useQuery({ queryKey: ["offices"], queryFn: listOffices });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { nameAr: "", slug: "", descriptionAr: "", officeId: "" },
  });

  const create = useMutation({
    mutationFn: createForm,
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: ["forms"] });
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await create.mutateAsync({
        slug: values.slug,
        nameAr: values.nameAr,
        ...(values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
        ...(values.officeId ? { officeId: values.officeId } : {}),
      });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر الاتصال بالخادم. حاول مجددًا.",
      );
    }
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>استمارة جديدة</CardTitle>
          <CardDescription>
            تُنشأ مسوّدتها فورًا. الأسئلة تُحرَّر في المسوّدة، والمنشور مجمَّد
            لا يُعدَّل — لأن طلبًا قديمًا يجب أن يبقى مقروءًا مقابل الأسئلة كما
            سُئلت يومها.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? <Alert>{formError}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="nameAr"
                label="اسم الاستمارة"
                error={errors.nameAr?.message}
              >
                {(props) => (
                  <Input
                    {...props}
                    {...register("nameAr")}
                    placeholder="استمارة الانضمام"
                  />
                )}
              </Field>

              <Field
                id="slug"
                label="المعرّف في الرابط"
                hint="يظهر في عنوان الاستمارة العلني."
                error={errors.slug?.message}
              >
                {(props) => (
                  <Input
                    {...props}
                    {...register("slug")}
                    dir="ltr"
                    className="text-start"
                    placeholder="join"
                  />
                )}
              </Field>
            </div>

            <Field
              id="descriptionAr"
              label="وصف مختصر (اختياري)"
              error={errors.descriptionAr?.message}
            >
              {(props) => <Input {...props} {...register("descriptionAr")} />}
            </Field>

            <div className="space-y-1.5">
              <Label htmlFor="officeId">المكتب المسؤول عن الفرز</Label>
              <select
                id="officeId"
                {...register("officeId")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">بلا مكتب</option>
                {offices.data?.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.nameAr}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              loading={isSubmitting || create.isPending}
            >
              إنشاء
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الاستمارات</CardTitle>
        </CardHeader>

        <CardContent>
          {forms.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : forms.isError ? (
            <Alert>تعذّر تحميل الاستمارات.</Alert>
          ) : forms.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا استمارات بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start font-medium">الاسم</th>
                    <th className="p-2 text-start font-medium">المكتب</th>
                    <th className="p-2 text-start font-medium">المنشور</th>
                    <th className="p-2 text-start font-medium">أسئلة المسوّدة</th>
                    <th className="p-2 text-start font-medium">الاستقبال</th>
                    <th className="p-2 text-start font-medium">الطلبات</th>
                    <th className="p-2 text-start font-medium">رابط التسجيل</th>
                    <th className="p-2 text-start font-medium">أُنشئت</th>
                  </tr>
                </thead>

                <tbody>
                  {forms.data.map((form) => (
                    <tr
                      key={form.id}
                      className="border-b border-border/60 hover:bg-muted/40"
                    >
                      <td className="p-2">
                        <Link
                          href={`/dashboard/forms/${form.id}/edit`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {form.nameAr}
                        </Link>
                        <span
                          dir="ltr"
                          className="ms-2 text-xs text-muted-foreground"
                        >
                          /{form.slug}
                        </span>
                      </td>
                      <td className="p-2">{form.officeNameAr ?? "—"}</td>
                      <td className="p-2">
                        {form.publishedVersion
                          ? `الإصدار ${form.publishedVersion}`
                          : "لم يُنشر"}
                      </td>
                      <td className="p-2">{form.draftFieldCount}</td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            form.isAccepting
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {form.isAccepting ? "مفتوح" : "مغلق"}
                        </span>
                      </td>
                      <td className="p-2">
                        <Link
                          href={`/dashboard/forms/${form.id}/submissions`}
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          عرض الطلبات
                        </Link>
                      </td>

                      <td className="p-2">
                        {publicUrlOf(form) ? (
                          <CopyLinkButton url={publicUrlOf(form)!} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {form.publishedVersion
                              ? "اضبط عنوان الموقع"
                              : "بعد النشر"}
                          </span>
                        )}
                      </td>

                      <td className="p-2 text-xs text-muted-foreground">
                        {formatDate(form.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
