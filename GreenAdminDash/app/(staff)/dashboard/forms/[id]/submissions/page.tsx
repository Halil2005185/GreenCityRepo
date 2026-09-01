"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useRefOptions } from "@/components/forms/use-ref-options";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  type AnswerFilter,
  type FormField,
  REF_TYPES,
  SUBMISSION_STATUS_LABELS,
  type SubmissionStatus,
  type SubmissionSummary,
  getForm,
  getSubmission,
  listSubmissions,
  setSubmissionStatus,
} from "@/lib/api/forms";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDateTime } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const STATUS_STYLES: Record<SubmissionStatus, string> = {
  NEW: "bg-primary/10 text-primary",
  IN_REVIEW: "bg-warning/15 text-warning",
  ACCEPTED: "bg-success/15 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
};

/**
 * ما يصلح للترشيح: أسئلة قيمها من مجموعة معروفة.
 *
 * النصّ الحرّ لا يُرشَّح بالمطابقة التامة — من يكتب «دمشق - المزة» لا يطابق
 * «دمشق»، فيبدو المرشّح معطّلًا. وللبحث في النصّ صندوق البحث أعلاه.
 */
const FILTERABLE = ["SINGLE_SELECT", "MULTI_SELECT", "BOOLEAN", ...REF_TYPES];

const BOOLEAN_OPTIONS = [
  { value: "true", labelAr: "نعم" },
  { value: "false", labelAr: "لا" },
];

const FILTERS: Array<{ value: SubmissionStatus | ""; label: string }> = [
  { value: "", label: "الكل" },
  { value: "NEW", label: SUBMISSION_STATUS_LABELS.NEW },
  { value: "IN_REVIEW", label: SUBMISSION_STATUS_LABELS.IN_REVIEW },
  { value: "ACCEPTED", label: SUBMISSION_STATUS_LABELS.ACCEPTED },
  { value: "REJECTED", label: SUBMISSION_STATUS_LABELS.REJECTED },
];

