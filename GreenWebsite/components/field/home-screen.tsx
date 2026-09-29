"use client";

import { CloudOff, LogIn, ShieldAlert, Sprout, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { GroupSheet } from "@/components/field/group-sheet";
import {
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import { buttonVariants } from "@/components/ui/button";
import {
  FieldApiError,
  type FieldGroupCard,
  type FieldHome,
  OfflineError,
} from "@/lib/field/api";
import { FIELD_APP_NAME, FIELD_ROUTES } from "@/lib/field/config";
import { chooseGroup, useCurrentGroup } from "@/lib/field/current-group";
import { formatDay } from "@/lib/field/labels";
import { useFieldHome, useFieldSheet } from "@/lib/field/queries";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * شاشة «اليوم»: مدخل التطبيق.
 *
 * تعرض ما يناسب من فتحها: دعوة إلى الدخول لمن لا جلسة له، وورقة يوم
 * المجموعة لقائدها، ورسالة واضحة لمن دخل ولا مجموعة له.
 */
export function HomeScreen() {
  const { status, identity } = useFieldSession();
  const home = useFieldHome();

  if (status === "loading") return <FieldSkeleton />;

  if (status === "anonymous") return <Welcome />;

  if (home.data) return <Groups home={home.data} stale={home.isError} />;

  if (home.isError) return <HomeError error={home.error} />;

  return (
    <>
      <PageTitle
        title="اليوم"
        description={identity ? `أهلًا ${identity.fullNameAr}` : undefined}
      />
      <FieldSkeleton />
    </>
  );
}

function Welcome() {
  return (
    <FieldNotice
      icon={Sprout}
      title={FIELD_APP_NAME}
      description="لقادة المجموعات في حملات المدن الخضراء: ورقة يوم مجموعتك ومهام موقعك في هاتفك، ولو ضعفت الشبكة."
    >
      <Link
        href={FIELD_ROUTES.login}
        className={cn(buttonVariants({ size: "lg" }), "w-full")}
      >
        <LogIn aria-hidden />
        تسجيل الدخول
      </Link>
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

function Groups({ home, stale }: { home: FieldHome; stale: boolean }) {
  const params = useSearchParams();
  const requested = params.get("group");
  const { current, select } = useCurrentGroup(home.groups);

  /**
   * رابط يحمل `?group=` يختار تلك المجموعة — كأن يرسل المنسّق لقائد رابط
   * مجموعته. يُكتب في المخزن فتتبعه بقية التبويبات.
   */
  useEffect(() => {
    if (requested && home.groups.some((group) => group.id === requested)) {
      chooseGroup(requested);
    }
  }, [requested, home.groups]);

  if (!current) {
    return (
      <>
        <PageTitle title="اليوم" description={`أهلًا ${home.user.fullNameAr}`} />
        <FieldNotice
          icon={Users}
          title={
            home.canLead
              ? "لا مجموعة مسندة إليك الآن"
              : "حسابك ليس قائد مجموعة"
          }
          description={
            home.canLead
              ? "حين يسمّيك المنسّق قائدًا لمجموعة في حملة قادمة تظهر ورقة يومها هنا."
              : home.canManage
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
        title={current.nameAr}
        description={[
          current.initiativeNameAr,
          current.meetsAt ? formatDay(current.meetsAt) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {home.groups.length > 1 ? (
        <GroupSwitcher
          groups={home.groups}
          currentId={current.id}
          onSelect={select}
        />
      ) : null}

      <Sheet groupId={current.id} homeStale={stale} />
    </>
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
              ? "border-accent-ink bg-accent-ink text-background"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {group.nameAr}
        </button>
      ))}
    </div>
  );
}

function Sheet({ groupId, homeStale }: { groupId: string; homeStale: boolean }) {
  const sheet = useFieldSheet(groupId);
  const online = useOnline();
  const { status } = useFieldSession();

  if (sheet.data) {
    return (
      <GroupSheet
        sheet={sheet.data}
        refreshing={sheet.isFetching}
        // ما على الشاشة من الجهاز متى تعذّر سؤال الخادم، بأي وجه عُرف ذلك.
        stale={sheet.isError || homeStale || !online || status === "offline"}
        onRefresh={() => void sheet.refetch()}
      />
    );
  }

  if (sheet.isError) {
    const gone =
      sheet.error instanceof FieldApiError && sheet.error.status === 404;

    return sheet.error instanceof OfflineError ? (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="ورقة هذه المجموعة لم تُحفظ بعد"
        description="افتحها مرة والشبكة موصولة، فتبقى على جهازك بعدها."
      />
    ) : (
      <FieldNotice
        icon={ShieldAlert}
        tone="danger"
        title={gone ? "هذه المجموعة لم تعد لك" : "تعذّر تحميل ورقة اليوم"}
        description={
          gone
            ? "أعفاك المنسّق من قيادتها أو حُذفت. حدّث الصفحة لترى مجموعاتك."
            : sheet.error.message
        }
      />
    );
  }

  return <FieldSkeleton />;
}
