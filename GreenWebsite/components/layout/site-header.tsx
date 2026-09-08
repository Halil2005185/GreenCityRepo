"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/layout/logo";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { mainNav, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  /**
   * إغلاق القائمة عند تغيّر المسار: التنقل في App Router لا يعيد تركيب
   * المكوّن، فتبقى القائمة مفتوحة فوق الصفحة الجديدة لولا هذا. الضبط
   * أثناء العرض لا داخل `useEffect` — فيُعاد العرض مرة واحدة قبل أن تظهر
   * القائمة المفتوحة على الشاشة أصلًا.
   */
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${siteConfig.name} — الصفحة الرئيسية`}
          >
            <Logo className="h-8" />
            <span className="text-base font-bold">{siteConfig.name}</span>
          </Link>

          <nav
            aria-label="التنقل الرئيسي"
            className="hidden items-center gap-1 lg:flex"
          >
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/join"
              className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
            >
              انضم إلينا
            </Link>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
              className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </Container>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="التنقل الرئيسي"
          className="border-t border-border bg-background lg:hidden"
        >
          <Container>
            <ul className="flex flex-col py-2">
              {[...mainNav, { href: "/join", label: "انضم إلينا" }].map(
                (item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-3 text-sm font-medium",
                        isActive(item.href)
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </Container>
        </nav>
      )}
    </header>
  );
}
