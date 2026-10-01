"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { DataTable, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import { type LookupListSummary, listLookups, lookupKeys } from "@/lib/api/lookups";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { normalizeArabic } from "@/lib/text/normalize-ar";

const col = columnHelper<LookupListSummary>();

/**
 * تعريفات النظام: كل قائمة منسدلة تُدار قيمها من هنا، بالرمز الذي تقرؤه
 * الشاشات. لا زر «تعريف جديد»: التعريف عقد مع عمود في جدول، فيُضاف في
 * الكود؛ والقيم وحدها بيانات.
 */
export default function LookupListsPage() {
  const [filters, setFilters] = useUrlState({ q: "" });
  const lists = useQuery({ queryKey: lookupKeys.summary, queryFn: listLookups });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("nameAr", {
          header: "التعريف",
          enableSorting: false,
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/settings/lookups/${info.row.original.code}`}
              description={info.row.original.descriptionAr}
            />
          ),
        }),
        col.accessor("code", {
          header: "الرمز",
          enableSorting: false,
          cell: (info) => (
            <span dir="ltr" className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {info.getValue()}
            </span>
          ),
        }),
        col.accessor("groupAr", {
          header: "المجال",
          enableSorting: false,
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor("activeCount", {
          header: "القيم",
          enableSorting: false,
          cell: (info) => {
            const { activeCount, valueCount } = info.row.original;

            // `numeric` على الأرقام وحدها: يفرض اتجاهًا من اليسار، فلو لفّ
            // الجملة كلها لانقلبت «٨ من ٩» إلى «٩ من ٨» في القراءة.
            return (
              <span className="whitespace-nowrap">
                <span className="numeric">{activeCount}</span>
                {valueCount > activeCount ? (
                  <span className="text-muted-foreground">
                    {" "}من <span className="numeric">{valueCount}</span>
                  </span>
                ) : null}
              </span>
            );
          },
        }),
        col.accessor("canEdit", {
          header: "صلاحيتك",
          enableSorting: false,
          cell: (info) =>
            info.getValue() ? (
              <Badge tone="success">تحرير</Badge>
            ) : (
              <Badge tone="neutral">اطلاع</Badge>
            ),
        }),
      ]),
    [],
  );

  const needle = normalizeArabic(filters.q.trim());
  const rows = (lists.data ?? []).filter(
    (list) =>
      !needle ||
      normalizeArabic(list.nameAr).includes(needle) ||
      list.code.toLowerCase().includes(filters.q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "الإعدادات" }, { label: "تعريفات النظام" }]}
        title="تعريفات النظام"
        description="القوائم المنسدلة في النظام وقيمها. كل قائمة مربوطة بتعريف برمزه، فما يُعدَّل هنا يظهر في كل شاشة تستعمله. التعطيل يخفي القيمة من الاختيار ولا يمسّ ما صُنّف بها."
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="بالاسم أو الرمز…"
              label="البحث في تعريفات النظام"
            />
          }
          hasActiveFilters={Boolean(filters.q)}
          onReset={() => setFilters({ q: "" })}
        />

        <DataTable
          caption="تعريفات النظام"
          columns={columns}
          data={lists.isPending ? undefined : rows}
          getRowId={(list) => list.code}
          isLoading={lists.isPending}
          error={lists.error}
          onRetry={() => void lists.refetch()}
          rowHref={(list) => `/dashboard/settings/lookups/${list.code}`}
          pagination={false}
          filtered={Boolean(filters.q)}
          onClearFilters={() => setFilters({ q: "" })}
          empty={{ title: "لا تعريفات", description: "تُنشأ التعريفات مع أول نشر للنظام." }}
        />
      </div>
    </div>
  );
}
