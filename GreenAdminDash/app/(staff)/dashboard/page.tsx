"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/types.gen";
import { useAuth } from "@/lib/auth/auth-context";
import { countAr } from "@/lib/text/plural-ar";

type Summary = components["schemas"]["DashboardSummary"];

const TASKS = { one: "مهمة واحدة", two: "مهمتان", few: "مهام", many: "مهمة", other: "مهمة" };

function formatValue(value: number) {
  return value.toLocaleString("en-US");
}

/**
 * الرئيسية أعداد تُفتح منها القوائم مرشّحةً بها: «متأخرة» تفتح المهام
 * المتأخرة لا صفحة المهام عامة كما كانت كل البطاقات. البطاقة التي لا تقود
 * إلى قائمة مرشّحة لا رابط لها.
 */
export default function DashboardPage() {
  const { user } = useAuth();

  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<Summary>("/admin/dashboard"),
  });

  if (!user) return null;

  const data = summary.data;
  const loading = summary.isPending;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`أهلًا ${user.fullNameAr}`}
        description={
          loading
            ? "ما يخصّك اليوم."
            : data?.officeNameAr
              ? `${data.officeNameAr} — ما يخصّك اليوم.`
              : "لا عضوية مكتب نشطة. راجع الإدارة لإسنادك."
        }
      />

      {summary.isError ? (
        <div className="rounded-xl border border-border bg-card">
          <ErrorState title="تعذّر تحميل الملخّص." error={summary.error} onRetry={() => void summary.refetch()} />
        </div>
      ) : null}

      {data && data.myTasks.overdue > 0 ? (
        <Alert variant="warning" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
            {/* صيغة لا يتغيّر فعلها بالعدد: «مهمتان تجاوزت» خطأ نحوي. */}
            مهامك المتأخرة عن موعدها: {countAr(data.myTasks.overdue, TASKS)}.
          </p>
          <Link
            href="/dashboard/tasks?view=overdue"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            عرض المتأخرة
          </Link>
        </Alert>
      ) : null}

      <Section title="مهامي">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مفتوحة" value={data?.myTasks.open} loading={loading} href="/dashboard/tasks" />
          <StatCard
            label="متأخرة"
            value={data?.myTasks.overdue}
            loading={loading}
            href="/dashboard/tasks?view=overdue"
            tone="danger"
          />
          <StatCard
            label="متعثّرة"
            value={data?.myTasks.blocked}
            loading={loading}
            href="/dashboard/tasks?view=blocked"
            tone="warning"
          />
          <StatCard
            label="بانتظار الاعتماد"
            value={data?.myTasks.inReview}
            loading={loading}
            href="/dashboard/tasks?view=review"
          />
        </div>
      </Section>

      {data?.officeNameAr ? (
        <Section title={data.officeNameAr}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="مهام المكتب المفتوحة"
              value={data.officeTasks.open}
              href="/dashboard/tasks?tab=office"
            />
            <StatCard
              label="بلا مسؤول"
              value={data.officeTasks.unassigned}
              href="/dashboard/tasks?tab=claimable"
              tone="warning"
            />
            <StatCard
              label="متأخرة"
              value={data.officeTasks.overdue}
              href="/dashboard/tasks?tab=office&view=overdue"
              tone="danger"
            />
            <StatCard
              label="متعثّرة"
              value={data.officeTasks.blocked}
              href="/dashboard/tasks?tab=office&view=blocked"
            />
          </div>
        </Section>
      ) : null}

      {data?.partners ? (
        <Section title="الشركاء">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="في خط المتابعة"
              value={data.partners.pipeline}
              href="/dashboard/partners?stage=PIPELINE"
            />
            <StatCard
              label="بانتظار الاعتماد"
              value={data.partners.pendingApproval}
              href="/dashboard/partners?stage=PENDING_APPROVAL"
              tone="warning"
            />
            <StatCard label="نشطة" value={data.partners.active} href="/dashboard/partners?stage=ACTIVE" />
            <StatCard
              label="معلّقة"
              value={data.partners.suspended}
              href="/dashboard/partners?stage=SUSPENDED"
              tone="danger"
            />
          </div>
        </Section>
      ) : null}

      {data?.initiatives ? (
        <Section title="المبادرات">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="قيد التخطيط"
              value={data.initiatives.planning}
              href="/dashboard/initiatives?status=PLANNING"
            />
            <StatCard
              label="قيد التنفيذ"
              value={data.initiatives.active}
              href="/dashboard/initiatives?status=ACTIVE"
            />
            <StatCard label="حملات" value={data.initiatives.campaigns} href="/dashboard/map" />
            <StatCard label="نقاط خضراء" value={data.initiatives.greenPoints} href="/dashboard/map" />
          </div>
        </Section>
      ) : null}

      {data?.impact && data.impact.length > 0 ? (
        <Section title="الأثر الموثّق" description="ما تحقّق منه الفريق وحده يدخل هذه المجاميع.">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.impact.map((row) => (
              <div key={row.metricId} className="rounded-xl border border-border bg-card p-4">
                <dt className="text-xs text-muted-foreground">
                  {row.metricNameAr} ({row.unitAr})
                </dt>
                <dd className="mt-1 text-2xl font-bold text-success">
                  <span className="numeric">{formatValue(row.total)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      <Section title="عضوياتك" variant="card">
        <ul className="space-y-1.5 text-sm">
          {user.memberships.map((membership) => (
            <li key={membership.officeId} className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{membership.officeNameAr}</span>
              <span className="text-muted-foreground">— {membership.roleNameAr}</span>
              {membership.isPrimary ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  المكتب الرئيس
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="numeric">{user.capabilities.length}</span> صلاحية محلولة من أدوارك.
        </p>
      </Section>
    </div>
  );
}
