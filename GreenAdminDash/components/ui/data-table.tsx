"use client";

import {
  type PaginationState,
  type RowData,
  type SortingState,
  constructSortFn,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  functionalUpdate,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
  type Updater,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  ActionMenu,
  type ActionDef,
  IconButton,
  type MaybeAction,
  useVisibleActions,
} from "@/components/ui/actions";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  NoResultsState,
  TableSkeleton,
} from "@/components/ui/states";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

// ── الميزات والأنواع ────────────────────────────────────────────────────

/**
 * الترتيب العربي بـ`Intl.Collator`: المقارنة الافتراضية ترتّب بنقاط الترميز
 * فتضع «إ» بعد «ي»، و`numeric` يضع «موقع 10» بعد «موقع 9» لا بعد «موقع 1».
 */
const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });

const sortFn_arabic = constructSortFn({
  sort: (a: unknown, b: unknown) => collator.compare(String(a ?? ""), String(b ?? "")),
});

export type DataTableColumnMeta = {
  /**
   * أرقام: `.numeric` (أرقام لاتينية متساوية العرض) على محتوى الخلية لا على
   * الخلية نفسها، فتبقى محاذاتها تحت عنوان العمود في جهة البداية.
   */
  numeric?: boolean;
  /** صنف الخلية — `whitespace-nowrap` للتواريخ والشارات مثلًا. */
  className?: string;
  headerClassName?: string;
};

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    text: sortFn_arabic,
    alphanumeric: sortFn_arabic,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;

/** منشئ أعمدة مربوط بميزات الجدول: `const col = columnHelper<Partner>()`. */
export function columnHelper<T extends RowData>() {
  return createColumnHelper<DataTableFeatures, T>();
}

export type DataTableColumn<T extends RowData> = ReturnType<
  ReturnType<typeof columnHelper<T>>["columns"]
>[number];

// ── خلايا مشتركة ────────────────────────────────────────────────────────

/** الخلية الفارغة «—» في كل الجداول، لا نص فارغ ولا «غير محدد» مرة و«-» مرة. */
export function EmptyCell() {
  return (
    <span className="text-muted-foreground" aria-label="لا قيمة">
      —
    </span>
  );
}

export const cells = {
  text(value: string | null | undefined) {
    return value && value.trim() ? value : <EmptyCell />;
  },
  date(value: string | null | undefined) {
    return value ? <span className="whitespace-nowrap">{formatDate(value)}</span> : <EmptyCell />;
  },
  dateTime(value: string | null | undefined) {
    return value ? (
      <span className="whitespace-nowrap">{formatDateTime(value)}</span>
    ) : (
      <EmptyCell />
    );
  },
  number(value: number | null | undefined) {
    return value == null ? (
      <EmptyCell />
    ) : (
      <span className="numeric">{value.toLocaleString("en-US")}</span>
    );
  },
};

/**
 * عمود المعرّف: رابط حقيقي يُفتح في تبويب جديد، أو زر يفتح لوحة التفاصيل.
 * هو ما يصل إليه التنقل بلوحة المفاتيح؛ النقر على بقية الصف اختصار للفأرة.
 */
export function PrimaryCell({
  label,
  href,
  onClick,
  description,
  badge,
}: {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
  description?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const className =
    "rounded-sm text-start font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="min-w-40 space-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        {href ? (
          <Link href={href} className={className}>
            {label}
          </Link>
        ) : onClick ? (
          <button type="button" onClick={onClick} className={className}>
            {label}
          </button>
        ) : (
          <span className="font-medium">{label}</span>
        )}
        {badge}
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

// ── حالة الترقيم والترتيب ───────────────────────────────────────────────

function parseSort(value: string | null): SortingState {
  if (!value) return [];

  return [{ id: value.replace(/^-/, ""), desc: value.startsWith("-") }];
}

function formatSort(sorting: SortingState) {
  const [first] = sorting;

  return first ? `${first.desc ? "-" : ""}${first.id}` : null;
}

/**
 * الترقيم والترتيب في عنوان الصفحة (`?page=` و`?sort=`) حين يُطلب ذلك،
 * فيعيد الرجوع من صفحة التفاصيل القائمة إلى الصفحة نفسها.
 */
function useTableState(urlState: boolean, pageSize: number, initialSorting: SortingState) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [localPage, setLocalPage] = useState(0);
  const [localSorting, setLocalSorting] = useState(initialSorting);

  const urlSort = searchParams.get("sort");
  const sorting = useMemo(
    () => (urlState ? (urlSort ? parseSort(urlSort) : initialSorting) : localSorting),
    [urlState, urlSort, initialSorting, localSorting],
  );
  const pageIndex = urlState
    ? Math.max(0, Number(searchParams.get("page") ?? "1") - 1 || 0)
    : localPage;

  const write = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(window.location.search);

      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }

      const query = params.toString();

      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  const setSorting = useCallback(
    (updater: Updater<SortingState>) => {
      const next = functionalUpdate(updater, sorting);

      if (urlState) write({ sort: formatSort(next), page: null });
      else {
        setLocalSorting(next);
        setLocalPage(0);
      }
    },
    [sorting, urlState, write],
  );

  const setPagination = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = functionalUpdate(updater, { pageIndex, pageSize });

      if (urlState) write({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null });
      else setLocalPage(next.pageIndex);
    },
    [pageIndex, pageSize, urlState, write],
  );

  return { sorting, pageIndex, setSorting, setPagination };
}