export default function SubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [status, setStatus] = useState<SubmissionStatus | "">("");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * الصفحات مؤشّرها وقت التقديم لا رقم صفحة، فما وصل أثناء القراءة لا يزحزح
   * ما تحته. والصفحات المحمَّلة تُجمع هنا لأن كل نداء يعيد دفعةً واحدة.
   */
  const [pages, setPages] = useState<string[]>([]);
  const [answers, setAnswers] = useState<AnswerFilter[]>([]);
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const canManage = can(CAPABILITIES.formsManage);

  const form = useQuery({ queryKey: ["forms", id], queryFn: () => getForm(id) });

  /**
   * الترشيح على أسئلة **الإصدار المنشور**: هو ما أجاب عنه المتقدّمون.
   * أسئلة المسوّدة قد لا يقابلها في الطلبات شيء.
   */
  const fields: FormField[] = form.data?.published?.fields ?? [];
  const filterable = fields.filter((field) => FILTERABLE.includes(field.type));
  const refOptions = useRefOptions(
    filterable.some((field) => REF_TYPES.includes(field.type)),
  );

  const chosen = filterable.find((field) => field.key === draftKey) ?? null;

  const valuesFor = (field: FormField) =>
    field.type === "BOOLEAN"
      ? BOOLEAN_OPTIONS
      : REF_TYPES.includes(field.type)
        ? (refOptions[field.type as keyof typeof refOptions] ?? [])
        : field.options;

  const labelOf = (filter: AnswerFilter) => {
    const field = fields.find((one) => one.key === filter.key);

    if (!field) return `${filter.key}: ${filter.value}`;

    const option = valuesFor(field).find((one) => one.value === filter.value);

    return `${field.labelAr}: ${option?.labelAr ?? filter.value}`;
  };

  const listKey = ["submissions", id, status, search, answers] as const;

  const first = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listSubmissions(id, {
        ...(status ? { status } : {}),
        ...(search ? { q: search } : {}),
        answers,
      }),
  });

  const more = useQuery({
    queryKey: [...listKey, pages] as const,
    queryFn: async () => {
      const rows: SubmissionSummary[] = [];
      let nextBefore: string | null = null;

      for (const before of pages) {
        const page = await listSubmissions(id, {
          ...(status ? { status } : {}),
          ...(search ? { q: search } : {}),
          answers,
          before,
        });

        rows.push(...page.data);
        nextBefore = page.nextBefore;
      }

      return { data: rows, nextBefore };
    },
    enabled: pages.length > 0,
  });

  const detail = useQuery({
    queryKey: ["submission", id, openId],
    queryFn: () => getSubmission(id, openId!),
    enabled: Boolean(openId),
  });

  const move = useMutation({
    mutationFn: (input: { submissionId: string; status: SubmissionStatus }) =>
      setSubmissionStatus(id, input.submissionId, input.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["submissions", id] });
      void queryClient.invalidateQueries({ queryKey: ["submission", id] });
      setError(null);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : "تعذّر تحديث حالة الطلب.",
      ),
  });

  const rows = [...(first.data?.data ?? []), ...(more.data?.data ?? [])];
  const nextBefore = pages.length > 0 ? more.data?.nextBefore : first.data?.nextBefore;

  function applySearch(value: string) {
    setPages([]);
    setSearch(value.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/forms"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4" aria-hidden />
            الاستمارات
          </Link>

          <h1 className="mt-1 text-2xl font-bold">
            طلبات {form.data?.nameAr ?? "الاستمارة"}
          </h1>
        </div>

        <Link
          href={`/dashboard/forms/${id}/edit`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          تحرير الأسئلة ←
        </Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value || "ALL"}
              type="button"
              onClick={() => {
                setPages([]);
                setStatus(filter.value);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                status === filter.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch(term);
          }}
        >
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="بحث بالاسم أو البريد أو الهاتف"
            className="h-9 w-64"
            aria-label="بحث في الطلبات"
          />

          <Button type="submit" size="sm" variant="outline" className="gap-1.5">
            <Search className="size-4" />
            بحث
          </Button>
        </form>
      </div>

      {filterable.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="filter-field" className="text-xs">
                ترشيح بإجابة
              </Label>

              <select
                id="filter-field"
                className={SELECT_CLASS}
                value={draftKey}
                onChange={(event) => {
                  setDraftKey(event.target.value);
                  setDraftValue("");
                }}
              >
                <option value="">اختر سؤالًا…</option>
                {filterable.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.labelAr}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="filter-value" className="text-xs">
                القيمة
              </Label>

              <select
                id="filter-value"
                className={SELECT_CLASS}
                value={draftValue}
                disabled={!chosen}
                onChange={(event) => setDraftValue(event.target.value)}
              >
                <option value="">اختر…</option>
                {chosen
                  ? valuesFor(chosen).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.labelAr}
                      </option>
                    ))
                  : null}
              </select>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!draftKey || !draftValue}
              onClick={() => {
                setPages([]);
                setAnswers((current) =>
                  current.some(
                    (one) => one.key === draftKey && one.value === draftValue,
                  )
                    ? current
                    : [...current, { key: draftKey, value: draftValue }],
                );
                setDraftValue("");
              }}
            >
              <Plus className="size-4" />
              أضف
            </Button>
          </div>

          {answers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {answers.map((filter) => (
                <button
                  key={`${filter.key}:${filter.value}`}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary"
                  onClick={() => {
                    setPages([]);
                    setAnswers((current) =>
                      current.filter(
                        (one) =>
                          !(one.key === filter.key && one.value === filter.value),
                      ),
                    );
                  }}
                >
                  {labelOf(filter)}
                  <X className="size-3" aria-hidden />
                  <span className="sr-only">إزالة المرشّح</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              المرشّحات تُجمع بـ«و»: كل واحد يضيّق النتيجة. والنصّ الحرّ يُبحث
              من صندوق البحث لا من هنا.
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {first.isPending ? (
              <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : first.isError ? (
              <div className="p-6">
                <Alert>تعذّر تحميل الطلبات.</Alert>
              </div>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {search || status || answers.length > 0
                  ? "لا طلبات تطابق الترشيح."
                  : "لا طلبات بعد. سيظهر هنا كل من يرسل الاستمارة."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(row.id)}
                      className={cn(
                        "flex w-full flex-wrap items-center justify-between gap-3 p-4 text-start transition-colors hover:bg-muted/50",
                        openId === row.id && "bg-muted/60",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {row.applicantNameAr ?? "بلا اسم"}
                        </p>

                        <p
                          className="mt-0.5 text-xs text-muted-foreground"
                          dir="ltr"
                        >
                          {[row.applicantEmail, row.applicantPhone]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {formatDateTime(row.submittedAt)}
                        </span>

                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5",
                            STATUS_STYLES[row.status],
                          )}
                        >
                          {SUBMISSION_STATUS_LABELS[row.status]}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {nextBefore ? (
              <div className="border-t border-border p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={more.isFetching}
                  onClick={() => setPages((current) => [...current, nextBefore])}
                >
                  تحميل المزيد
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {openId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {detail.data?.applicantNameAr ?? "الطلب"}
              </CardTitle>

              <CardDescription>
                {detail.data
                  ? `الإصدار ${detail.data.formVersion} · ${formatDateTime(detail.data.submittedAt)}`
                  : "…"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {detail.isPending ? (
                <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
              ) : detail.isError || !detail.data ? (
                <Alert>تعذّر تحميل الطلب.</Alert>
              ) : (
                <>
                  {canManage ? (
                    <div className="space-y-1.5">
                      {/*
                        عنوان صريح: رقائق الترشيح أعلاه تحمل الأسماء نفسها،
                        وبلا تسمية يُقرأ الزرّان سواءً فيُنقل طلب بنيّة ترشيح.
                      */}
                      <p className="text-xs text-muted-foreground">نقل الحالة إلى</p>

                      <div className="flex flex-wrap gap-1.5">
                      {(
                        Object.keys(SUBMISSION_STATUS_LABELS) as SubmissionStatus[]
                      ).map((value) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={
                            detail.data.status === value ? "default" : "outline"
                          }
                          loading={
                            move.isPending && move.variables?.status === value
                          }
                          onClick={() =>
                            move.mutate({ submissionId: openId, status: value })
                          }
                        >
                          {SUBMISSION_STATUS_LABELS[value]}
                        </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-xs",
                        STATUS_STYLES[detail.data.status],
                      )}
                    >
                      {SUBMISSION_STATUS_LABELS[detail.data.status]}
                    </span>
                  )}

                  {/*
                    الإجابات بأسئلة الإصدار الذي أُرسل معه، لا بأسئلة المسوّدة
                    الحالية — الخادم يبنيها كذلك.
                  */}
                  <dl className="space-y-3 text-sm">
                    {detail.data.answers.length === 0 ? (
                      <p className="text-muted-foreground">لا إجابات مسجّلة.</p>
                    ) : (
                      detail.data.answers.map((answer, index) => (
                        <div key={index}>
                          <dt className="text-xs text-muted-foreground">
                            {answer.labelAr}
                          </dt>
                          <dd className="whitespace-pre-wrap">{answer.valueAr}</dd>
                        </div>
                      ))
                    )}
                  </dl>

                  {detail.data.applicantEmail ? (
                    <a
                      href={`mailto:${detail.data.applicantEmail}`}
                      className="block text-sm font-medium text-primary underline-offset-4 hover:underline"
                      dir="ltr"
                    >
                      {detail.data.applicantEmail}
                    </a>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              اختر طلبًا لعرض إجاباته.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
