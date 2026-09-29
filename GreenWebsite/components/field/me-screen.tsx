"use client";

import { ExternalLink, LogIn, LogOut, Smartphone, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FieldCard,
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { FIELD_ROUTES } from "@/lib/field/config";
import { useDisplayMode } from "@/lib/field/display-mode";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * تبويب «أنا»: من أنا في التطبيق، وكيف يعمل على هذا الجهاز، والخروج.
 */
export function MeScreen() {
  const router = useRouter();
  const { status, identity, user, logout } = useFieldSession();
  const mode = useDisplayMode();
  const online = useOnline();
  const [leaving, setLeaving] = useState(false);

  if (status === "loading") return <FieldSkeleton cards={2} />;

  if (status === "anonymous" || !identity) {
    return (
      <>
        <PageTitle title="أنا" />
        <FieldNotice
          icon={UserRound}
          title="لم تسجّل الدخول"
          description="سجّل الدخول بحسابك في الفريق لترى مجموعاتك."
        >
          <Link
            href={FIELD_ROUTES.login}
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            <LogIn aria-hidden />
            تسجيل الدخول
          </Link>
        </FieldNotice>
      </>
    );
  }

  async function leave() {
    setLeaving(true);

    try {
      await logout();
      router.replace(FIELD_ROUTES.home);
    } finally {
      setLeaving(false);
    }
  }

  const memberships = user?.memberships ?? [];

  return (
    <div className="space-y-4">
      <PageTitle title="أنا" />

      <FieldCard>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
            <UserRound className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-foreground">
              {identity.fullNameAr}
            </p>
            <p dir="ltr" className="truncate text-end text-sm text-muted-foreground">
              {identity.email}
            </p>
          </div>
        </div>

        {memberships.length > 0 ? (
          <ul className="mt-4 space-y-1 border-t border-border pt-3">
            {memberships.map((membership) => (
              <li
                key={`${membership.officeId}:${membership.roleId}`}
                className="text-sm text-foreground"
              >
                {membership.roleNameAr}
                <span className="text-muted-foreground">
                  {" "}
                  — {membership.officeNameAr}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </FieldCard>

      <FieldCard title="على هذا الجهاز">
        <ul className="space-y-3 text-sm text-foreground">
          <li className="flex items-start gap-3">
            <Smartphone
              className="mt-0.5 size-4 shrink-0 text-accent-ink"
              aria-hidden
            />
            {mode === "standalone"
              ? "التطبيق مثبَّت ويُفتح من أيقونته."
              : "تفتح التطبيق في المتصفح. ثبّته على الشاشة الرئيسية ليُفتح من أيقونته ويعمل بلا شبكة."}
          </li>
          <li className="text-muted-foreground">
            {online
              ? "ورقة يومك تُحفظ على الجهاز عند كل فتح، وتبقى مقروءة أسبوعًا بلا شبكة."
              : "لا اتصال الآن: ما تراه من المحفوظ على الجهاز."}
          </li>
        </ul>
      </FieldCard>

      <FieldCard>
        <div className="space-y-3">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={leaving}
            onClick={() => void leave()}
          >
            <LogOut aria-hidden />
            {leaving ? "…جارٍ الخروج" : "تسجيل الخروج"}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            الخروج يمسح ما حُفظ من أوراق اليوم عن هذا الجهاز.
          </p>
        </div>
      </FieldCard>

      <Link
        href="/"
        className={cn(buttonVariants({ variant: "link" }), "w-full")}
      >
        موقع المدن الخضراء
        <ExternalLink aria-hidden />
      </Link>
    </div>
  );
}