// ── الجدول ──────────────────────────────────────────────────────────────

const EMPTY: never[] = [];
const NO_SORTING: SortingState = [];

type PaginationProp =
  | { mode: "client"; pageSize?: number }
  | {
      mode: "cursor";
      hasMore: boolean;
      onLoadMore: () => void;
      isLoadingMore: boolean;
    }
  | false;

export type DataTableProps<T extends RowData> = {
  columns: readonly DataTableColumn<T>[];
  data: readonly T[] | undefined;
  getRowId: (row: T) => string;
  /** عنوان الجدول لقارئ الشاشة. */
  caption: string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** لا بيانات أصلًا: رسالة ودعوة لفعل. */
  empty: { title: string; description?: React.ReactNode; action?: ActionDef };
  /** مرشحات فعّالة: الفراغ يصير «لا نتائج لهذه المرشحات» مع زر يمسحها. */
  filtered?: boolean;
  onClearFilters?: () => void;
  /** النقر على الصف يفتح التفاصيل؛ Ctrl أو ⌘ يفتحها في تبويب جديد. */
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => readonly MaybeAction[];
  pagination?: PaginationProp;
  initialSorting?: SortingState;
  /** يحفظ رقم الصفحة والترتيب في عنوان الصفحة. واحد لكل صفحة. */
  urlState?: boolean;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
};

const INTERACTIVE =
  "a, button, input, select, textarea, label, [role='menuitem'], [role='checkbox'], [role='combobox'], [data-row-click-ignore]";

