"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Plus, Settings2 } from "lucide-react";
import { useMemo } from "react";

import { InitiativeCreateDialog } from "@/components/initiatives/initiative-dialogs";
import {
  DataTable,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import {
  ROLLUP_SHORT,
  listInitiatives,
  listPrograms,
  type InitiativeSummary,
} from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { statusOptions } from "@/lib/status";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

const col = columnHelper<InitiativeSummary>();

const INITIATIVES = {
  one: "مبادرة واحدة",
  two: "مبادرتان",
  few: "مبادرات",
  many: "مبادرة",
  other: "مبادرة",
};

/** الموسم نص يكتبه الفريق («موسم التشجير 2026»)؛ بدونه تاريخ البدء. */
function when(initiative: InitiativeSummary) {
  return initiative.season ?? (initiative.startsAt ? formatDate(initiative.startsAt) : null);
}

export default function InitiativesPage() {
  const [filters, setFilters, resetFilters] = useUrlState({
    q: "",
    status: "",
    program: "",
    new: "",
  });

  const programs = useQuery({ queryKey: ["programs"], queryFn: listPrograms });

  const initiatives = useQuery({
    queryKey: ["initiatives", { q: filters.q, status: filters.status, program: filters.program }],
    queryFn: () =>
      listInitiatives({ q: filters.q, status: filters.status, programId: filters.program }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("nameAr", {
          header: "المبادرة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/initiatives/${info.row.original.id}`}
              description={info.row.original.contributorNameAr}
              badge={
                info.row.original.kind === "GREEN_POINT" ? (
                  <StatusBadge kind="pointKind" value="GREEN_POINT" />
                ) : null
              }
            />
          ),
        }),
        col.accessor("programNameAr", {
          header: "البرنامج",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <StatusBadge kind="initiativeStatus" value={info.getValue()} />,
        }),
        col.accessor("siteCount", {
          header: "المواقع",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor("targetRollup", {
          header: "المطابقة",
          enableSorting: false,
          cell: (info) => ROLLUP_SHORT[info.getValue()],
        }),
        col.accessor((initiative) => when(initiative) ?? undefined, {
          id: "when",
          header: "الموسم",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor((initiative) => initiative.leadNameAr ?? undefined, {
          id: "lead",
          header: "المسؤول",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
      ]),
    [],
  );

  const activeCount = [filters.status, filters.program].filter(Boolean).length;
  const hasFilters = Boolean(filters.q) || activeCount > 0;
  const openCreate = () => setFilters({ new: "1" }, { keepPage: true });
  const create = {
    key: "create",
    label: "إنشاء مبادرة",
    icon: Plus,
    requires: [CAPABILITIES.initiativesManage],
    onSelect: openCreate,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="المبادرات"
        description="كل مبادرة تحت برنامج، وتعمل في منطقة أو أكثر، بعدد مواقع مفتوح."
        primaryAction={create}
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="ابحث باسم المبادرة…"
              label="البحث في المبادرات"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={activeCount}
          onReset={resetFilters}
        >
          <Select
            size="sm"
            label="الحالة"
            placeholder="الكل"
            className="w-44"
            clearable
            options={statusOptions("initiativeStatus")}
            value={filters.status || null}
            onChange={(status) => setFilters({ status })}
          />
          {/* البرامج من الـAPI لا من قائمة مكتوبة: يحرّرها الفريق. */}
          <Select
            size="sm"
            label="البرنامج"
            placeholder="الكل"
            className="w-56"
            clearable
            loading={programs.isPending}
            options={(programs.data ?? []).map((program) => ({
              value: program.id,
              label: program.nameAr,
              description:
                program.initiativeCount > 0
                  ? countAr(program.initiativeCount, INITIATIVES)
                  : "بلا مبادرات",
            }))}
            value={filters.program || null}
            onChange={(program) => setFilters({ program })}
          />
        </Toolbar>

        <DataTable
          caption="المبادرات"
          columns={columns}
          data={initiatives.data}
          getRowId={(initiative) => initiative.id}
          isLoading={initiatives.isPending}
          error={initiatives.error}
          onRetry={() => void initiatives.refetch()}
          urlState
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{
            title: "لا مبادرات بعد",
            description: "أنشئ أول مبادرة تحت أحد البرامج، ثم أضف مواقعها وأهدافها.",
            action: create,
          }}
          rowHref={(initiative) => `/dashboard/initiatives/${initiative.id}`}
          rowActions={(initiative) => [
            {
              key: "manage",
              label: "إدارة المبادرة",
              icon: Settings2,
              quick: true,
              href: `/dashboard/initiatives/${initiative.id}/manage`,
              requires: [CAPABILITIES.initiativesManage],
              // النقطة الخضراء لا إدارة لها: موقع واحد أضافه صاحبه من الخريطة.
              hidden: initiative.kind === "GREEN_POINT",
            },
            {
              key: "open",
              label: "فتح الصفحة",
              icon: Eye,
              href: `/dashboard/initiatives/${initiative.id}`,
            },
          ]}
        />
      </div>

      <InitiativeCreateDialog
        open={filters.new === "1"}
        onOpenChange={(open) => setFilters({ new: open ? "1" : null }, { keepPage: true })}
      />
    </div>
  );
}
