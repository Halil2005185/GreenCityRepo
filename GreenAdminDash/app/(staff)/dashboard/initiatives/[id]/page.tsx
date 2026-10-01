"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Pencil, Settings2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { StoryDialog } from "@/components/initiatives/initiative-dialogs";
import { lookupLabel } from "@/components/lookups/lookup-select";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DetailSkeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/client";
import { getInitiative } from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils";

const BREADCRUMB_ROOT = { label: "المبادرات", href: "/dashboard/initiatives" };

function formatValue(value: number, decimals = 0) {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/**
 * صفحة المبادرة كما تُقرأ، لا كما تُدار.
 *
 * القادم من الخريطة يريد القصة والأرقام لا أزرار التشغيل، والنقطة الخضراء
 * لا إدارة لها أصلًا. الإدارة تعيش في `/manage` ويصل إليها من يملك صلاحيتها
 * من زر الترويسة؛ وتحرير القصة نافذة بدل نموذج يُفتح داخل النص.
 */
export default function InitiativeStoryPage() {
  const params = useParams<{ id: string }>();
  const initiativeId = params.id;
  const [storyOpen, setStoryOpen] = useState(false);

  const initiative = useQuery({
    queryKey: ["initiative", initiativeId],
    queryFn: () => getInitiative(initiativeId),
  });

  if (initiative.isPending) return <DetailSkeleton />;

  if (initiative.isError) {
    const notFound = initiative.error instanceof ApiError && initiative.error.status === 404;

    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[BREADCRUMB_ROOT]} title="صفحة المبادرة" />
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

  const data = initiative.data;
  const isGreenPoint = data.kind === "GREEN_POINT";
  const counted = data.progress.filter((row) => row.actual > 0);
  const place = data.areas[0]?.areaNameAr ?? data.sites[0]?.areaNameAr ?? data.sites[0]?.nameAr;
  const contributor = data.contributorNameAr
    ? `${data.contributorNameAr}${data.contributorKind ? ` (${lookupLabel(data.contributorKind)})` : ""}`
    : null;

  const editStory = {
    key: "story",
    label: "تعديل القصة",
    icon: Pencil,
    requires: [CAPABILITIES.initiativesManage],
    onSelect: () => setStoryOpen(true),
  };
  const manage = {
    key: "manage",
    label: "إدارة المبادرة",
    icon: Settings2,
    href: `/dashboard/initiatives/${data.id}/manage`,
    requires: [CAPABILITIES.initiativesManage],
  };
  const onMap = {
    key: "map",
    label: "عرض على الخريطة",
    icon: MapPin,
    href: "/dashboard/map",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[BREADCRUMB_ROOT, { label: data.nameAr }]}
        title={data.nameAr}
        description={[data.programNameAr, contributor, place, data.startsAt && formatDate(data.startsAt)]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <>
            <StatusBadge kind="pointKind" value={data.kind} />
            <StatusBadge kind="initiativeStatus" value={data.status} />
          </>
        }
        primaryAction={isGreenPoint ? editStory : manage}
        secondaryActions={isGreenPoint ? [onMap] : [editStory, onMap]}
      />

      {/* عمود قراءة بعرض مريح للنص، في جهة البداية تحت العنوان. */}
      <article className="max-w-3xl space-y-6">
        {data.coverImageUrl ? (
          // صورة مرفوعة إلى التخزين بأبعاد حرة؛ مكوّن الصورة يطلب أبعادًا لا نعرفها.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.coverImageUrl}
            alt={data.nameAr}
            className="w-full rounded-xl border border-border object-cover"
          />
        ) : null}

        {counted.length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            {counted.map((row) => (
              <div key={row.metricId} className="rounded-xl border border-border bg-card p-4">
                <dt className="text-xs text-muted-foreground">
                  {row.metricNameAr} ({row.unitAr})
                </dt>
                <dd className="mt-1">
                  <span className="numeric text-2xl font-bold">
                    {formatValue(row.actual, row.decimals)}
                  </span>
                  {row.initiativeTarget !== null ? (
                    <span className="ms-2 text-xs text-muted-foreground">
                      من <span className="numeric">{formatValue(row.initiativeTarget, row.decimals)}</span>
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {data.summaryAr ? (
          <p className="text-lg leading-relaxed text-muted-foreground">{data.summaryAr}</p>
        ) : null}

        {data.storyAr ? (
          // الفقرات مفصولة بسطر فارغ — أبسط ما يكفي قبل محرّر نصوص.
          <div className="space-y-4 text-base leading-loose">
            {data.storyAr.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border">
            <EmptyState
              title="لا تفاصيل مكتوبة بعد"
              description="القصة وصورة الغلاف أول ما يراه القادم من الخريطة."
              action={editStory}
            />
          </div>
        )}

        {!isGreenPoint && data.sites.length > 0 ? (
          <Section title="مواقع التنفيذ">
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.sites
                .filter((site) => site.status !== "CANCELLED")
                .map((site) => (
                  <li key={site.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {site.nameAr}
                      <StatusBadge kind="siteStatus" value={site.status} />
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {site.areaNameAr ?? "بلا منطقة محددة"}
                      {site.targets.length > 0
                        ? ` · ${site.targets
                            .map((target) => `${formatValue(target.value, target.decimals)} ${target.unitAr}`)
                            .join("، ")}`
                        : ""}
                    </p>
                  </li>
                ))}
            </ul>
          </Section>
        ) : null}
      </article>

      <StoryDialog initiative={data} open={storyOpen} onOpenChange={setStoryOpen} />
    </div>
  );
}
