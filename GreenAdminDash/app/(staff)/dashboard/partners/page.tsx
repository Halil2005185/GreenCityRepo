"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo } from "react";

import { LookupBadge, LookupSelect, lookupLabel } from "@/components/lookups/lookup-select";
import { PartnerCreateDialog } from "@/components/partners/partner-dialogs";
import { usePartnerActions } from "@/components/partners/use-partner-actions";
import { sinceLabel } from "@/components/relations/classification";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import type { SelectOption } from "@/components/ui/select";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import {
  PARTNERSHIP_TYPE_LABELS,
  PIPELINE_STAGES,
  listPartners,
  type PartnerStage,
  type PartnerSummary,
} from "@/lib/api/partners";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { STATUS, statusOptions } from "@/lib/status";
import { formatDate } from "@/lib/utils";

/**
 * «خط المتابعة» و«المعلّقة» مجموعتان لا مراحل: الأولى كل ما قبل الاعتماد،
 * والثانية الجهات النشطة المعلّقة. الخادم يرشّح بمرحلة واحدة، فتُطبَّقان
 * هنا على القائمة الكاملة — وبهما تفتح بطاقات الرئيسية قائمتها مرشّحة.
 */
const STAGE_FILTERS: SelectOption[] = [
  { value: "PIPELINE", label: "خط المتابعة", group: "مجموعات" },
  { value: "SUSPENDED", label: "المعلّقة", group: "مجموعات" },
  ...statusOptions("partnerStage").map((option) => ({ ...option, group: "المراحل" })),
];

const STALE_FILTERS: SelectOption[] = [
  { value: "30", label: "لم نتواصل منذ شهر" },
  { value: "90", label: "منذ ٣ أشهر" },
];

const col = columnHelper<PartnerSummary>();

