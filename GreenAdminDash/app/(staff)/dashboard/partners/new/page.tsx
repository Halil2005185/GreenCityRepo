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
  ORGANIZATION_KIND_LABELS,
  SUPPORT_FORM_LABELS,
  type SupportForm,
  createPartner,
} from "@/lib/api/partners";

const schema = z.object({
  legalNameAr: z.string().trim().min(2, "الاسم القانوني مطلوب.").max(200),
  displayNameAr: z.string().trim().max(200).optional(),
  organizationKind: z.string().min(1, "اختر نوع الجهة."),
  websiteUrl: z.union([z.url("رابط غير صالح."), z.literal("")]).optional(),
  summaryAr: z.string().max(2000).optional(),
  internalNotesAr: z.string().max(4000).optional(),
});

type Values = z.infer<typeof schema>;

export default function NewPartnerPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [supportForms, setSupportForms] = useState<SupportForm[]>([]);
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
    defaultValues: { legalNameAr: "", organizationKind: "" },
  });

  const create = useMutation({
    mutationFn: createPartner,
    onSuccess: (partner) => router.replace(`/dashboard/partners/${partner.id}`),
    onError: (error) =>
      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر تسجيل الجهة. حاول مجددًا.",
      ),
  });

  const onSubmit = handleSubmit((values) =>
    create.mutateAsync({
      legalNameAr: values.legalNameAr,
      organizationKind:
        values.organizationKind as keyof typeof ORGANIZATION_KIND_LABELS,
      supportForms,
      contactPriority: classification.priority,
      mediaChannelIds: classification.channelIds,
      ...(values.displayNameAr ? { displayNameAr: values.displayNameAr } : {}),
      ...(values.websiteUrl ? { websiteUrl: values.websiteUrl } : {}),
      ...(values.summaryAr ? { summaryAr: values.summaryAr } : {}),
      ...(values.internalNotesAr
        ? { internalNotesAr: values.internalNotesAr }
        : {}),
      ...(classification.horizon
        ? { engagementHorizon: classification.horizon }
        : {}),
      ...(classification.relationshipTypeId
        ? { relationshipTypeId: classification.relationshipTypeId }
        : {}),
    }),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">تسجيل جهة محتملة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تبدأ الجهة في مرحلة «جديدة». أنواع الشراكة والإقرار بالميثاق تُضاف من
          صفحتها بعد الإنشاء.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>بيانات الجهة</CardTitle>
          <CardDescription>
            الاسم القانوني للسجلات، واسم العرض هو ما يظهر في اللوحة وفي الشراكات.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? <Alert>{formError}</Alert> : null}

            <Field
              id="legalNameAr"
              label="الاسم القانوني"
              error={errors.legalNameAr?.message}
            >
              {(props) => <Input {...props} {...register("legalNameAr")} />}
            </Field>

            <Field
              id="displayNameAr"
              label="اسم العرض"
              hint="اتركه فارغًا ليطابق الاسم القانوني."
              error={errors.displayNameAr?.message}
            >
              {(props) => <Input {...props} {...register("displayNameAr")} />}
            </Field>

            <div className="space-y-1.5">
              <Label htmlFor="organizationKind">نوع الجهة</Label>
              <select
                id="organizationKind"
                {...register("organizationKind")}
                aria-invalid={Boolean(errors.organizationKind)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">اختر النوع…</option>
                {Object.entries(ORGANIZATION_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.organizationKind ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.organizationKind.message}
                </p>
              ) : null}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                أشكال المشاركة والدعم
              </legend>
              <p className="text-xs text-muted-foreground">
                كما وردت في الميثاق. يمكن اختيار أكثر من شكل.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(SUPPORT_FORM_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-start gap-2 rounded-md border border-border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={supportForms.includes(value as SupportForm)}
                      onChange={(event) =>
                        setSupportForms((current) =>
                          event.target.checked
                            ? [...current, value as SupportForm]
                            : current.filter((item) => item !== value),
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              id="websiteUrl"
              label="الموقع الإلكتروني"
              error={errors.websiteUrl?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  {...register("websiteUrl")}
                  dir="ltr"
                  className="text-start"
                  placeholder="https://example.org"
                />
              )}
            </Field>

            <Field
              id="summaryAr"
              label="نبذة عن الجهة"
              error={errors.summaryAr?.message}
            >
              {(props) => (
                <textarea
                  {...props}
                  {...register("summaryAr")}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            <Field
              id="internalNotesAr"
              label="ملاحظات داخلية"
              hint="لا تظهر للجهة إطلاقًا، ولا لمن لا يملك صلاحية الاطلاع عليها."
              error={errors.internalNotesAr?.message}
            >
              {(props) => (
                <textarea
                  {...props}
                  {...register("internalNotesAr")}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            {/* المحاور نفسها المستعملة في الشبكة الإعلامية، بمفردات واحدة. */}
            <div className="space-y-4 rounded-md border border-border p-4">
              <div>
                <h2 className="text-sm font-medium">تصنيف العلاقة</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  كلها اختيارية الآن وتُضبط بعد أول تواصل.
                </p>
              </div>

              <ClassificationFields
                value={classification}
                onChange={setClassification}
                idPrefix="partner"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" loading={create.isPending}>
                تسجيل الجهة
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
