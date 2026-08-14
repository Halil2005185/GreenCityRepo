"use client";

import { Building2 } from "lucide-react";

import { AppShell, type NavItem } from "@/components/layout/app-shell";

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/portal", label: "ملف الجهة", icon: Building2 },
];

export function PartnerShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="بوابة الشريك" items={NAV_ITEMS}>
      {children}
    </AppShell>
  );
}
