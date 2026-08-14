"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
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

  /**
   * `proxy.ts` يفحص كوكي التلميح وحده. الجلسة قد تكون سقطت فعلًا —
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

  return (
    <div className="flex min-h-dvh">
      {/* الحدود المنطقية (`border-e`) تنعكس تلقائيًا تحت dir="rtl". */}
      <aside className="hidden w-64 shrink-0 border-e border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border p-5">
          <p className="text-lg font-bold text-primary">المدن الخضراء</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{title}</p>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="التنقل الرئيسي">
          {visibleItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              }
            />
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-medium">{user.fullNameAr}</p>
          <p className="truncate text-xs text-muted-foreground">
            {primaryMembership?.roleNameAr ?? "بلا دور"}
            {primaryMembership ? ` · ${primaryMembership.officeNameAr}` : ""}
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start px-2"
            onClick={() => void logout()}
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-3 md:hidden">
          <p className="font-bold text-primary">المدن الخضراء</p>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="size-4" />
            خروج
          </Button>
        </header>

        <main className="flex-1 p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
