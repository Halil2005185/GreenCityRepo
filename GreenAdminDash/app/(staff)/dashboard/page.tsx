"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  Handshake,
  Sprout,
} from "lucide-react";
import Link from "next/link";

import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/types.gen";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

type Summary = components["schemas"]["DashboardSummary"];

function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "danger" | "warning";
}) {
  const body = (
    <div
      className={cn(
        "rounded-lg border border-border p-4 transition-colors",
        href && "hover:bg-accent/50",
        tone === "danger" && value > 0 && "border-destructive/40",
        tone === "warning" && value > 0 && "border-warning/40",
      )}
    >
      <p
        className={cn(
          "text-2xl font-bold",
          tone === "danger" && value > 0 && "text-destructive",
          tone === "warning" && value > 0 && "text-warning",
        )}
      >
        {value.toLocaleString("ar-SY")}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { user } = useAuth();

  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<Summary>("/admin/dashboard"),
  });

  if (!user) return null;

  const data = summary.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">أهلًا {user.fullNameAr}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data?.officeNameAr
            ? `${data.officeNameAr} — ما يخصّك اليوم.`
            : "لا عضوية مكتب نشطة. راجع الإدارة لإسنادك."}
        </p>
      </header>

      {summary.isError ? <Alert>تعذّر تحميل الملخّص.</Alert> : null}

      {data && data.myTasks.overdue > 0 ? (
        <Alert variant="info">
          <AlertTriangle className="me-1 inline size-4" />
          {data.myTasks.overdue} من مهامك تجاوزت موعدها.
        </Alert>
      ) : null}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CheckSquare className="size-4" />
          مهامي
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="مفتوحة" value={data?.myTasks.open ?? 0} href="/dashboard/tasks" />
          <Stat
            label="متأخرة"
            value={data?.myTasks.overdue ?? 0}
            href="/dashboard/tasks"
            tone="danger"
          />
          <Stat
            label="متعثّرة"
            value={data?.myTasks.blocked ?? 0}
            href="/dashboard/tasks"
            tone="warning"
          />
          <Stat
            label="بانتظار الاعتماد"
            value={data?.myTasks.inReview ?? 0}
            href="/dashboard/tasks"
          />
        </div>
      </section>

      {data?.officeNameAr ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Building2 className="size-4" />
            {data.officeNameAr}
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="مهام المكتب المفتوحة" value={data.officeTasks.open} />
            <Stat
              label="بلا مسؤول"
              value={data.officeTasks.unassigned}
              href="/dashboard/tasks"
              tone="warning"
            />
            <Stat label="متأخرة" value={data.officeTasks.overdue} tone="danger" />
            <Stat label="متعثّرة" value={data.officeTasks.blocked} />
          </div>
        </section>
      ) : null}

      {data?.partners ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Handshake className="size-4" />
            الشركاء
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="في خط المتابعة"
              value={data.partners.pipeline}
              href="/dashboard/partners"
            />
            <Stat
              label="بانتظار الاعتماد"
              value={data.partners.pendingApproval}
              href="/dashboard/partners"
              tone="warning"
            />
            <Stat
              label="نشطة"
              value={data.partners.active}
              href="/dashboard/partners"
            />
            <Stat
              label="معلّقة"
              value={data.partners.suspended}
              tone="danger"
            />
          </div>
        </section>
      ) : null}

      {data?.initiatives ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sprout className="size-4" />
            المبادرات
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="قيد التخطيط"
              value={data.initiatives.planning}
              href="/dashboard/initiatives"
            />
            <Stat
              label="قيد التنفيذ"
              value={data.initiatives.active}
              href="/dashboard/initiatives"
            />
            <Stat
              label="حملات"
              value={data.initiatives.campaigns}
              href="/dashboard/map"
            />
            <Stat
              label="نقاط خضراء"
              value={data.initiatives.greenPoints}
              href="/dashboard/map"
            />
          </div>
        </section>
      ) : null}

      {data?.impact && data.impact.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الأثر الموثّق</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-3">
              {data.impact.map((row) => (
                <li key={row.metricId}>
                  <p className="text-2xl font-bold text-success">
                    {row.total.toLocaleString("ar-SY")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.metricNameAr} ({row.unitAr})
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">صلاحياتك</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            {user.memberships.map((membership) => (
              <li key={membership.officeId}>
                {membership.officeNameAr} — {membership.roleNameAr}
                {membership.isPrimary ? " · رئيسي" : ""}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {user.capabilities.length} قدرة محلولة من أدوارك.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
