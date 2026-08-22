"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
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

/** الحد الأدنى مطابق لـ`passwordField` في الباك‌اند. */
const resetSchema = z
  .object({
    password: z
      .string()
      .min(12, "كلمة المرور يجب ألا تقل عن 12 محرفًا.")
      .max(128, "كلمة المرور طويلة أكثر من اللازم."),
    passwordConfirm: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["passwordConfirm"],
  });

type ResetValues = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  /**
   * الرمز يأتي من المسار لأن الرابط في البريد يحمله هناك، ويُرسل في جسم
   * الطلب لأن الـAPI يقرأه من الجسم — فلا يظهر في سجلات الخادم كما يظهر
   * ما في العنوان.
   */
  const { token } = useParams<{ token: string }>();

  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiFetch<void>("/auth/reset-password", {
        method: "POST",
        body: { token, password: values.password },
        skipRefresh: true,
      });

      setDone(true);
    } catch (error) {
      reset({ password: "", passwordConfirm: "" });

      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.",
      );
    }
  });

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>تم تغيير كلمة المرور</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/*
            الخادم يُبطل كل الجلسات عند التعيين، لأن سبب الاستعادة قد يكون
            اختراقًا. فالدخول من جديد ليس خطوة زائدة بل نتيجة مقصودة.
          */}
          <p className="text-sm text-muted-foreground">
            أُبطلت كل الجلسات المفتوحة على هذا الحساب. سجّل الدخول بكلمة
            المرور الجديدة.
          </p>

          <Link href="/login" className={buttonVariants({ className: "w-full" })}>
            تسجيل الدخول
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>كلمة مرور جديدة</CardTitle>
        <CardDescription>
          اختر كلمة مرور لم تستعملها من قبل.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <Alert>{formError}</Alert> : null}

          <Field
            id="password"
            label="كلمة المرور الجديدة"
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
                autoFocus
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

          <Button type="submit" className="w-full" loading={isSubmitting}>
            تعيين كلمة المرور
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
