"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Circle, Rocket, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  INITIATIVE_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  ROLLUP_SHORT,
  SITE_STATUS_LABELS,
  WORK_STATUS_LABELS,
  type InitiativeDetail,
  addSite,
  cancelInitiative,
  deleteInitiative,
  getInitiative,
  launchInitiative,
  listMetrics,
  setInitiativeTarget,
  setSiteTarget,
  updateSite,
} from "@/lib/api/initiatives";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDateTime } from "@/lib/utils";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

/**
 * قائمة تحقق حيّة لمطابقة الأهداف.
 *
 * الخادم يحسبها ويعيدها مع كل قراءة، فما يظهر هنا هو ما ستفحصه البوابة
 * فعلًا عند الضغط على «بدء التنفيذ» — لا نسخة ثانية من المنطق تنحرف عنه.
 */
function RollupChecklist({ initiative }: { initiative: InitiativeDetail }) {
  const { rollup } = initiative;

  if (rollup.metrics.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        لا أهداف مسجّلة بعد. أضف هدفًا للمبادرة وأهدافًا لمواقعها.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rollup.metrics.map((metric) => (
        <li key={metric.metricId} className="flex items-start gap-2 text-sm">
          {metric.matches ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <Circle
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <span className="min-w-0">
            <span className="font-medium">{metric.metricNameAr}</span>
            <span className="text-muted-foreground">
              {" — "}
              هدف المبادرة {metric.initiativeTarget ?? "غير محدد"} · مجموع
              المواقع {metric.siteTargetSum} {metric.unitAr}
            </span>
          </span>
          <span className="sr-only">
            {metric.matches ? "مطابق" : "غير مطابق"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function InitiativeDetailPage() {
  const params = useParams<{ id: string }>();
  const initiativeId = params.id;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { can } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const initiative = useQuery({
    queryKey: ["initiative", initiativeId],
    queryFn: () => getInitiative(initiativeId),
  });

  const metrics = useQuery({ queryKey: ["metrics"], queryFn: listMetrics });

  function onMutated(updated: InitiativeDetail) {
    queryClient.setQueryData(["initiative", initiativeId], updated);
    void queryClient.invalidateQueries({ queryKey: ["initiatives"] });
    setError(null);
  }

  function onFailed(caught: unknown) {
    if (caught instanceof ApiError) {
      // بوابة STRICT تعيد المؤشرات غير المطابقة في `details`، فتُعرض بدل الرسالة وحدها.
      const detail = caught.fieldIssues
        .map((issue) => {
          const row = issue as unknown as {
            metricNameAr?: string;
            initiativeTarget?: number;
            siteTargetSum?: number;
          };
          return row.metricNameAr
            ? `${row.metricNameAr}: هدف ${row.initiativeTarget ?? "—"} مقابل ${row.siteTargetSum}`
            : null;
        })
        .filter(Boolean);

      setError(
        detail.length > 0
          ? `${caught.message} ${detail.join("، ")}`
          : caught.message,
      );
      return;
    }

    setError("تعذّر تنفيذ الإجراء. حاول مجددًا.");
  }

  const shared = { onSuccess: onMutated, onError: onFailed };

  const siteMutation = useMutation({
    mutationFn: (nameAr: string) => addSite(initiativeId, { nameAr }),
    ...shared,
  });

  const siteStatusMutation = useMutation({
    mutationFn: (input: { siteId: string; status: "CANCELLED" | "IN_PROGRESS" }) =>
      updateSite(initiativeId, input.siteId, { status: input.status }),
    ...shared,
  });

  const initiativeTargetMutation = useMutation({
    mutationFn: (input: { metricId: string; value: number }) =>
      setInitiativeTarget(initiativeId, input.metricId, input.value),
    ...shared,
  });

  const siteTargetMutation = useMutation({
    mutationFn: (input: { siteId: string; metricId: string; value: number }) =>
      setSiteTarget(initiativeId, input.siteId, input.metricId, input.value),
    ...shared,
  });

  /**
   * الإلغاء يُبقي السجل ويُخرج المبادرة من الخريطة والمجاميع، والحذف يمحوها
   * بمواقعها ومهامها. الأول لما جرى عليه عمل، والثاني لمسودة أُدخلت خطأً —
   * والخادم هو من يفصل بينهما، فالزر يُخفى ولا يَحرس.
   */
  const cancel = useMutation({
    mutationFn: () => cancelInitiative(initiativeId),
    ...shared,
  });

  const remove = useMutation({
    mutationFn: () => deleteInitiative(initiativeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.removeQueries({ queryKey: ["initiative", initiativeId] });
      // الصفحة تخصّ ما حُذف، فالبقاء عليها يعرض خطأ تحميل لا نتيجة.
      router.replace("/dashboard/initiatives");
    },
    onError: onFailed,
  });

  const launch = useMutation({
    mutationFn: () => launchInitiative(initiativeId),
    onSuccess: (result) => {
      onMutated(result);
      setWarnings(
        (result.warnings ?? []).map(
          (metric) =>
            `${metric.metricNameAr}: هدف ${metric.initiativeTarget ?? "—"} مقابل مجموع مواقع ${metric.siteTargetSum}`,
        ),
      );
    },
    onError: onFailed,
  });

  if (initiative.isPending) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (initiative.isError || !initiative.data) {
    return <Alert>تعذّر تحميل المبادرة.</Alert>;
  }

  const data = initiative.data;
  const canManage = can(CAPABILITIES.initiativesManage);
  const canLaunch = can(CAPABILITIES.initiativesLaunch);
  const liveSites = data.sites.filter((site) => site.status !== "CANCELLED");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.nameAr}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.programNameAr}
            {data.season ? ` · ${data.season}` : ""}
            {data.launchedAt ? ` · بدأ ${formatDateTime(data.launchedAt)}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
            {INITIATIVE_STATUS_LABELS[data.status]}
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            مطابقة {ROLLUP_SHORT[data.targetRollup]}
          </span>
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {warnings.length > 0 ? (
        <Alert variant="info">
          بدأ التنفيذ مع ملاحظات على المطابقة: {warnings.join("، ")}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section
            title="مواقع التنفيذ"
            description="العدد مفتوح. الموقع الملغى يخرج من مجموع الأهداف."
          >
            {data.sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا مواقع بعد.</p>
            ) : (
              <ul className="space-y-2">
                {data.sites.map((site) => (
                  <li
                    key={site.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{site.nameAr}</span>
                        <span
                          className={cn(
                            "ms-2 rounded px-1.5 py-0.5 text-xs",
                            site.status === "CANCELLED"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {SITE_STATUS_LABELS[site.status]}
                        </span>
                        {site.areaNameAr ? (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {site.areaNameAr}
                          </span>
                        ) : null}
                      </div>

                      {canManage && site.status !== "CANCELLED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            siteStatusMutation.mutate({
                              siteId: site.id,
                              status: "CANCELLED",
                            })
                          }
                        >
                          إلغاء الموقع
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {site.targets.length === 0 ? (
                        <span className="text-muted-foreground">بلا أهداف</span>
                      ) : (
                        site.targets.map((target) => (
                          <span
                            key={target.metricId}
                            className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground"
                          >
                            {target.metricNameAr}: {target.value} {target.unitAr}
                          </span>
                        ))
                      )}
                    </div>

                    {canManage ? (
                      <form
                        className="mt-2 flex flex-wrap gap-2"
                        noValidate
                        onSubmit={(event) => {
                          event.preventDefault();
                          setError(null);
                          const form = new FormData(event.currentTarget);
                          const metricId = String(form.get("metricId") ?? "");
                          const numVal = Number(form.get("value") ?? 0);
                          const result = z
                            .number()
                            .positive("قيمة الهدف يجب أن تكون أكبر من الصفر.")
                            .max(999_999_999, "القيمة كبيرة جدًا.")
                            .safeParse(numVal);

                          if (!result.success) {
                            setError(
                              result.error.issues[0]?.message ??
                                "قيمة غير صالحة.",
                            );
                            return;
                          }

                          siteTargetMutation.mutate({
                            siteId: site.id,
                            metricId,
                            value: result.data,
                          });
                          event.currentTarget.reset();
                        }}
                      >
                        <select
                          name="metricId"
                          required
                          aria-label="المؤشر"
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {metrics.data?.map((metric) => (
                            <option key={metric.id} value={metric.id}>
                              {metric.nameAr} ({metric.unitAr})
                            </option>
                          ))}
                        </select>
                        <Input
                          name="value"
                          type="number"
                          step="any"
                          min="0"
                          placeholder="الهدف"
                          required
                          className="h-8 w-28 text-xs"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          تحديد هدف
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canManage ? (
              <form
                className="flex gap-2 border-t border-border pt-3"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  const form = new FormData(event.currentTarget);
                  const rawName = String(form.get("nameAr") ?? "");
                  const result = z
                    .string()
                    .trim()
                    .min(2, "اسم الموقع يجب ألا يقل عن حرفين.")
                    .max(200, "اسم الموقع طويل جدًا.")
                    .safeParse(rawName);

                  if (!result.success) {
                    setError(
                      result.error.issues[0]?.message ??
                        "اسم الموقع غير صالح.",
                    );
                    return;
                  }

                  siteMutation.mutate(result.data);
                  event.currentTarget.reset();
                }}
              >
                <Input name="nameAr" placeholder="اسم الموقع" required />
                <Button type="submit" loading={siteMutation.isPending}>
                  إضافة موقع
                </Button>
              </form>
            ) : null}
          </Section>

          <Section title="خطة العمل" description="مُولّدة من قوالب البرنامج.">
            {data.work.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا مراحل.</p>
            ) : (
              <ol className="space-y-3">
                {data.work.milestones.map((milestone) => (
                  <li key={milestone.id}>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {milestone.titleAr}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {MILESTONE_STATUS_LABELS[milestone.status as keyof typeof MILESTONE_STATUS_LABELS]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {milestone.doneTaskCount}/{milestone.taskCount}
                      </span>
                    </div>

                    <ul className="mt-1 space-y-1 border-s-2 border-border ps-3">
                      {data.work.workItems
                        .filter((task) => task.milestoneId === milestone.id)
                        .map((task) => (
                          <li
                            key={task.id}
                            className="flex flex-wrap items-center gap-2 text-xs"
                          >
                            <span>{task.titleAr}</span>
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                              {WORK_STATUS_LABELS[task.status as keyof typeof WORK_STATUS_LABELS]}
                            </span>
                            {task.dueAt ? (
                              <span className="text-muted-foreground">
                                {formatDateTime(task.dueAt)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section
            title="مطابقة الأهداف"
            description="مجموع أهداف المواقع مقابل هدف المبادرة."
          >
            <RollupChecklist initiative={data} />

            {canLaunch && (data.status === "DRAFT" || data.status === "PLANNING") ? (
              <Button
                className="w-full gap-2"
                loading={launch.isPending}
                disabled={liveSites.length === 0}
                onClick={() => launch.mutate()}
              >
                <Rocket className="size-4" />
                بدء التنفيذ
              </Button>
            ) : null}

            {liveSites.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لا يبدأ التنفيذ بلا موقع واحد على الأقل.
              </p>
            ) : null}
          </Section>

          <Section title="أهداف المبادرة">
            {data.targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا أهداف.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.targets.map((target) => (
                  <li key={target.metricId} className="flex justify-between gap-2">
                    <span>{target.metricNameAr}</span>
                    <span className="text-muted-foreground">
                      {target.value} {target.unitAr}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canManage ? (
              <form
                className="space-y-2 border-t border-border pt-3"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  const form = new FormData(event.currentTarget);
                  const metricId = String(form.get("metricId") ?? "");
                  const numVal = Number(form.get("value") ?? 0);
                  const result = z
                    .number()
                    .positive("قيمة الهدف يجب أن تكون أكبر من الصفر.")
                    .max(999_999_999, "القيمة كبيرة جدًا.")
                    .safeParse(numVal);

                  if (!result.success) {
                    setError(
                      result.error.issues[0]?.message ??
                        "قيمة غير صالحة.",
                    );
                    return;
                  }

                  initiativeTargetMutation.mutate({
                    metricId,
                    value: result.data,
                  });
                  event.currentTarget.reset();
                }}
              >
                <select
                  name="metricId"
                  required
                  aria-label="المؤشر"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {metrics.data?.map((metric) => (
                    <option key={metric.id} value={metric.id}>
                      {metric.nameAr} ({metric.unitAr})
                    </option>
                  ))}
                </select>
                <Input
                  name="value"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="القيمة"
                  required
                />
                <Button type="submit" variant="outline" className="w-full">
                  تحديد هدف المبادرة
                </Button>
              </form>
            ) : null}
          </Section>

          <Section title="التقدم" description="الموثّق وحده يدخل المجاميع.">
            {data.progress.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا قيود أثر بعد.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data.progress.map((row) => (
                  <li key={row.metricId}>
                    <div className="flex justify-between gap-2">
                      <span>{row.metricNameAr}</span>
                      <span className="text-muted-foreground">
                        {row.actual}
                        {row.initiativeTarget !== null
                          ? ` / ${row.initiativeTarget}`
                          : ""}{" "}
                        {row.unitAr}
                      </span>
                    </div>

                    {row.percent !== null ? (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success"
                          style={{ width: `${Math.min(row.percent, 100)}%` }}
                        />
                      </div>
                    ) : null}

                    {row.unverified > 0 ? (
                      <p className="mt-1 text-xs text-warning">
                        {row.unverified} {row.unitAr} بانتظار التحقق
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {canLaunch &&
          data.status !== "CANCELLED" &&
          data.status !== "COMPLETED" ? (
            <Section
              title="إنهاء المبادرة"
              description="الإلغاء يُبقي سجلها ويُخرجها من الخريطة والمجاميع. الحذف للمسودة وحدها."
            >
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  loading={cancel.isPending}
                  onClick={() => {
                    // التأكيد يحمل الاسم: سؤال عام يُنقر بلا قراءة.
                    if (
                      window.confirm(
                        `إلغاء «${data.nameAr}»؟ تختفي من الخريطة ويبقى سجلها.`,
                      )
                    ) {
                      cancel.mutate();
                    }
                  }}
                >
                  <Ban className="size-4" />
                  إلغاء المبادرة
                </Button>

                {data.status === "DRAFT" ? (
                  <Button
                    variant="ghost"
                    className="w-full gap-2 text-destructive hover:text-destructive"
                    loading={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `حذف مسودة «${data.nameAr}» نهائيًا؟ تُمحى مواقعها ومهامها ولا رجعة.`,
                        )
                      ) {
                        remove.mutate();
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    حذف المسودة
                  </Button>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section title="النطاق الجغرافي">
            {data.areas.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم تُعلَن مناطق.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.areas.map((area) => (
                  <li key={area.id}>{area.areaNameAr}</li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
