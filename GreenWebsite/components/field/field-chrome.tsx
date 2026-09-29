"use client";

import {
  CalendarCheck,
  Camera,
  IdCard,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { FieldBrand } from "@/components/field/brand";
import { InstallBanner } from "@/components/field/install-banner";
import { SyncBadge } from "@/components/field/sync-badge";
import {
  FIELD_APP_NAME,
  FIELD_APP_SHORT_NAME,
  FIELD_ROUTES,
} from "@/lib/field/config";
import { useCurrentGroup } from "@/lib/field/current-group";
import { formatDay } from "@/lib/field/labels";
import { useFieldHome } from "@/lib/field/queries";
import { useFieldSession, useSessionKind } from "@/lib/field/session";
import { cn } from "@/lib/utils";

const LEAD_TABS = [
  { href: FIELD_ROUTES.home, label: "اليوم", icon: CalendarCheck },
  { href: FIELD_ROUTES.attendance, label: "الحضور", icon: Users },
  { href: FIELD_ROUTES.photos, label: "الصور", icon: Camera },
  { href: FIELD_ROUTES.me, label: "أنا", icon: UserRound },
] as const;

/** المتطوع يقرأ ولا يسجّل: بطاقته، وما يخصّه على هذا الجهاز. */
const VOLUNTEER_TABS = [
  { href: FIELD_ROUTES.home, label: "بطاقتي", icon: IdCard },
  { href: FIELD_ROUTES.me, label: "أنا", icon: UserRound },
] as const;

type Tab = (typeof LEAD_TABS | typeof VOLUNTEER_TABS)[number];

const TITLES: Record<string, string> = {
  [FIELD_ROUTES.attendance]: "الحضور",
  [FIELD_ROUTES.photos]: "الصور",
  [FIELD_ROUTES.me]: "أنا",
  [FIELD_ROUTES.link]: "بطاقتي",
  [FIELD_ROUTES.login]: "تسجيل الدخول",
  [FIELD_ROUTES.offline]: "بلا اتصال",
};

/** تبويبات عن المجموعة نفسها: رأسها يقول أي مجموعة. */
const GROUP_TABS: readonly string[] = [
  FIELD_ROUTES.home,
  FIELD_ROUTES.attendance,
  FIELD_ROUTES.photos,
];

/** عرض الهاتف حتى على الحاسوب: التطبيق للجوال وحده، ولا تخطيط عريض له. */
const COLUMN = "mx-auto w-full max-w-[30rem] px-4";

/**
 * قشرتا التطبيق في صفحة واحدة، والمتصفح يعرض إحداهما.
 *
 * كلتاهما تُرسمان على الخادم، و`app:` يختار بينهما في CSS: في المتصفح رأس
 * الموقع بشعاره وروابط داخل الصفحة، ومن الأيقونة المثبّتة شريط مرسوم باسم
 * المجموعة وشريط تبويب سفلي. لا تبديل في JavaScript، فلا وميض بين التصميمين.
 *
 * `data-field-app` على الجذر هو ما يفتح رموز وضع التطبيق في `globals.css`.
 */
export function FieldChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useFieldSession();
  const kind = useSessionKind();

  // صفحة الدخول بلا تبويبات: لا شيء يُنتقل إليه قبل الدخول.
  const showTabs = kind !== null;
  const tabs: readonly Tab[] =
    kind === "PARTICIPANT" ? VOLUNTEER_TABS : LEAD_TABS;

  return (
    <div data-field-app className="flex min-h-dvh flex-col bg-background">
      <BrowserHeader pathname={pathname} tabs={showTabs ? tabs : null} />
      <AppHeader
        pathname={pathname}
        signedOut={status === "anonymous"}
        volunteer={kind === "PARTICIPANT"}
      />

      <InstallBanner />

      <main
        id="main"
        className={cn(
          COLUMN,
          "flex-1 py-6",
          // يُفسح لشريط التبويب الثابت وما تحته من حافة الجهاز.
          showTabs && "app:pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </main>

      {showTabs ? <TabBar pathname={pathname} tabs={tabs} /> : null}
    </div>
  );
}

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

function BrowserHeader({
  pathname,
  tabs,
}: {
  pathname: string;
  /** `null` قبل الدخول: لا تبويبات. */
  tabs: readonly Tab[] | null;
}) {
  const showTabs = tabs !== null;

  return (
    <header className="app:hidden border-b border-border bg-background">
      <div className={cn(COLUMN, "flex items-center justify-between gap-3 py-4")}>
        {/* الشعار يعيد إلى الموقع: هذا وضعه، والتطبيق صفحة منه. */}
        <Link
          href="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <FieldBrand />
        </Link>

        {/* بعد الدخول تقول التبويبات أين أنت، فيأخذ مكانَ الشارة حالُ الإرسال. */}
        {showTabs ? (
          <SyncBadge />
        ) : (
          <span className="rounded-full bg-surface-strong px-3 py-1 text-xs font-medium text-accent-ink">
            التطبيق الميداني
          </span>
        )}
      </div>

      {showTabs ? (
        <nav
          aria-label="أقسام التطبيق"
          className={cn(COLUMN, "flex gap-1 overflow-x-auto pb-3")}
        >
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive(pathname, tab.href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(pathname, tab.href)
                  ? // بيج صلب لا `text-background`: خلفية الموقع شفيفة.
                    "bg-accent-ink text-[var(--brand-warm-beige)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

/**
 * رأس التطبيق: شريط أخضر عميق يقول أين أنت وهل أنت متصل.
 *
 * لون صلب بلا لوحة مرسومة: صور الموقع تمرّ بمحسِّن الصور ولا تُحفظ مع
 * القشرة، ورأسٌ تغيب خلفيته بلا شبكة أسوأ من رأس بلا لوحة.
 */
function AppHeader({
  pathname,
  signedOut,
  volunteer,
}: {
  pathname: string;
  signedOut: boolean;
  volunteer: boolean;
}) {
  const { identity } = useFieldSession();
  const home = useFieldHome();
  const { current } = useCurrentGroup(home.data?.groups);

  /**
   * بلا جلسة لا مجموعة في الرأس، ولو بقيت ورقتها في المحفوظ: من انتهت جلسته
   * يرى دعوة الدخول، لا اسم مجموعة فوقها. وأثناء التحقق من الجلسة تبقى
   * المجموعة المحفوظة ظاهرة، فلا يومض الرأس عند كل فتح.
   */
  const group =
    !signedOut && GROUP_TABS.some((href) => isActive(pathname, href))
      ? current
      : null;

  /**
   * «اليوم» يحمل اسم المجموعة عنوانًا وموقعَها وموعدها تحته. وبقية تبويباتها
   * تحمل اسمها هي، والمجموعة تحته: القائد يعرف أين هو ولمن يسجّل.
   */
  const onHome = isActive(pathname, FIELD_ROUTES.home);
  // صفحتا الدخول و«بلا اتصال» لهما اسمهما دائمًا؛ وبقية الأسماء لمن له جلسة.
  const open =
    pathname === FIELD_ROUTES.login || pathname === FIELD_ROUTES.offline;
  const title = signedOut && !open
    ? FIELD_APP_SHORT_NAME
    : volunteer && onHome
      ? "بطاقتي"
      : ((onHome ? group?.nameAr : TITLES[pathname]) ?? "اليوم");
  const subtitle = volunteer && identity?.kind === "PARTICIPANT"
    ? identity.initiativeNameAr
    : !group
    ? FIELD_APP_NAME
    : onHome
      ? [group.siteNameAr, group.meetsAt ? formatDay(group.meetsAt) : null]
          .filter(Boolean)
          .join(" · ")
      : `${group.nameAr} · ${group.siteNameAr}`;

  return (
    <header className="on-painted sticky top-0 z-40 hidden rounded-b-3xl bg-background pt-[env(safe-area-inset-top)] shadow-sm app:block">
      <div className={cn(COLUMN, "flex items-start justify-between gap-3 py-4")}>
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-bold leading-snug text-foreground">
            {title}
          </h1>
          {/* بيجٌ كامل لا مخفَّف: قاعدة الشريط المرسوم في `globals.css`. */}
          <p className="truncate text-sm text-foreground">{subtitle}</p>
        </div>

        {/* قبل الدخول أيضًا: صفحة الدخول بلا شبكة تقول لماذا لا تُدخل. */}
        <SyncBadge className="mt-1" />
      </div>
    </header>
  );
}

function TabBar({
  pathname,
  tabs,
}: {
  pathname: string;
  tabs: readonly Tab[];
}) {
  return (
    <nav
      aria-label="تبويبات التطبيق"
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-border bg-card pb-[env(safe-area-inset-bottom)] app:block"
    >
      <ul className={cn(COLUMN, "flex items-stretch justify-around gap-1 py-2")}>
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // هدف لمس بارتفاع 56px: يُضغط بإبهام وقفّاز.
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-accent-ink" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary text-primary-foreground",
                  )}
                >
                  <tab.icon className="size-5" aria-hidden />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
