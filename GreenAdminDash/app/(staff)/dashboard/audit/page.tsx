"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";

import {
  DataTable,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Select, type SelectOption } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, SearchInput, Toolbar, type ChipOption } from "@/components/ui/toolbar";
import { listAuditLogs, type AuditEntry } from "@/lib/api/work";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { statusOptions } from "@/lib/status";

const SEVERITY_CHIPS: ChipOption[] = [{ value: "", label: "الكل" }, ...statusOptions("auditSeverity")];

/**
 * أنواع الكيانات التي يسجّلها الخادم، بأسمائها العربية. نوع لا يعرفه هذا
 * الجدول يُعرض بمفتاحه كما هو ولا يختفي.
 */
const ENTITY_LABELS: Record<string, string> = {
  partner: "جهة شريكة",
  partner_contact: "جهة اتصال شريك",
  partner_partnership: "نوع شراكة",
  charter_version: "إصدار الميثاق",
  charter_acknowledgement: "إقرار بالميثاق",
  initiative: "مبادرة",
  initiative_site: "موقع مبادرة",
  milestone: "مرحلة عمل",
  work_item: "مهمة",
  impact_entry: "قيد أثر",
  program: "برنامج",
  metric: "مؤشر",
  area: "منطقة",
  media_contact: "شخص في الشبكة الإعلامية",
  media_channel: "شكل عمل إعلامي",
  lookup_list: "تعريف نظام",
  lookup_value: "قيمة في تعريفات النظام",
  user: "عضو",
  role: "دور",
  invitation: "دعوة",
  session: "جلسة دخول",
  form_submission: "طلب استمارة",
};

const ENTITY_OPTIONS: SelectOption[] = Object.entries(ENTITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** صفحة الكيان في اللوحة، لما له صفحة: من السجل إلى ما جرى عليه بنقرة. */
function entityHref(entry: AuditEntry) {
  if (!entry.entityId) return null;

  switch (entry.entityType) {
    case "partner":
      return `/dashboard/partners/${entry.entityId}`;
    case "initiative":
      return `/dashboard/initiatives/${entry.entityId}`;
    case "media_contact":
      return `/dashboard/media/${entry.entityId}`;
    case "user":
      return `/dashboard/people/${entry.entityId}`;
    case "work_item":
      return `/dashboard/tasks?task=${entry.entityId}`;
    case "charter_version":
      return "/dashboard/charter";
    default:
      return null;
  }
}

const col = columnHelper<AuditEntry>();

export default function AuditPage() {
  const [filters, setFilters, resetFilters] = useUrlState({ severity: "", q: "", entity: "" });

  /**
   * السجل بمؤشّر زمني: «تحميل المزيد» يطلب ما قبل آخر صف معروض. كانت
   * الصفحة تعرض أحدث مئة وتطلب ترشيحًا لرؤية ما قبلها.
   */
  const logs = useInfiniteQuery({
    queryKey: ["audit", { severity: filters.severity, q: filters.q, entity: filters.entity }],
    queryFn: ({ pageParam }) =>
      listAuditLogs({
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.entity ? { entityType: filters.entity } : {}),
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => logs.data?.pages.flatMap((page) => page.data), [logs.data]);

  // بلا ترتيب على العميل: القائمة تُحمَّل دفعات، وترتيب ما حُمّل وحده يوهم.
  const columns = useMemo(
    () =>
      col.columns([
        col.display({
          id: "summary",
          header: "ما جرى",
          cell: (info) => {
            const entry = info.row.original;

            return (
              <PrimaryCell
                label={entry.summaryAr ?? entry.action}
                href={entityHref(entry) ?? undefined}
                description={
                  <span dir="ltr" className="font-mono">
                    {entry.action}
                  </span>
                }
              />
            );
          },
        }),
        col.accessor("severity", {
          header: "الأهمية",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="auditSeverity" value={info.getValue()} />,
        }),
        col.display({
          id: "entity",
          header: "الكيان",
          cell: (info) => {
            const entry = info.row.original;

            if (!entry.entityType) return cells.text(null);

            return (
              <div className="space-y-0.5">
                <p>{entry.entityLabel ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                </p>
              </div>
            );
          },
        }),
        col.display({
          id: "actor",
          header: "بواسطة",
          cell: (info) => cells.text(info.row.original.actorNameAr ?? (info.row.original.actorType === "SYSTEM" ? "النظام" : null)),
        }),
        col.accessor("createdAt", {
          header: "الوقت",
          enableSorting: false,
          cell: (info) => cells.dateTime(info.getValue()),
        }),
      ]),
    [],
  );

  const activeCount = [filters.severity, filters.entity].filter(Boolean).length;
  const hasFilters = Boolean(filters.q) || activeCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل التدقيق"
        description="إضافي فقط: كل اعتماد وموافقة وتغيير حالة مسجَّل، ولا يُعدَّل ولا يُحذف."
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="ابحث في الوصف…"
              label="البحث في سجل التدقيق"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={activeCount}
          onReset={resetFilters}
        >
          <FilterChips
            label="الأهمية"
            value={filters.severity}
            onChange={(severity) => setFilters({ severity })}
            options={SEVERITY_CHIPS}
          />
          {/* مرشّح نوع الكيان قائم في الـAPI ولم تكن له واجهة. */}
          <Select
            size="sm"
            label="الكيان"
            placeholder="الكل"
            className="w-56"
            clearable
            options={ENTITY_OPTIONS}
            value={filters.entity || null}
            onChange={(entity) => setFilters({ entity })}
          />
        </Toolbar>

        <DataTable
          caption="سجل التدقيق"
          columns={columns}
          data={rows}
          getRowId={(entry) => entry.id}
          isLoading={logs.isPending}
          error={logs.error}
          onRetry={() => void logs.refetch()}
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{ title: "لا سجلات بعد" }}
          rowHref={(entry) => entityHref(entry) ?? undefined}
          rowActions={(entry) => [
            {
              key: "open",
              label: "فتح ما جرى عليه",
              icon: ExternalLink,
              href: entityHref(entry) ?? undefined,
              hidden: !entityHref(entry),
            },
          ]}
          pagination={{
            mode: "cursor",
            hasMore: Boolean(logs.hasNextPage),
            onLoadMore: () => void logs.fetchNextPage(),
            isLoadingMore: logs.isFetchingNextPage,
          }}
        />
      </div>
    </div>
  );
}
