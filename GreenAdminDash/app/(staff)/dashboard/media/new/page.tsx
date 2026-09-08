"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  ClassificationFields,
  type ClassificationValue,
} from "@/components/relations/classification";
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
import {
  MEDIA_STAGES,
  MEDIA_STAGE_LABELS,
  type MediaStage,
  createMediaContact,
} from "@/lib/api/media";

/**
 * الشرط نفسه المحروس في القاعدة (`media_contacts_reachable`) مكرَّر هنا
 * لسبب واحد: أن تصل الرسالة قبل إرسال النموذج لا بعده. القاعدة تبقى
 * الحكم، وهذا تحسين تجربة لا بديل عنها.
 */
const schema = z
  .object({
    fullNameAr: z.string().trim().min(2, "الاسم مطلوب.").max(160),
    jobTitleAr: z.string().trim().max(160).optional(),
    outletNameAr: z.string().trim().max(200).optional(),
    email: z
      .union([z.email("صيغة البريد غير صحيحة."), z.literal("")])
      .optional(),
    phone: z.string().trim().max(32).optional(),
    profileUrl: z.union([z.url("رابط غير صالح."), z.literal("")]).optional(),
    stage: z.string().min(1),
    internalNotesAr: z.string().max(4000).optional(),
  })
  .refine(
    (values) => Boolean(values.email || values.phone || values.profileUrl),
    {
      message: "يلزم بريد أو هاتف أو رابط حساب.",
      path: ["phone"],
    },
  );

type Values = z.infer<typeof schema>;

export default function NewMediaContactPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [classification, setClassification] = useState<ClassificationValue>({
    priority: "MEDIUM",
    horizon: "",
    relationshipTypeId: "",
    channelIds: [],
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullNameAr: "", stage: "NEW" },
  });

  const create = useMutation({
    mutationFn: createMediaContact,
    onSuccess: (contact) => router.replace(`/dashboard/media/${contact.id}`),
    onError: (error) =>
      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر حفظ الملف. حاول مجددًا.",
      ),
  });

  const onSubmit = handleSubmit((values) =>
    create.mutateAsync({
      fullNameAr: values.fullNameAr,
      stage: values.stage as MediaStage,
      priority: classification.priority,
      channelIds: classification.channelIds,
      ...(values.jobTitleAr ? { jobTitleAr: values.jobTitleAr } : {}),
      ...(values.outletNameAr ? { outletNameAr: values.outletNameAr } : {}),
      ...(values.email ? { email: values.email } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.profileUrl ? { profileUrl: values.profileUrl } : {}),
      ...(values.internalNotesAr
        ? { internalNotesAr: values.internalNotesAr }
        : {}),
      ...(classification.horizon ? { horizon: classification.horizon } : {}),
      ...(classification.relationshipTypeId
        ? { relationshipTypeId: classification.relationshipTypeId }
        : {}),
    }),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">إضافة إلى الشبكة الإعلامية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          شخص لا جهة. الجهات الشريكة تُسجَّل في سجل الشركاء، ويمكن ربط الشخص
          بجهته من صفحته بعد الحفظ.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {formError ? <Alert>{formError}</Alert> : null}

        <Card>
          <CardHeader>
            <CardTitle>البيانات الأساسية</CardTitle>
            <CardDescription>
              الاسم والمسمى الوظيفي ووسيلة تواصل واحدة على الأقل.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Field
              id="fullNameAr"
              label="الاسم الكامل"
              error={errors.fullNameAr?.message}
            >
              {(props) => <Input {...props} {...register("fullNameAr")} />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="jobTitleAr"
                label="المسمى الوظيفي"
                hint="مراسل، صانع محتوى، مصوّر…"
                error={errors.jobTitleAr?.message}
              >
                {(props) => <Input {...props} {...register("jobTitleAr")} />}
              </Field>

              <Field
                id="outletNameAr"
                label="الجهة التي يعمل بها"
                hint="اتركه فارغًا للمستقلّين."
                error={errors.outletNameAr?.message}
              >
                {(props) => <Input {...props} {...register("outletNameAr")} />}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="phone" label="رقم الهاتف" error={errors.phone?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...register("phone")}
                    dir="ltr"
                    className="text-start"
                    placeholder="+963…"
                  />
                )}
              </Field>

              <Field
                id="email"
                label="البريد الإلكتروني"
                error={errors.email?.message}
              >
                {(props) => (
                  <Input
                    {...props}
                    {...register("email")}
                    dir="ltr"
                    className="text-start"
                    type="email"
                  />
                )}
              </Field>
            </div>

            <Field
              id="profileUrl"
              label="رابط الحساب أو الصفحة"
              error={errors.profileUrl?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  {...register("profileUrl")}
                  dir="ltr"
                  className="text-start"
                  placeholder="https://…"
                />
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>التصنيف</CardTitle>
            <CardDescription>
              ما يجعل الاختيار وقت التواصل أسرع: بأي شكل يعمل، وما طبيعة
              علاقتنا به، وكم يهمّنا.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="stage">مرحلة التواصل</Label>
              <select
                id="stage"
                {...register("stage")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {MEDIA_STAGES.map((value) => (
                  <option key={value} value={value}>
                    {MEDIA_STAGE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <ClassificationFields
              value={classification}
              onChange={setClassification}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملاحظات داخلية</CardTitle>
            <CardDescription>
              لا تظهر لمن لا يملك صلاحية الاطلاع عليها.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Field
              id="internalNotesAr"
              label="ملاحظات"
              error={errors.internalNotesAr?.message}
            >
              {(props) => (
                <textarea
                  {...props}
                  {...register("internalNotesAr")}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending}>
            حفظ
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            إلغاء
          </Button>
        </div>
      </form>
    </div>
  );
}
