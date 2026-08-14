"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { HOME_PATH } from "@/lib/auth/session-hint";

const loginSchema = z.object({
  email: z.email("صيغة البريد الإلكتروني غير صحيحة."),
  password: z.string().min(1, "كلمة المرور مطلوبة."),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const user = await login(values.email, values.password);

      /**
       * `next` يأتي من عنوان المتصفح، فلا يُتبع إلا إن كان مسارًا داخليًا
       * يبدأ بشرطة واحدة. قبول `//host` أو `https://…` يحوّل الصفحة إلى
       * أداة تحويل مفتوحة تُستعمل في التصيّد.
       */
      const requested = searchParams.get("next");
      const safeNext =
        requested && requested.startsWith("/") && !requested.startsWith("//")
          ? requested
          : null;

      router.replace(safeNext ?? HOME_PATH[user.kind]);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        return;
      }

      setFormError("تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>تسجيل الدخول</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <Alert>{formError}</Alert> : null}

          <Field id="email" label="البريد الإلكتروني" error={errors.email?.message}>
            {(props) => (
              <Input
                {...props}
                {...register("email")}
                type="email"
                autoComplete="username"
                dir="ltr"
                className="text-start"
                placeholder="name@greencities.sy"
                autoFocus
              />
            )}
          </Field>

          <Field
            id="password"
            label="كلمة المرور"
            error={errors.password?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("password")}
                type="password"
                autoComplete="current-password"
                dir="ltr"
                className="text-start"
              />
            )}
          </Field>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            دخول
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * `useSearchParams` يفرض حدود Suspense وإلا صارت الصفحة كلها ديناميكية
 * وقت البناء.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<Card className="h-64 animate-pulse" />}>
      <LoginForm />
    </Suspense>
  );
}
