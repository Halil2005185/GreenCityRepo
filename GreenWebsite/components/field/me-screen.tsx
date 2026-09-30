"use client";

import {
  ExternalLink,
  KeyRound,
  LogIn,
  LogOut,
  Smartphone,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/field/button";
import { MyDataCard } from "@/components/field/my-data-card";
import { NotificationsCard } from "@/components/field/notifications-card";
import { OutboxList } from "@/components/field/outbox-list";
import {
  FieldCard,
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import { FIELD_ROUTES } from "@/lib/field/config";
import { useDisplayMode } from "@/lib/field/display-mode";
import { formatDay } from "@/lib/field/labels";
import { useOutbox } from "@/lib/field/outbox";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * تبويب «أنا»: من أنا في التطبيق، وما لم يصل مما سجّلته، وكيف يعمل على
 * هذا الجهاز، والخروج.
 */
export function MeScreen() {
  const router = useRouter();
  const { status, identity, user, logout } = useFieldSession();
  const mode = useDisplayMode();
  const online = useOnline();
  const unsent = useOutbox().items.length;
  const [leaving, setLeaving] = useState(false);

  if (status === "loading") return <FieldSkeleton cards={2} />;

  if (status === "anonymous" || !identity) {
    return (
      <>
        <PageTitle title="أنا" />
        <FieldNotice
          icon={UserRound}
          title="لم تسجّل الدخول"
          description="سجّل الدخول بحسابك في الفريق لترى مجموعاتك. والمتطوع يفتح رابطه الشخصي الذي وصله من المنسّق."
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

  const volunteer = identity.kind === "PARTICIPANT";
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
            {identity.kind === "STAFF" ? (
              <p
                dir="ltr"
                className="truncate text-end text-sm text-muted-foreground"
              >
                {identity.email}
              </p>
            ) : (
              <p className="truncate text-sm text-muted-foreground">
                متطوع في {identity.initiativeNameAr}
              </p>
            )}
          </div>
        </div>

        {identity.kind === "PARTICIPANT" ? (
          <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-sm leading-relaxed text-foreground">
            <KeyRound
              className="mt-0.5 size-4 shrink-0 text-accent-ink"
              aria-hidden
            />
            دخلت برابطك الشخصي، وهو صالح حتى {formatDay(identity.expiresAt)}.
            الرابط لك وحدك فلا تشاركه.
          </p>
        ) : null}

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

      <OutboxList />

      <NotificationsCard />

      <FieldCard title="على هذا الجهاز">
        <ul className="space-y-3 text-sm text-foreground">
          <li className="flex items-start gap-3">
            <Smartphone
              className="mt-0.5 size-4 shrink-0 text-accent-ink"
              aria-hidden
            />
            {mode === "standalone"
              ? "التطبيق مثبَّت ويُفتح من أيقونته."
              : volunteer
                ? "تفتح بطاقتك في المتصفح. احفظ رسالة الرابط لتعود إليها، أو ثبّت التطبيق على الشاشة الرئيسية."
                : "تفتح التطبيق في المتصفح. ثبّته على الشاشة الرئيسية ليُفتح من أيقونته ويعمل بلا شبكة."}
          </li>
          <li className="text-muted-foreground">
            {volunteer
              ? online
                ? "بطاقتك تُحفظ على الهاتف عند كل فتح، وتبقى مقروءة أسبوعًا بلا شبكة."
                : "لا اتصال الآن: ما تراه من المحفوظ على الهاتف."
              : online
                ? "ورقة يومك تُحفظ على الجهاز عند كل فتح، وتبقى مقروءة أسبوعًا بلا شبكة. وما تسجّله بلا شبكة يُرسَل حين تعود."
                : "لا اتصال الآن: ما تراه من المحفوظ على الجهاز، وما تسجّله يُحفظ عليه حتى تعود الشبكة."}
          </li>
        </ul>
      </FieldCard>

      {volunteer ? <MyDataCard /> : null}

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
            {leaving
              ? "…جارٍ الخروج"
              : volunteer
                ? "انسَ بطاقتي على هذا الجهاز"
                : "تسجيل الخروج"}
          </Button>
          {unsent > 0 ? (
            // الخروج لا يمسح ما لم يُرسَل، لكنه يوقف إرساله حتى يعود صاحبه.
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-foreground">
              على هذا الهاتف ما لم يُرسَل بعد. إن خرجت الآن بقي محفوظًا باسمك،
              ولا يُرسَل حتى تعود{" "}
              {volunteer ? "وتفتح رابطك" : "وتدخل بحسابك"} من هذا الهاتف نفسه.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {volunteer
                ? "رابطك يبقى صالحًا: تفتحه من رسالته متى شئت فتعود بطاقتك."
                : "الخروج يمسح ما حُفظ من أوراق اليوم عن هذا الجهاز."}
            </p>
          )}
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
