"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LogOut, Menu } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { IconButton } from "@/components/ui/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/ui/states";
import { useAuth } from "@/lib/auth/auth-context";
import type { Capability } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** يُخفى العنصر إن لم يملك المستخدم أيًّا من هذه القدرات. */
  requires?: readonly Capability[];
};

/**
 * العنصر النشط هو أطول رابط يطابق المسار: `/dashboard` يطابق كل صفحات
 * اللوحة بالبادئة، فكانت «الرئيسية» تظهر نشطة مع كل عنصر آخر.
 */
function activeHref(items: readonly NavItem[], pathname: string) {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce<string | null>(
      (best, item) => (best === null || item.href.length > best.length ? item.href : best),
      null,
    );
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: readonly NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = activeHref(items, pathname);

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === active;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ title }: { title: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Logo className="h-9" />
        <p className="text-lg font-bold text-primary">المدن الخضراء</p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{title}</p>
    </div>
  );
}

function UserFooter({
  name,
  role,
  onLogout,
}: {
  name: string;
  role: string;
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-border p-4">
      <p className="truncate text-sm font-medium">{name}</p>
      <p className="truncate text-xs text-muted-foreground">{role}</p>

      <Button
        variant="ghost"
        size="sm"
        className="mt-3 w-full justify-start px-2"
        onClick={onLogout}
      >
        <LogOut className="size-4" />
        تسجيل الخروج
      </Button>
    </div>
  );
}

export function AppShell({
  title,
  items,
  children,
}: {
  title: string;
  items: readonly NavItem[];
  children: React.ReactNode;
}) {
  const { status, user, logout, canAny } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  /**
   * `middleware.ts` يفحص كوكي التلميح وحده. الجلسة قد تكون سقطت فعلًا —
   * انتهت أو أُبطلت من جهاز آخر — فالتحقق الحقيقي يحدث هنا بعد أن
   * يحاول `AuthProvider` تدويرها.
   */
  useEffect(() => {
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">جارٍ التحقق من الجلسة…</p>
      </div>
    );
  }

  const visibleItems = items.filter(
    (item) => !item.requires || canAny(...item.requires),
  );

  const primaryMembership =
    user.memberships.find((membership) => membership.isPrimary) ??
    user.memberships[0];

  const roleLine = `${primaryMembership?.roleNameAr ?? "بلا دور"}${
    primaryMembership ? ` · ${primaryMembership.officeNameAr}` : ""
  }`;

  return (
    <div className="flex min-h-dvh">
      {/*
        الشريط الجانبي في جهة البداية (يمين تحت RTL) ولاصق بارتفاع الشاشة،
        فيبقى التنقل في متناول اليد مهما طالت الصفحة.
      */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-card md:flex">
        <div className="border-b border-border p-5">
          <Brand title={title} />
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="التنقل الرئيسي">
          <NavList items={visibleItems} pathname={pathname} />
        </nav>

        <UserFooter name={user.fullNameAr} role={roleLine} onLogout={() => void logout()} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          على الجوال يختفي الشريط الجانبي، فزر القائمة يفتحه لوحةً من جهة
          البداية نفسها — الاستثناء الوحيد من فتح اللوحات من جهة النهاية.
        */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 md:hidden">
          <IconButton
            label="فتح قائمة التنقل"
            icon={Menu}
            size="icon"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          />
          <Link href={items[0]?.href ?? "/"} className="flex items-center gap-2">
            <Logo className="h-8" />
            <span className="font-bold text-primary">المدن الخضراء</span>
          </Link>
        </header>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="start" width="sm" className="md:hidden">
            <div className="border-b border-border p-5 pe-12">
              <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
              <SheetDescription className="sr-only">{title}</SheetDescription>
              <Brand title={title} />
            </div>
            <nav className="flex-1 overflow-y-auto p-3" aria-label="التنقل الرئيسي">
              <NavList
                items={visibleItems}
                pathname={pathname}
                onNavigate={() => setNavOpen(false)}
              />
            </nav>
            <UserFooter name={user.fullNameAr} role={roleLine} onLogout={() => void logout()} />
          </SheetContent>
        </Sheet>

        {/*
          حاوية واحدة بعرض أقصى وحشوات ثابتة لكل الصفحات، فلا تقيّد صفحة
          نفسها بـ`max-w-2xl` وتمتد جارتها بلا حد. `flex-1` يمنح صفحة الخريطة
          ارتفاع مساحة المحتوى كاملة.

          حدّ Suspense لازم لأن الصفحات تقرأ حالتها من العنوان
          (`useSearchParams`)، وبدونه يفشل بناء الصفحات الساكنة.
        */}
        <main className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5 md:px-8 md:py-8">
            <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
