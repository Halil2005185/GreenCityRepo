"use client";

import {
  Building2,
  CheckSquare,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Mail,
  Map,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";

import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { CAPABILITIES } from "@/lib/auth/capabilities";

/**
 * التنقل يُعرَّف داخل وحدة عميل لا في التخطيط.
 *
 * الأيقونات مكوّنات — أي دوال — ولا تعبر حدّ الخادم إلى العميل. تعريفها
 * في تخطيط خادمي وتمريرها إلى `AppShell` يفشل وقت البناء.
 *
 * تُعرض العناصر المبنية فعلًا فقط: رابط إلى شاشة غير موجودة يبدو عطلًا
 * لا وعدًا.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  {
    href: "/dashboard/tasks",
    label: "المهام",
    icon: CheckSquare,
    requires: [CAPABILITIES.workView],
  },
  {
    href: "/dashboard/partners",
    label: "الشركاء",
    icon: Building2,
    requires: [CAPABILITIES.partnersView],
  },
  {
    href: "/dashboard/media",
    label: "الشبكة الإعلامية",
    icon: Megaphone,
    requires: [CAPABILITIES.mediaView],
  },
  {
    href: "/dashboard/initiatives",
    label: "المبادرات",
    icon: Sprout,
    requires: [CAPABILITIES.initiativesView],
  },
  {
    href: "/dashboard/map",
    label: "الخريطة",
    icon: Map,
    requires: [CAPABILITIES.initiativesView],
  },
  {
    href: "/dashboard/people",
    label: "الفريق",
    icon: Users,
    // مدير الفريق يرى فريقه فيه وإن لم يحمل `users.view`.
    requires: [CAPABILITIES.usersView, CAPABILITIES.teamManage, CAPABILITIES.teamAll],
  },
  {
    href: "/dashboard/roles",
    label: "الأدوار والصلاحيات",
    icon: ShieldCheck,
    requires: [CAPABILITIES.rolesManage],
  },
  {
    href: "/dashboard/forms",
    label: "الاستمارات",
    icon: ClipboardList,
    requires: [CAPABILITIES.formsView],
  },
  {
    href: "/dashboard/charter",
    label: "الميثاق",
    icon: FileText,
    requires: [CAPABILITIES.charterManage],
  },
  {
    href: "/dashboard/audit",
    label: "سجل التدقيق",
    icon: ScrollText,
    requires: [CAPABILITIES.auditView],
  },
  {
    href: "/dashboard/invitations",
    label: "الدعوات",
    icon: Mail,
    requires: [CAPABILITIES.invitationsManage],
  },
];

export function StaffShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="لوحة فريق إيفا" items={NAV_ITEMS}>
      {children}
    </AppShell>
  );
}
