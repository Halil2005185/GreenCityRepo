"use client";

import { CloudOff, LogIn, ShieldAlert, Sprout, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import { buttonVariants } from "@/components/field/button";
import {
  FieldApiError,
  type FieldGroupCard,
  type FieldSheet,
  OfflineError,
} from "@/lib/field/api";
import { FIELD_APP_NAME, FIELD_ROUTES } from "@/lib/field/config";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { fieldActions, useGroupSheet } from "@/lib/field/sheet";
import { cn } from "@/lib/utils";

export type SheetView = {
  /** ورقة الخادم وعليها ما ينتظر الإرسال. */
  sheet: FieldSheet;
  actions: ReturnType<typeof fieldActions>;
  /**
   * هل يُسجَّل على هذه الورقة الآن. حين لا يُسجَّل تُخفى الأفعال: زرٌّ يُنقر
   * ثم يُرفض أسوأ من زرٍّ غائب بسببه مكتوبًا.
   */
  writable: boolean;
  /** ما على الشاشة من المحفوظ، وتعذّر سؤال الخادم الآن. */
  stale: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * باب تبويبات المجموعة: «اليوم» و«الحضور» و«الصور».
 *
 * الثلاثة عن المجموعة نفسها، وقبل أن تعرض شيئًا تمرّ بالأسئلة نفسها — هل
 * من جلسة؟ هل من مجموعة؟ هل وصلت ورقتها؟ — فتُجاب هنا مرة، وكل تبويب
 * يكتب ما يخصّه وحده.
 */
export function SheetGate({
  title,
  heading,
  children,
}: {
  /** عنوان التبويب في وضع المتصفح؛ في التطبيق يحمله الشريط المرسوم. */
  title: string;
  /** عنوان غير اسم التبويب متى عُرفت المجموعة — «اليوم» يحمل اسمها. */
  heading?: (group: FieldGroupCard) => { title: string; description: string };
  children: (view: SheetView) => React.ReactNode;
}) {
  const router = useRouter();
  const { status, identity } = useFieldSession();
  const online = useOnline();
  const { home, group, select, query, sheet } = useGroupSheet();

  // تبويبات المجموعة للقائد. حامل رابط شخصي فتح عنوانها يعود إلى بطاقته.
  const volunteer =
    identity?.kind === "PARTICIPANT" &&
    (status === "authenticated" || status === "offline");

  useEffect(() => {
    if (volunteer) router.replace(FIELD_ROUTES.home);
  }, [volunteer, router]);

  if (status === "loading" || volunteer) return <FieldSkeleton />;

  if (status === "anonymous") return <Welcome />;

  if (!home.data) {
    if (home.isError) return <HomeError error={home.error} />;

    return (
      <>
        <PageTitle
          title={title}
          description={identity ? `أهلًا ${identity.fullNameAr}` : undefined}
        />
        <FieldSkeleton />
      </>
    );
  }

  if (!group) {
    const { canLead, canManage, user } = home.data;

    return (
      <>
        <PageTitle title={title} description={`أهلًا ${user.fullNameAr}`} />
        <FieldNotice
          icon={Users}
          title={
            canLead ? "لا مجموعة مسندة إليك الآن" : "حسابك ليس قائد مجموعة"
          }
          description={
            canLead
              ? "حين يسمّيك المنسّق قائدًا لمجموعة في حملة قادمة تظهر ورقة يومها هنا."
              : canManage
                ? "تكوين المجموعات وتسمية قادتها من لوحة التحكم، في تبويب «الميدان» داخل إدارة المبادرة."
                : "التطبيق لقادة المجموعات. اطلب من المنسّق أن يسند إليك دور «قائد مجموعة ميداني»."
          }
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        {...(heading?.(group) ?? {
          title,
          description: `${group.nameAr} · ${group.siteNameAr}`,
        })}
      />

      {home.data.groups.length > 1 ? (
        <GroupSwitcher
          groups={home.data.groups}
          currentId={group.id}
          onSelect={select}
        />
      ) : null}

      {sheet ? (
        children({
          sheet,
          actions: fieldActions(sheet),
          writable:
            sheet.initiative.acceptsEntries && sheet.site.status !== "CANCELLED",
          // من الجهاز متى تعذّر سؤال الخادم، بأي وجه عُرف ذلك.
          stale:
            query.isError || home.isError || !online || status === "offline",
          refreshing: query.isFetching,
          refresh: () => void query.refetch(),
        })
      ) : query.isError ? (
        <SheetError error={query.error} />
      ) : (
        <FieldSkeleton />
      )}
    </>
  );
}

function Welcome() {
  return (
    <FieldNotice
      icon={Sprout}
      title={FIELD_APP_NAME}
      description="لقادة المجموعات في حملات المدن الخضراء: ورقة يوم مجموعتك، وحضور متطوعيها، وأعداد موقعها وصوره — في هاتفك، ولو ضعفت الشبكة."
    >
      <div className="w-full space-y-4">
        <Link
          href={FIELD_ROUTES.login}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          <LogIn aria-hidden />
          تسجيل الدخول
        </Link>
        <p className="text-sm leading-relaxed text-foreground">
          متطوع؟ افتح رابطك الشخصي الذي وصلك من منسّق الحملة: فيه موعدك وموقعك،
          بلا حساب ولا كلمة مرور.
        </p>
      </div>
    </FieldNotice>
  );
}

function HomeError({ error }: { error: Error }) {
  if (error instanceof OfflineError) {
    return (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="لا اتصال، ولا شيء محفوظ بعد"
        description="ورقة يومك تُحفظ على هذا الجهاز عند أول فتح والشبكة موصولة. اتصل مرة واحدة ثم تعمل بلا شبكة."
      />
    );
  }

  const denied = error instanceof FieldApiError && error.status === 403;

  return (
    <FieldNotice
      icon={ShieldAlert}
      tone="danger"
      title={denied ? "حسابك لا يفتح التطبيق الميداني" : "تعذّر تحميل ورقة اليوم"}
      description={
        denied
          ? "التطبيق لقادة المجموعات من فريق المدن الخضراء. راجع المنسّق إن كنت منهم."
          : error.message
      }
    />
  );
}

function SheetError({ error }: { error: Error }) {
  if (error instanceof OfflineError) {
    return (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="ورقة هذه المجموعة لم تُحفظ بعد"
        description="افتحها مرة والشبكة موصولة، فتبقى على جهازك بعدها."
      />
    );
  }

  const gone = error instanceof FieldApiError && error.status === 404;

  return (
    <FieldNotice
      icon={ShieldAlert}
      tone="danger"
      title={gone ? "هذه المجموعة لم تعد لك" : "تعذّر تحميل ورقة اليوم"}
      description={
        gone
          ? "أعفاك المنسّق من قيادتها أو حُذفت. حدّث الصفحة لترى مجموعاتك."
          : error.message
      }
    />
  );
}

/**
 * القائد قد يقود أكثر من مجموعة في موسم واحد. الحبّات تمرّر أفقيًا بدل
 * قائمة منسدلة: المجموعات قليلة، والاسم كاملًا أوضح من سهم يخفيه.
 */
function GroupSwitcher({
  groups,
  currentId,
  onSelect,
}: {
  groups: readonly FieldGroupCard[];
  currentId: string;
  onSelect: (groupId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="مجموعاتي"
      className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          aria-pressed={group.id === currentId}
          onClick={() => onSelect(group.id)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            group.id === currentId
              ? "border-accent-ink bg-accent-ink text-[var(--brand-warm-beige)]"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {group.nameAr}
        </button>
      ))}
    </div>
  );
}
