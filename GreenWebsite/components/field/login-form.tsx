"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { INPUT_CLASS } from "@/components/field/form";
import { FieldCard, PageTitle } from "@/components/field/states";
import { Button } from "@/components/ui/button";
import { FieldApiError, OfflineError } from "@/lib/field/api";
import { FIELD_ROUTES } from "@/lib/field/config";
import { useFieldSession } from "@/lib/field/session";
import { cn } from "@/lib/utils";

function messageFor(error: unknown) {
  if (error instanceof OfflineError) {
    return "لا اتصال بالشبكة. الدخول يحتاج اتصالًا مرة واحدة، ثم يعمل التطبيق بلا شبكة.";
  }

  if (error instanceof FieldApiError) {
    if (error.status === 429) {
      return "محاولات كثيرة في وقت قصير. انتظر ربع ساعة ثم حاول.";
    }

    return error.message;
  }

  return "تعذّر تسجيل الدخول. حاول مرة أخرى.";
}

export function LoginForm() {
  const router = useRouter();
  const { status, login } = useFieldSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // من له جلسة لا يرى صفحة الدخول: فتحها من رابط قديم يعيده إلى يومه.
  useEffect(() => {
    if (status === "authenticated") router.replace(FIELD_ROUTES.home);
  }, [status, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setSending(true);

    try {
      await login(email.trim(), password);
      router.replace(FIELD_ROUTES.home);
    } catch (error) {
      setFailure(messageFor(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageTitle
        title="تسجيل الدخول"
        description="بحسابك في فريق المدن الخضراء — الحساب نفسه الذي تدخل به لوحة التحكم."
      />

      <FieldCard>
        <form onSubmit={submit} className="space-y-5">
          {failure ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
            >
              {failure}
            </p>
          ) : null}

          <div className="space-y-2">
            <label
              htmlFor="field-email"
              className="block text-sm font-semibold text-foreground"
            >
              البريد الإلكتروني
            </label>
            <input
              id="field-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              dir="ltr"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="field-password"
              className="block text-sm font-semibold text-foreground"
            >
              كلمة المرور
            </label>
            {/*
              الزر بجانب الحقل لا فوقه: زرٌّ يغطي طرف الحقل يبتلع النقر عليه،
              وهو عطلٌ وقع في صفحة دخول اللوحة.
            */}
            <div className="flex gap-2">
              <input
                id="field-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                dir="ltr"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                // Edge يرسم زر إظهار من عنده داخل الحقل؛ زرّنا يكفي.
                className={cn(INPUT_CLASS, "[&::-ms-reveal]:hidden")}
              />
              <button
                type="button"
                onClick={() => setVisible((value) => !value)}
                aria-pressed={visible}
                aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {visible ? (
                  <EyeOff className="size-5" aria-hidden />
                ) : (
                  <Eye className="size-5" aria-hidden />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" size="lg" disabled={sending} className="w-full">
            {sending ? "…جارٍ الدخول" : "دخول"}
          </Button>
        </form>
      </FieldCard>

      <p className="mt-4 px-1 text-sm leading-relaxed text-muted-foreground">
        نسيت كلمة المرور؟ استعدها من صفحة الدخول في لوحة التحكم، ثم عد إلى هنا.
      </p>
    </>
  );
}
