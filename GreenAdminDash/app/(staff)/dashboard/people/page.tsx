"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, UserPlus } from "lucide-react";
import { useMemo } from "react";

import { officeOptions, useOffices } from "@/components/offices/office-options";
import { InviteStaffDialog } from "@/components/people/invite-staff-dialog";
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
import { listPeople, primaryMembership, type TeamMember } from "@/lib/api/people";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { statusOptions } from "@/lib/status";

const col = columnHelper<TeamMember>();

export default function PeoplePage() {
  const [filters, setFilters, resetFilters] = useUrlState({ q: "", office: "", status: "", invite: "" });
  const offices = useOffices();

  /**
   * المرشحات جزء من مفتاح الاستعلام لا حالة جانبية: كل تركيبة تُخزَّن
   * وحدها، فالعودة إلى مرشّح سابق فورية بلا طلب جديد.
   */
  const people = useQuery({
    queryKey: ["people", { q: filters.q, office: filters.office, status: filters.status }],
    queryFn: () =>
      listPeople({
        officeId: filters.office || undefined,
        status: (filters.status || undefined) as TeamMember["status"] | undefined,
        q: filters.q || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("fullNameAr", {
          header: "الاسم",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/people/${info.row.original.id}`}
              description={<span dir="ltr">{info.row.original.email}</span>}
            />
          ),
        }),
        col.accessor((member) => primaryMembership(member)?.officeNameAr ?? undefined, {
          id: "office",
          header: "المكتب",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor((member) => primaryMembership(member)?.roleNameAr ?? undefined, {
          id: "role",
          header: "الدور",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="userStatus" value={info.getValue()} />,
        }),
        col.accessor((member) => primaryMembership(member)?.startedAt ?? member.createdAt, {
          id: "since",
          header: "منذ",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const activeCount = [filters.office, filters.status].filter(Boolean).length;
  const hasFilters = Boolean(filters.q) || activeCount > 0;
  const invite = {
    key: "invite",
    label: "دعوة عضو",
    icon: UserPlus,
    requires: [CAPABILITIES.invitationsManage],
    onSelect: () => setFilters({ invite: "1" }, { keepPage: true }),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="دليل الفريق"
        description="أعضاء إيفا ومكاتبهم وأدوارهم. ممثلو الشركاء ليسوا هنا — سجلّهم في صفحة الشركاء لأن نطاقهم جهتهم لا مكتبًا."
        primaryAction={invite}
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="بالاسم أو البريد…"
              label="البحث في دليل الفريق"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={activeCount}
          onReset={resetFilters}
        >
          <Select
            size="sm"
            label="المكتب"
            placeholder="الكل"
            className="w-56"
            clearable
            loading={offices.isPending}
            options={officeOptions(offices.data ?? [])}
            value={filters.office || null}
            onChange={(office) => setFilters({ office })}
          />
          <Select
            size="sm"
            label="الحالة"
            placeholder="الكل"
            className="w-40"
            clearable
            options={statusOptions("userStatus")}
            value={filters.status || null}
            onChange={(status) => setFilters({ status })}
          />
        </Toolbar>

        <DataTable
          caption="أعضاء الفريق"
          columns={columns}
          data={people.data}
          getRowId={(member) => member.id}
          isLoading={people.isPending}
          error={people.error}
          onRetry={() => void people.refetch()}
          urlState
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{
            title: "لا أعضاء بعد",
            description: "الدعوة هي المدخل الوحيد لإنشاء حساب في اللوحة.",
            action: invite,
          }}
          rowHref={(member) => `/dashboard/people/${member.id}`}
          rowActions={(member) => [
            { key: "open", label: "فتح الملف", icon: Eye, href: `/dashboard/people/${member.id}` },
          ]}
        />
      </div>

      <InviteStaffDialog
        open={filters.invite === "1"}
        onOpenChange={(open) => setFilters({ invite: open ? "1" : null }, { keepPage: true })}
      />
    </div>
  );
}
