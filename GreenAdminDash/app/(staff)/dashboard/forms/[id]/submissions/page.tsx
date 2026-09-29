"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Columns3, Eye, ListFilter, Pencil, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { SubmissionSheet, useSubmissionActions } from "@/components/forms/submission-sheet";
import { useRefOptions } from "@/components/forms/use-ref-options";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  PrimaryCell,
  cells,
  columnHelper,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { Label } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, SearchInput, Toolbar, type ChipOption } from "@/components/ui/toolbar";
import {
  REDACTED_SUBMISSION_LABEL,
  REF_TYPES,
  SELECT_TYPES,
  getForm,
  listSubmissions,
  type AnswerFilter,
  type FormField,
  type SubmissionStatus,
  type SubmissionSummary,
} from "@/lib/api/forms";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { statusOptions } from "@/lib/status";

const BREADCRUMB_ROOT = { label: "الاستمارات", href: "/dashboard/forms" };

const STATUS_CHIPS: ChipOption[] = [{ value: "", label: "الكل" }, ...statusOptions("submissionStatus")];

const BOOLEAN_OPTIONS = [
  { value: "true", labelAr: "نعم" },
  { value: "false", labelAr: "لا" },
];

/** ما يُرشَّح عليه: إجابة من خيارات معدودة، لا نص حر. */
function isFilterable(field: FormField) {
  return field.type === "BOOLEAN" || SELECT_TYPES.includes(field.type) || REF_TYPES.includes(field.type);
}

/**
 * مرشّحات الإجابات في الرابط كمصفوفة JSON: القيم يكتبها المحرّر حرةً فقد
 * تحوي فاصلة أو نقطتين، والترميز الصريح لا يلتبس.
 */
