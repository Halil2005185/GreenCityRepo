"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, Link2, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { FormCreateDialog, RegistrationLinkDialog } from "@/components/forms/form-dialogs";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, SearchInput, Toolbar, type ChipOption } from "@/components/ui/toolbar";
import { listForms, type FormSummary } from "@/lib/api/forms";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { normalizeArabic } from "@/lib/text/normalize-ar";

/** الاستمارات قليلة ويُعيدها الخادم كاملة، فالبحث والترشيح هنا على العميل. */
const STATE_CHIPS: ChipOption[] = [
  { value: "", label: "الكل" },
  { value: "accepting", label: "تستقبل الطلبات" },
  { value: "closed", label: "مغلقة" },
  { value: "draft", label: "لم تُنشر" },
];

function matchesState(form: FormSummary, state: string) {
  if (state === "accepting") return form.publishedVersion !== null && form.isAccepting;
  if (state === "closed") return form.publishedVersion !== null && !form.isAccepting;
  if (state === "draft") return form.publishedVersion === null;

  return true;
}

const col = columnHelper<FormSummary>();

export default function FormsPage() {
  const [filters, setFilters, resetFilters] = useUrlState({ q: "", state: "", new: "" });
  const [linkFor, setLinkFor] = useState<{ form: FormSummary | null; open: boolean }>({
    form: null,
    open: false,
  });

  const forms = useQuery({ queryKey: ["forms"], queryFn: listForms });

  const rows = useMemo(() => {
    const query = normalizeArabic(filters.q);

    return (forms.data ?? []).filter(
      (form) =>
        matchesState(form, filters.state) &&
        (!query || normalizeArabic(`${form.nameAr} ${form.slug}`).includes(query)),
    );
  }, [forms.data, filters.q, filters.state]);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("nameAr", {
          header: "الاستمارة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/forms/${info.row.original.id}/edit`}
              description={<span dir="ltr">/{info.row.original.slug}</span>}
            />
          ),
        }),
        col.accessor((form) => form.officeNameAr ?? undefined, {
          id: "office",
          header: "المكتب",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor((form) => form.publishedVersion ?? undefined, {
          id: "published",
          header: "المنشور",
          sortUndefined: "last",
          cell: (info) =>
            info.getValue() ? (
              <span>
                الإصدار <span className="numeric">{info.getValue()}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">لم يُنشر</span>
            ),
        }),
        col.accessor("draftFieldCount", {
          header: "أسئلة المسوّدة",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor("isAccepting", {
          header: "الاستقبال",
          enableSorting: false,
          cell: (info) =>
            info.row.original.publishedVersion ? (
              <StatusBadge kind="formAccepting" value={info.getValue() ? "OPEN" : "CLOSED"} />
            ) : (
              <EmptyCell />
            ),
        }),
        col.accessor("createdAt", {
          header: "أُنشئت",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const create = {
    key: "create",
    label: "إنشاء استمارة",
    icon: Plus,
    requires: [CAPABILITIES.formsManage],
    onSelect: () => setFilters({ new: "1" }, { keepPage: true }),
  };
  const hasFilters = Boolean(filters.q || filters.state);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاستمارات"
        description="استمارات الانضمام والتسجيل العلنية. المسوّدة تُحرَّر، والمنشور مجمَّد تُقرأ الطلبات مقابل أسئلته."
        primaryAction={create}
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="بالاسم أو المعرّف…"
              label="البحث في الاستمارات"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={filters.state ? 1 : 0}
          onReset={resetFilters}
          mobile="inline"
        >
          <FilterChips
            label="حالة الاستمارة"
            value={filters.state}
            onChange={(state) => setFilters({ state })}
            options={STATE_CHIPS}
          />
        </Toolbar>

        <DataTable
          caption="الاستمارات"
          columns={columns}
          data={forms.data ? rows : undefined}
          getRowId={(form) => form.id}
          isLoading={forms.isPending}
          error={forms.error}
          onRetry={() => void forms.refetch()}
          urlState
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{
            title: "لا استمارات بعد",
            description: "أنشئ استمارة وأضف أسئلتها، ثم انشرها لتحصل على رابط التسجيل.",
            action: create,
          }}
          rowHref={(form) => `/dashboard/forms/${form.id}/edit`}
          rowActions={(form) => [
            {
              key: "submissions",
              label: "عرض الطلبات",
              icon: Inbox,
              quick: true,
              href: `/dashboard/forms/${form.id}/submissions`,
            },
            {
              key: "edit",
              label: "تحرير الأسئلة",
              icon: Pencil,
              href: `/dashboard/forms/${form.id}/edit`,
            },
            {
              key: "link",
              label: "رابط التسجيل",
              icon: Link2,
              hidden: !form.publishedVersion,
              onSelect: () => setLinkFor({ form, open: true }),
            },
          ]}
        />
      </div>

      <FormCreateDialog
        open={filters.new === "1"}
        onOpenChange={(open) => setFilters({ new: open ? "1" : null }, { keepPage: true })}
      />
      <RegistrationLinkDialog
        form={linkFor.form}
        open={linkFor.open}
        onOpenChange={(open) => setLinkFor((current) => ({ ...current, open }))}
      />
    </div>
  );
}
