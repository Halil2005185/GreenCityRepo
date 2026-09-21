"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { InitiativeEditDialog } from "@/components/initiatives/initiative-dialogs";
import {
  AreasSection,
  SitesSection,
  TargetsSection,
  WorkPlanSection,
} from "@/components/initiatives/manage-sections";
import {
  rollupLine,
  useInitiativeLifecycle,
} from "@/components/initiatives/use-initiative-lifecycle";
import { Badge } from "@/components/ui/badge";
import { Checklist } from "@/components/ui/checklist";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DetailSkeleton, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { UrlTabs } from "@/components/ui/url-tabs";
import { ApiError } from "@/lib/api/client";
import { ROLLUP_SHORT, getInitiative, type InitiativeDetail } from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils";

const BREADCRUMB_ROOT = { label: "المبادرات", href: "/dashboard/initiatives" };

const POLICY_NOTES: Record<InitiativeDetail["rollup"]["policy"], string> = {
  STRICT: "المطابقة صارمة: أي اختلاف في المجموع يمنع بدء التنفيذ.",
  ADVISORY: "المطابقة إرشادية: يُنبَّه إلى الاختلاف ولا يُمنع البدء.",
  NONE: "بلا مطابقة: الأهداف لا تُفحص قبل البدء.",
};

/**
 * إدارة المبادرة بعمود واحد: الترويسة بأفعال دورة الحياة، وشروط البدء ما
 * دامت المبادرة لم تبدأ، وملخص «مفتاح: قيمة»، ثم تبويبات للمواقع والأهداف
 * وخطة العمل والنطاق. كانت عمودين بسبع بطاقات وأربعة نماذج مفتوحة في
 * الصفحة؛ صارت كل إضافة وتعديل نافذة من زرها.
 */
export default function InitiativeManagePage() {
  const params = useParams<{ id: string }>();
  const initiativeId = params.id;

  const initiative = useQuery({
    queryKey: ["initiative", initiativeId],
    queryFn: () => getInitiative(initiativeId),
  });

  if (initiative.isPending) return <DetailSkeleton />;

  if (initiative.isError) {
    const notFound = initiative.error instanceof ApiError && initiative.error.status === 404;

    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[BREADCRUMB_ROOT]} title="إدارة المبادرة" />
        <div className="rounded-xl border border-border bg-card">
          <ErrorState
            title={notFound ? "لا توجد مبادرة بهذا الرابط." : "تعذّر تحميل المبادرة."}
            error={notFound ? undefined : initiative.error}
            onRetry={notFound ? undefined : () => void initiative.refetch()}
          />
        </div>
      </div>
    );
  }

  return <ManageView initiative={initiative.data} />;
}

function ManageView({ initiative: data }: { initiative: InitiativeDetail }) {
  const [editOpen, setEditOpen] = useState(false);
  const lifecycle = useInitiativeLifecycle(data);
  const prelaunch = data.status === "DRAFT" || data.status === "PLANNING";
  const policy = data.rollup.policy;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          BREADCRUMB_ROOT,
          { label: data.nameAr, href: `/dashboard/initiatives/${data.id}` },
          { label: "الإدارة" },
        ]}
        title={data.nameAr}
        description={[data.programNameAr, data.season].filter(Boolean).join(" · ")}
        badges={
          <>
            <StatusBadge kind="initiativeStatus" value={data.status} />
            <Badge tone="outline">مطابقة {ROLLUP_SHORT[policy]}</Badge>
          </>
        }
        // قبل البدء الزر الأساسي هو البدء نفسه؛ بعده لا فعل يستحق الصدارة.
        primaryAction={lifecycle.launch}
        secondaryActions={[
          {
            key: "edit",
            label: "تعديل البيانات",
            icon: Pencil,
            requires: [CAPABILITIES.initiativesManage],
            onSelect: () => setEditOpen(true),
          },
          { key: "view", label: "عرض الصفحة", icon: Eye, href: `/dashboard/initiatives/${data.id}` },
        ]}
        menuActions={[lifecycle.complete, lifecycle.cancel, lifecycle.remove]}
      />

      {prelaunch ? (
        <Section
          title="شروط بدء التنفيذ"
          description="تُحسب في الخادم مع كل قراءة؛ هي نفسها ما يفحصه زر «بدء التنفيذ»."
          variant="card"
        >
          <Checklist
            items={[
              {
                key: "sites",
                label: "موقع تنفيذ واحد على الأقل",
                done: lifecycle.liveSites.length > 0,
              },
              ...(policy === "NONE"
                ? []
                : data.rollup.metrics.map((metric) => ({
                    key: metric.metricId,
                    label: `مطابقة «${metric.metricNameAr}»`,
                    done: metric.matches,
                    hint: rollupLine(metric),
                  }))),
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {POLICY_NOTES[policy]}
            {policy !== "NONE" && data.rollup.metrics.length === 0
              ? " لا أهداف مسجّلة بعد: حدّد هدفًا للمبادرة وأهدافًا لمواقعها."
              : ""}
          </p>
        </Section>
      ) : null}

      <DescriptionList
        items={[
          { label: "البرنامج", value: data.programNameAr },
          { label: "الموسم", value: data.season },
          { label: "تاريخ البدء", value: data.startsAt ? formatDate(data.startsAt) : null },
          { label: "تاريخ الانتهاء", value: data.endsAt ? formatDate(data.endsAt) : null },
          { label: "المسؤول", value: data.leadNameAr },
          { label: "سياسة المطابقة", value: ROLLUP_SHORT[policy] },
          {
            label: "بدأ التنفيذ",
            hidden: !data.launchedAt,
            value: data.launchedAt ? formatDate(data.launchedAt) : null,
          },
          {
            label: "اكتملت",
            hidden: !data.completedAt,
            value: data.completedAt ? formatDate(data.completedAt) : null,
          },
          { label: "نبذة", wide: true, value: data.summaryAr },
        ]}
      />

      <UrlTabs
        label="أقسام إدارة المبادرة"
        tabs={[
          {
            value: "sites",
            label: "المواقع",
            count: lifecycle.liveSites.length,
            content: <SitesSection initiative={data} />,
          },
          {
            value: "targets",
            label: "الأهداف والتقدم",
            content: <TargetsSection initiative={data} />,
          },
          {
            value: "work",
            label: "خطة العمل",
            count: data.work.workItems.length,
            content: <WorkPlanSection initiative={data} />,
          },
          {
            value: "areas",
            label: "النطاق الجغرافي",
            count: data.areas.length,
            content: <AreasSection initiative={data} />,
          },
        ]}
      />

      <InitiativeEditDialog initiative={data} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