function parseFilters(raw: string): AnswerFilter[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is AnswerFilter =>
            typeof item?.key === "string" && typeof item?.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

const col = columnHelper<SubmissionSummary>();

export default function SubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const actionsFor = useSubmissionActions(id);
  const [state, setState, resetFilters] = useUrlState({
    status: "",
    q: "",
    answers: "",
    cols: "",
    submission: "",
  });

  const form = useQuery({ queryKey: ["forms", id], queryFn: () => getForm(id) });

  /**
   * الترشيح والأعمدة على أسئلة **الإصدار المنشور**: هو ما أجاب عنه
   * المتقدّمون. أسئلة المسوّدة قد لا يقابلها في الطلبات شيء.
   */
  const fields = useMemo(() => form.data?.published?.fields ?? [], [form.data]);
  const refOptions = useRefOptions(fields.some((field) => REF_TYPES.includes(field.type)));
  const answerFilters = useMemo(() => parseFilters(state.answers), [state.answers]);
  const shownKeys = useMemo(() => (state.cols ? state.cols.split(",") : []), [state.cols]);

  const valuesFor = useMemo(
    () => (field: FormField) =>
      field.type === "BOOLEAN"
        ? BOOLEAN_OPTIONS
        : REF_TYPES.includes(field.type)
          ? (refOptions[field.type as keyof typeof refOptions] ?? [])
          : field.options,
    [refOptions],
  );

  /**
   * الإجابة كما تُقرأ لا كما تُخزَّن: نصّ الخيار لا مفتاحه، واسم المحافظة لا
   * معرّفها — وإلا عُرض على الفارز `media` و`8f3c…` بدل «توثيق» و«دمشق».
   */
  const readAnswer = useMemo(
    () => (field: FormField, answers: Record<string, unknown>) => {
      const value = answers[field.key];

      if (value === undefined || value === null || value === "") return null;

      const options = valuesFor(field);
      const labelOf = (one: string) => options.find((option) => option.value === one)?.labelAr ?? one;

      if (Array.isArray(value)) return value.map((one) => labelOf(String(one))).join("، ") || null;
      if (typeof value === "boolean") return value ? "نعم" : "لا";

      return labelOf(String(value));
    },
    [valuesFor],
  );

  const filters = {
    status: (state.status || undefined) as SubmissionStatus | undefined,
    q: state.q || undefined,
    answers: answerFilters.length > 0 ? answerFilters : undefined,
  };

  /**
   * الصفحات بمؤشّر وقت التقديم لا برقم صفحة، فما وصل أثناء القراءة لا يزحزح
   * ما تحته. «تحميل المزيد» يطلب الدفعة التالية من حيث انتهت السابقة.
   */
  const submissions = useInfiniteQuery({
    queryKey: ["submissions", id, filters],
    queryFn: ({ pageParam }) => listSubmissions(id, { ...filters, ...(pageParam ? { before: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => submissions.data?.pages.flatMap((page) => page.data), [submissions.data]);
  const shownFields = useMemo(() => fields.filter((field) => shownKeys.includes(field.key)), [fields, shownKeys]);

  const columns = useMemo(() => {
    const open = (submission: SubmissionSummary) => setState({ submission: submission.id }, { keepPage: true });
    // الإجابة تُقرأ عند الرسم لا في دالة الوصول: الجدول يحفظ ناتج دالة
    // الوصول لكل صف، فعمود حُسب قبل وصول أسماء المحافظات يبقى بمعرّفاتها.
    const answerColumns: DataTableColumn<SubmissionSummary>[] = shownFields.map((field) =>
      col.display({
        id: `answer-${field.key}`,
        header: field.labelAr,
        cell: (info) => cells.text(readAnswer(field, info.row.original.answers)),
      }),
    );

    return [
      // لا ترتيب في هذا الجدول: القائمة تُحمَّل دفعات بمؤشّر، وترتيب ما حُمّل
      // وحده يوهم بترتيب الكل. الخادم يعيد الأحدث أولًا.
      col.display({
        id: "applicant",
        header: "المتقدّم",
        cell: (info) => {
          const submission = info.row.original;
          // بلا اسم مستخرَج: إجابة أول سؤال اختاره الفارز، فلا يبقى صفّ بلا هوية.
          const title = submission.redactedAt
            ? REDACTED_SUBMISSION_LABEL
            : (submission.applicantNameAr ??
              shownFields.map((field) => readAnswer(field, submission.answers)).find(Boolean) ??
              "بلا اسم");
          const contact = [submission.applicantEmail, submission.applicantPhone].filter(Boolean).join(" · ");

          return (
            <PrimaryCell
              label={title}
              onClick={() => open(submission)}
              description={
                submission.redactedAt ? (
                  "بطلب صاحبه حذفَ بياناته"
                ) : contact ? (
                  <span dir="ltr">{contact}</span>
                ) : null
              }
            />
          );
        },
      }),
      ...answerColumns,
      col.accessor("status", {
        header: "الحالة",
        enableSorting: false,
        cell: (info) => <StatusBadge kind="submissionStatus" value={info.getValue()} />,
      }),
      col.accessor("submittedAt", {
        header: "أُرسل",
        enableSorting: false,
        cell: (info) => cells.dateTime(info.getValue()),
      }),
    ];
  }, [readAnswer, setState, shownFields]);

  const setAnswerFilters = (next: AnswerFilter[]) =>
    setState({ answers: next.length > 0 ? JSON.stringify(next) : "" });
  const activeCount = [state.status].filter(Boolean).length + answerFilters.length;
  const hasFilters = Boolean(state.q) || activeCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          BREADCRUMB_ROOT,
          { label: form.data?.nameAr ?? "الاستمارة", href: `/dashboard/forms/${id}/edit` },
          { label: "الطلبات" },
        ]}
        title={`طلبات ${form.data?.nameAr ?? "الاستمارة"}`}
        description="كل من أرسل الاستمارة، الأحدث أولًا. الفرز داخلي لا يُراسَل به المتقدّم."
        secondaryActions={[
          { key: "edit", label: "تحرير الأسئلة", icon: Pencil, href: `/dashboard/forms/${id}/edit` },
        ]}
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={state.q}
              onChange={(q) => setState({ q })}
              placeholder="بالاسم أو البريد أو الهاتف…"
              label="البحث في الطلبات"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={activeCount}
          onReset={resetFilters}
        >
          <FilterChips
            label="حالة الطلب"
            value={state.status}
            onChange={(status) => setState({ status })}
            options={STATUS_CHIPS}
          />
          {fields.some(isFilterable) ? (
            <AnswerFilterPopover
              fields={fields.filter(isFilterable)}
              valuesFor={valuesFor}
              onAdd={(filter) =>
                setAnswerFilters([...answerFilters.filter((item) => item.key !== filter.key), filter])
              }
            />
          ) : null}
          {fields.length > 0 ? (
            <ColumnsPopover
              fields={fields}
              shown={shownKeys}
              onChange={(keys) => setState({ cols: keys.join(",") }, { keepPage: true })}
            />
          ) : null}
        </Toolbar>

        {answerFilters.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="مرشّحات الإجابات">
            {answerFilters.map((filter) => {
              const field = fields.find((item) => item.key === filter.key);
              const label = field
                ? (valuesFor(field).find((option) => option.value === filter.value)?.labelAr ?? filter.value)
                : filter.value;

              return (
                <li key={filter.key}>
                  <button
                    type="button"
                    onClick={() => setAnswerFilters(answerFilters.filter((item) => item.key !== filter.key))}
                    className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {field?.labelAr ?? filter.key}: {label}
                    <X className="size-3" aria-hidden />
                    <span className="sr-only">إزالة المرشّح</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <DataTable
          caption="الطلبات"
          columns={columns}
          data={rows}
          getRowId={(submission) => submission.id}
          isLoading={submissions.isPending}
          error={submissions.error}
          onRetry={() => void submissions.refetch()}
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{
            title: "لا طلبات بعد",
            description: "يظهر هنا كل من يرسل الاستمارة من رابط التسجيل.",
          }}
          onRowClick={(submission) => setState({ submission: submission.id }, { keepPage: true })}
          // القراءة قبل القرار: «عرض الطلب» هو الفعل السريع، والنقل في القائمة
          // وفي لوحة الطلب بعد قراءة إجاباته.
          rowActions={(submission) => [
            {
              key: "open",
              label: "عرض الطلب",
              icon: Eye,
              quick: true,
              onSelect: () => setState({ submission: submission.id }, { keepPage: true }),
            },
            ...actionsFor(submission).map((action) => ({ ...action, quick: false })),
          ]}
          pagination={{
            mode: "cursor",
            hasMore: Boolean(submissions.hasNextPage),
            onLoadMore: () => void submissions.fetchNextPage(),
            isLoadingMore: submissions.isFetchingNextPage,
          }}
        />
      </div>

      <SubmissionSheet
        formId={id}
        submissionId={state.submission || null}
        onClose={() => setState({ submission: null }, { keepPage: true })}
        actionsFor={actionsFor}
      />
    </div>
  );
}

/**
 * مرشّح على إجابة سؤال: الخادم يطابق القيمة كما خُزّنت، فالقيمة تُختار من
 * خيارات السؤال (أو المحافظات والمكاتب للمراجع) ولا تُكتب.
 */
function AnswerFilterPopover({
  fields,
  valuesFor,
  onAdd,
}: {
  fields: readonly FormField[];
  valuesFor: (field: FormField) => readonly { value: string; labelAr: string }[];
  onAdd: (filter: AnswerFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const field = fields.find((item) => item.key === key);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setKey(null);
          setValue(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9">
          <ListFilter aria-hidden />
          مرشّح على إجابة
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end">
        <div className="space-y-1.5">
          <Label htmlFor="answer-filter-field">السؤال</Label>
          <Select
            id="answer-filter-field"
            options={fields.map((item) => ({ value: item.key, label: item.labelAr }))}
            value={key}
            onChange={(next) => {
              setKey(next);
              setValue(null);
            }}
            placeholder="اختر سؤالًا…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="answer-filter-value">الإجابة</Label>
          <Select
            id="answer-filter-value"
            disabled={!field}
            options={(field ? valuesFor(field) : []).map((option) => ({ value: option.value, label: option.labelAr }))}
            value={value}
            onChange={setValue}
            placeholder="اختر الإجابة…"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!key || !value}
            onClick={() => {
              if (!key || !value) return;
              onAdd({ key, value });
              setOpen(false);
            }}
          >
            تطبيق المرشّح
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * الأسئلة التي تُعرض إجاباتها أعمدةً. الفارز يقرّر ما يميّز الطلب عنده:
 * الاسم عند فريق، وتاريخ الميلاد أو المحافظة عند آخر.
 */
function ColumnsPopover({
  fields,
  shown,
  onChange,
}: {
  fields: readonly FormField[];
  shown: readonly string[];
  onChange: (keys: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9">
          <Columns3 aria-hidden />
          الأعمدة
          {shown.length > 0 ? (
            <span className="numeric rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
              {shown.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <p className="mb-2 text-xs text-muted-foreground">أظهر إجابة سؤال عمودًا في الجدول.</p>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {fields.map((field) => {
            const checked = shown.includes(field.key);
            const inputId = `column-${field.key}`;

            return (
              <li key={field.key} className="flex items-start gap-2">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(next) =>
                    onChange(
                      next === true
                        ? // بترتيب الأسئلة لا بترتيب النقر، فتثبت الأعمدة في مكانها.
                          fields.filter((item) => item.key === field.key || shown.includes(item.key)).map((item) => item.key)
                        : shown.filter((key) => key !== field.key),
                    )
                  }
                  className="mt-0.5"
                />
                <Label htmlFor={inputId} className="font-normal">
                  {field.labelAr}
                </Label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