/**
 * الجدول الموحّد: المعرّف أولًا في جهة البداية، ثم الحالة والخصائص
 * والتواريخ، وعمود الإجراءات آخرًا في جهة النهاية.
 *
 * الترقيم على العميل لأن الـAPI يعيد القوائم كاملة، ووضع «تحميل المزيد»
 * للقوائم ذات المؤشر (سجل التدقيق وطلبات الاستمارات). حالات التحميل
 * والفراغ و«لا نتائج» والخطأ جزء من المكوّن لا من كل صفحة.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  isLoading = false,
  error,
  onRetry,
  empty,
  filtered = false,
  onClearFilters,
  rowHref,
  onRowClick,
  rowActions,
  pagination = { mode: "client" },
  initialSorting = NO_SORTING,
  urlState = false,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const visible = useVisibleActions();

  const rowsData = (data ?? EMPTY) as T[];
  const cursorMode = pagination !== false && pagination.mode === "cursor";
  const pageSize =
    pagination !== false && pagination.mode === "client"
      ? (pagination.pageSize ?? 20)
      : Number.MAX_SAFE_INTEGER;

  const { sorting, pageIndex, setSorting, setPagination } = useTableState(
    urlState,
    pageSize,
    initialSorting,
  );

  // صفحة خارج المدى (بعد حذف أو تضييق مرشح) تُعرض كأنها الأخيرة.
  const pageCount = Math.max(1, Math.ceil(rowsData.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  const table = useTable({
    features: dataTableFeatures,
    columns: columns as DataTableColumn<T>[],
    data: rowsData,
    getRowId: (row) => getRowId(row),
    enableSorting: !cursorMode,
    enableSortingRemoval: true,
    autoResetPageIndex: false,
    state: { sorting, pagination: { pageIndex: safePageIndex, pageSize } },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const actionsFor = useCallback(
    (row: T) => (rowActions ? visible(rowActions(row)) : []),
    [rowActions, visible],
  );

  // يُخفى العمود كله إن لم يبقَ فعل في أي صف بعد الصلاحيات.
  const hasActions = useMemo(
    () => Boolean(rowActions) && rowsData.some((row) => actionsFor(row).length > 0),
    [rowActions, rowsData, actionsFor],
  );

  const rows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();
  const columnCount = columns.length + (hasActions ? 1 : 0);
  const clickable = Boolean(rowHref || onRowClick);

  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, row: T) {
    if (!clickable) return;
    if ((event.target as Element).closest(INTERACTIVE)) return;
    // من يحدّد نصًا في الصف لا يريد مغادرة الصفحة.
    if (window.getSelection()?.toString()) return;

    const href = rowHref?.(row);

    if (href) {
      if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
      else router.push(href);
    } else {
      onRowClick?.(row);
    }
  }

  let body: React.ReactNode;

  if (isLoading) {
    body = <TableSkeleton columns={Math.min(columnCount, 5)} />;
  } else if (error) {
    body = <ErrorState error={error} onRetry={onRetry} />;
  } else if (rowsData.length === 0) {
    body = filtered ? (
      <NoResultsState onClear={onClearFilters} />
    ) : (
      <EmptyState title={empty.title} description={empty.description} action={empty.action} />
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-(--head-bg) text-xs text-muted-foreground">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined
                      }
                      className={cn(
                        "h-10 whitespace-nowrap px-3 text-start font-medium",
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
                {hasActions ? (
                  <th scope="col" className="sticky end-0 w-px bg-(--head-bg) px-2">
                    <span className="sr-only">الإجراءات</span>
                  </th>
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const actions = hasActions ? actionsFor(row.original) : [];
              const quick = actions.find((action) => action.quick);
              const rest = quick ? actions.filter((action) => action !== quick) : actions;

              return (
                <tr
                  key={row.id}
                  onClick={(event) => handleRowClick(event, row.original)}
                  className={cn(
                    "group transition-colors hover:bg-(--row-hover)",
                    clickable && "cursor-pointer",
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getAllCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;

                    return (
                      <td key={cell.id} className={cn("px-3 py-2.5 align-middle", meta?.className)}>
                        {meta?.numeric ? (
                          <span className="numeric">
                            <table.FlexRender cell={cell} />
                          </span>
                        ) : (
                          <table.FlexRender cell={cell} />
                        )}
                      </td>
                    );
                  })}
                  {hasActions ? (
                    <td className="sticky end-0 w-px bg-card px-2 py-1.5 transition-colors group-hover:bg-(--row-hover)">
                      <div className="flex items-center justify-end gap-0.5" data-row-click-ignore>
                        {quick ? (
                          <IconButton
                            label={quick.label}
                            icon={quick.icon ?? ChevronRight}
                            iconClassName={quick.icon ? undefined : "rtl:rotate-180"}
                            onClick={quick.onSelect}
                            disabled={quick.disabled || quick.loading}
                            loading={quick.loading}
                          />
                        ) : null}
                        <ActionMenu
                          actions={rest}
                          variant="ghost"
                          size="icon-sm"
                          label="إجراءات الصف"
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const showFooter = !isLoading && !error && rowsData.length > 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
      // ألوان معتمة ممزوجة لا شفافة: عمود الإجراءات اللاصق يغطي ما يمرّ تحته
      // عند التمرير الأفقي، فيجب أن يطابق لون الصف دون أن يُظهر ما خلفه.
      style={
        {
          "--head-bg": "color-mix(in oklch, var(--muted) 45%, var(--card))",
          "--row-hover": "color-mix(in oklch, var(--muted) 55%, var(--card))",
        } as React.CSSProperties
      }
    >
      {body}

      {showFooter && pagination !== false && pagination.mode === "client" ? (
        <ClientPagination
          pageIndex={safePageIndex}
          pageCount={pageCount}
          pageSize={pageSize}
          total={rowsData.length}
          onPage={(index) => setPagination({ pageIndex: index, pageSize })}
        />
      ) : null}

      {showFooter && pagination !== false && pagination.mode === "cursor" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <p>
            عُرض <span className="numeric">{rowsData.length}</span>
            {pagination.hasMore ? "" : " — لا مزيد"}
          </p>
          {pagination.hasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={pagination.isLoadingMore}
              onClick={pagination.onLoadMore}
            >
              تحميل المزيد
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** أرقام الصفحات حول الحالية: 1 … 4 5 6 … 12. */
function pageWindow(current: number, count: number): Array<number | "gap"> {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);

  const pages = new Set([0, count - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 0 && page < count).sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];

  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("gap");
    result.push(page);
  });

  return result;
}

function ClientPagination({
  pageIndex,
  pageCount,
  pageSize,
  total,
  onPage,
}: {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (index: number) => void;
}) {
  const from = pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <p>
        <span className="numeric">
          {from}–{to}
        </span>{" "}
        من <span className="numeric">{total}</span>
      </p>

      {pageCount > 1 ? (
        <nav aria-label="ترقيم الصفحات" className="flex items-center gap-1">
          <IconButton
            label="الصفحة السابقة"
            icon={ChevronLeft}
            iconClassName="rtl:rotate-180"
            disabled={pageIndex === 0}
            onClick={() => onPage(pageIndex - 1)}
          />
          {pageWindow(pageIndex, pageCount).map((page, index) =>
            page === "gap" ? (
              <span key={`gap-${index}`} className="px-1" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={page}
                type="button"
                size="icon-sm"
                variant={page === pageIndex ? "default" : "ghost"}
                aria-current={page === pageIndex ? "page" : undefined}
                aria-label={`الصفحة ${page + 1}`}
                className="numeric text-xs"
                onClick={() => onPage(page)}
              >
                {page + 1}
              </Button>
            ),
          )}
          <IconButton
            label="الصفحة التالية"
            icon={ChevronRight}
            iconClassName="rtl:rotate-180"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => onPage(pageIndex + 1)}
          />
        </nav>
      ) : null}
    </div>
  );
}