export default function PartnersPage() {
  const [filters, setFilters, resetFilters] = useUrlState({
    q: "",
    stage: "",
    priority: "",
    stale: "",
    new: "",
  });
  const partnerActions = usePartnerActions();

  const serverStage = Object.hasOwn(STATUS.partnerStage, filters.stage) ? filters.stage : "";

  const partners = useQuery({
    queryKey: ["partners", { q: filters.q, stage: serverStage, priority: filters.priority, stale: filters.stale }],
    queryFn: () =>
      listPartners({
        q: filters.q,
        stage: serverStage,
        contactPriorityId: filters.priority,
        ...(filters.stale ? { staleDays: Number(filters.stale) } : {}),
      }),
    // المرشح الجديد لا يمسح الجدول حتى تصل نتائجه.
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const all = partners.data;

    if (!all) return undefined;
    if (filters.stage === "PIPELINE") {
      return all.filter((partner) =>
        (PIPELINE_STAGES as readonly PartnerStage[]).includes(partner.stage),
      );
    }
    if (filters.stage === "SUSPENDED") return all.filter((partner) => partner.isSuspended);

    return all;
  }, [partners.data, filters.stage]);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("displayNameAr", {
          header: "الجهة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/partners/${info.row.original.id}`}
              description={lookupLabel(info.row.original.organizationKind)}
              badge={
                info.row.original.isSuspended ? <Badge tone="danger">معلّقة</Badge> : null
              }
            />
          ),
        }),
        col.accessor("stage", {
          header: "المرحلة",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <StatusBadge kind="partnerStage" value={info.getValue()} />,
        }),
        col.accessor("contactPriority", {
          header: "الأولوية",
          enableSorting: false,
          cell: (info) => (
            <div className="min-w-24 space-y-1">
              <LookupBadge code="CONTACT_PRIORITY" value={info.getValue()} />
              {info.row.original.relationshipType ? (
                <p className="text-xs text-muted-foreground">
                  {lookupLabel(info.row.original.relationshipType)}
                </p>
              ) : null}
            </div>
          ),
        }),
        col.accessor("partnershipTypes", {
          header: "أنواع الشراكة",
          enableSorting: false,
          cell: (info) =>
            info.getValue().length > 0 ? (
              <div className="flex max-w-56 flex-wrap gap-1">
                {info.getValue().map((type) => (
                  <Badge key={type} tone="info">
                    {PARTNERSHIP_TYPE_LABELS[type]}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyCell />
            ),
        }),
        // القيم الفارغة `undefined` لا `null` كي تُرتَّب آخرًا لا كنص «null».
        col.accessor((partner) => partner.primaryContactNameAr ?? undefined, {
          id: "primaryContact",
          header: "جهة الاتصال",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor((partner) => partner.accountManagerNameAr ?? undefined, {
          id: "accountManager",
          header: "مسؤول العلاقة",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.display({
          id: "visibility",
          header: "الإظهار",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const { publicNameConsent, publicLogoConsent } = info.row.original;
            const parts = [publicNameConsent && "الاسم", publicLogoConsent && "الشعار"].filter(
              Boolean,
            );

            return parts.length > 0 ? parts.join(" · ") : <EmptyCell />;
          },
        }),
        col.accessor((partner) => partner.lastContactAt ?? undefined, {
          id: "lastContactAt",
          header: "آخر تواصل",
          sortUndefined: "last",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const value = info.getValue();

            return value ? (
              <span title={formatDate(value)}>{sinceLabel(value)}</span>
            ) : (
              <span className="text-muted-foreground">لم يُسجَّل</span>
            );
          },
        }),
      ]),
    [],
  );

  const activeCount = [filters.stage, filters.priority, filters.stale].filter(Boolean).length;
  const hasFilters = Boolean(filters.q) || activeCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل الشركاء"
        description="من جهة محتملة إلى شراكة معتمدة. الاعتماد النهائي للمدير العام."
        primaryAction={{
          key: "create",
          label: "تسجيل جهة",
          icon: Plus,
          requires: [CAPABILITIES.partnersManage],
          onSelect: () => setFilters({ new: "1" }, { keepPage: true }),
        }}
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="ابحث بالاسم…"
              label="البحث في الشركاء"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={activeCount}
          onReset={resetFilters}
        >
          <Select
            size="sm"
            label="المرحلة"
            placeholder="الكل"
            className="w-52"
            clearable
            options={STAGE_FILTERS}
            value={filters.stage || null}
            onChange={(stage) => setFilters({ stage })}
          />
          <LookupSelect
            code="CONTACT_PRIORITY"
            size="sm"
            label="الأولوية"
            placeholder="الكل"
            className="w-44"
            clearable
            creatable={false}
            value={filters.priority || null}
            onChange={(priority) => setFilters({ priority: priority ?? "" })}
          />
          <Select
            size="sm"
            label="آخر تواصل"
            placeholder="أي تاريخ"
            className="w-56"
            clearable
            options={STALE_FILTERS}
            value={filters.stale || null}
            onChange={(stale) => setFilters({ stale })}
          />
        </Toolbar>

        <DataTable
          caption="سجل الشركاء"
          columns={columns}
          data={rows}
          getRowId={(partner) => partner.id}
          isLoading={partners.isPending}
          error={partners.error}
          onRetry={() => void partners.refetch()}
          urlState
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{
            title: "لا شركاء بعد",
            description: "سجّل أول جهة محتملة لتبدأ متابعتها من هنا.",
            action: {
              key: "create",
              label: "تسجيل جهة",
              icon: Plus,
              requires: [CAPABILITIES.partnersManage],
              onSelect: () => setFilters({ new: "1" }, { keepPage: true }),
            },
          }}
          rowHref={(partner) => `/dashboard/partners/${partner.id}`}
          rowActions={(partner) => {
            const actions = partnerActions.actions(partner);

            return [
              { ...actions.open, quick: true },
              actions.classification,
              actions.stage,
              actions.invite,
              actions.restore,
              actions.suspend,
            ];
          }}
        />
      </div>

      <PartnerCreateDialog
        open={filters.new === "1"}
        onOpenChange={(open) => setFilters({ new: open ? "1" : null }, { keepPage: true })}
      />
      {partnerActions.dialogs}
    </div>
  );
}
