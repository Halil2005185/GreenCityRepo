"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
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

const forgotSchema = z.object({
  email: z.email("صيغة البريد الإلكتروني غير صحيحة."),
});

type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiFetch<void>("/auth/forgot-password", {
        method: "POST",
        body: { email: values.email },
        skipRefresh: true,
      });

      setSent(true);
    } catch (error) {
      /**
       * الخادم يعيد 202 سواء وُجد البريد أو لا. فالخطأ هنا لا يكشف حسابًا،
       * وأرجحه تجاوز حد المحاولات — وهو ما يستحق أن يُعرض كما هو.
       */
      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.",
      );
    }
  });

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>تحقّق من بريدك</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/*
            صياغة محايدة عمدًا: تأكيد الإرسال لبريد بعينه يحوّل الصفحة إلى
            أداة تكشف من له حساب ومن ليس له.
          */}
          <p className="text-sm text-muted-foreground">
            إن كان هذا البريد مسجّلًا لدينا فقد أُرسل إليه رابط لتعيين كلمة
            مرور جديدة. الرابط صالح لساعة واحدة ويُستعمل مرة واحدة.
          </p>

          <p className="text-sm text-muted-foreground">
            لم يصلك شيء؟ راجع مجلد البريد غير المرغوب، أو تواصل مع إدارة
            المشروع.
          </p>

          <Link href="/login" className={buttonVariants({ className: "w-full" })}>
            العودة إلى الدخول
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>استعادة كلمة المرور</CardTitle>
        <CardDescription>
          أدخل بريدك ونرسل إليك رابط تعيين كلمة مرور جديدة.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <Alert>{formError}</Alert> : null}

          <Field
            id="email"
            label="البريد الإلكتروني"
            error={errors.email?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("email")}
                type="email"
                autoComplete="username"
                dir="ltr"
                className="text-start"
                autoFocus
              />
            )}
          </Field>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            إرسال الرابط
          </Button>

          <Link
            href="/login"
            className={buttonVariants({
              variant: "ghost",
              className: "w-full",
            })}
          >
            العودة إلى الدخول
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
