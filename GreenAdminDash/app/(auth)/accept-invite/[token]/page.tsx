"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/types.gen";
import { HOME_PATH } from "@/lib/auth/session-hint";

type InvitationPreview = components["schemas"]["InvitationPreview"];
type SessionResponse = components["schemas"]["SessionResponse"];

/** الحدود مطابقة لـ`acceptInvitationBodySchema` في الباك‌اند. */
const acceptSchema = z
  .object({
    fullNameAr: z
      .string()
      .trim()
      .min(3, "الاسم الكامل مطلوب.")
      .max(160, "الاسم طويل أكثر من اللازم."),
    password: z
      .string()
      .min(12, "كلمة المرور يجب ألا تقل عن 12 محرفًا.")
      .max(128, "كلمة المرور طويلة أكثر من اللازم."),
    passwordConfirm: z.string(),
    phone: z.string().trim().max(32, "رقم الهاتف طويل أكثر من اللازم."),
  })
  /**
   * التأكيد حقل واجهة لا يعرفه الـAPI: كلمة المرور تُكتب مخفية وتُستعمل
   * مرة واحدة عند الإنشاء، فخطأ مطبعي فيها يقفل الحساب على صاحبه.
   */
  .refine((values) => values.password === values.passwordConfirm, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["passwordConfirm"],
  });

type AcceptValues = z.infer<typeof acceptSchema>;

function formatExpiry(iso: string) {
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<AcceptValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: {
      fullNameAr: "",
      password: "",
      passwordConfirm: "",
      phone: "",
    },
  });

  /**
   * المعاينة قبل النموذج: المدعوّ يرى لمن الدعوة وبأي دور قبل أن يكتب
   * كلمة مرور. ورمز منتهٍ أو مستعمل يظهر رسالته هنا بدل أن يكتشفه بعد
   * ملء النموذج.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await apiFetch<InvitationPreview>(
          `/auth/invitations/${encodeURIComponent(token)}`,
          // مسار عام: لا جلسة تُدوَّر، و401 هنا لا يعني رمزًا منتهيًا.
          { skipRefresh: true },
        );

        if (!cancelled) setPreview(data);
      } catch (error) {
        if (cancelled) return;

        setLoadError(
          error instanceof ApiError
            ? error.message
            : "تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const session = await apiFetch<SessionResponse>(
        `/auth/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          body: {
            fullNameAr: values.fullNameAr,
            password: values.password,
            ...(values.phone ? { phone: values.phone } : {}),
          },
          skipRefresh: true,
        },
      );

      /**
       * تنقّل كامل لا `router.replace`.
       *
       * الرد يضبط كوكي التحديث لكن حالة `AuthProvider` في الذاكرة لا
       * تعرف بالجلسة الجديدة، وتنقّل العميل لا يعيد تركيبها. التحميل
       * الكامل يجعلها تُقلع من الكوكي كما تفعل في أي فتح للتبويب.
       */
      window.location.assign(HOME_PATH[session.user.kind]);
    } catch (error) {
      // النموذج يبقى مملوءًا؛ تُمسح الحقول السرية وحدها.
      reset({ ...values, password: "", passwordConfirm: "" });

      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.",
      );
    }
  });

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>دعوة غير صالحة</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert>{loadError}</Alert>

          <p className="text-sm text-muted-foreground">
            روابط الدعوة تنتهي صلاحيتها، وتُستعمل مرة واحدة. اطلب دعوة جديدة
            من إدارة المشروع.
          </p>

          <Link
            href="/login"
            className={buttonVariants({
              variant: "outline",
              className: "w-full",
            })}
          >
            العودة إلى الدخول
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return <Card className="h-80 animate-pulse" aria-busy="true" />;
  }

  const affiliation = preview.officeNameAr ?? preview.partnerNameAr;

  return (
    <Card>
      <CardHeader>
        <CardTitle>قبول الدعوة</CardTitle>
        <CardDescription>
          أنشئ كلمة مرورك لتفعيل الحساب.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">البريد</dt>
            <dd dir="ltr" className="font-medium">
              {preview.email}
            </dd>
          </div>

          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">الدور</dt>
            <dd className="font-medium">{preview.roleNameAr}</dd>
          </div>

          {affiliation ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {preview.kind === "STAFF" ? "المكتب" : "الجهة"}
              </dt>
              <dd className="font-medium">{affiliation}</dd>
            </div>
          ) : null}

          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">تنتهي</dt>
            <dd className="font-medium">{formatExpiry(preview.expiresAt)}</dd>
          </div>
        </dl>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <Alert>{formError}</Alert> : null}

          <Field
            id="fullNameAr"
            label="الاسم الكامل"
            error={errors.fullNameAr?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("fullNameAr")}
                autoComplete="name"
                autoFocus
              />
            )}
          </Field>

          <Field
            id="phone"
            label="رقم الهاتف (اختياري)"
            error={errors.phone?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("phone")}
                type="tel"
                autoComplete="tel"
                dir="ltr"
                className="text-start"
              />
            )}
          </Field>

          <Field
            id="password"
            label="كلمة المرور"
            hint="12 محرفًا فأكثر."
            error={errors.password?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("password")}
                type="password"
                autoComplete="new-password"
                dir="ltr"
                className="text-start"
              />
            )}
          </Field>

          <Field
            id="passwordConfirm"
            label="تأكيد كلمة المرور"
            error={errors.passwordConfirm?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("passwordConfirm")}
                type="password"
                autoComplete="new-password"
                dir="ltr"
                className="text-start"
              />
            )}
          </Field>

          <Button
            type="submit"
            className="w-full"
            loading={isSubmitting || isSubmitSuccessful}
          >
            تفعيل الحساب
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
