"use client";

import {
  Ban,
  CircleCheck,
  MapPinPlus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  AreaAddDialog,
  SiteDialog,
  TargetDialog,
  useInitiativeCache,
} from "@/components/initiatives/initiative-dialogs";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AREA_LEVEL_LABELS,
  ROLLUP_LABELS,
  removeInitiativeArea,
  updateSite,
  type InitiativeDetail,
  type SiteStatus,
} from "@/lib/api/initiatives";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils";

type Site = InitiativeDetail["sites"][number];
type Area = InitiativeDetail["areas"][number];
type Milestone = InitiativeDetail["work"]["milestones"][number];
type WorkItem = InitiativeDetail["work"]["workItems"][number];

const MANAGE = [CAPABILITIES.initiativesManage] as const;

/** «١٢٬٥٠٠» بخانات المؤشر العشرية، والأرقام لاتينية كبقية اللوحة. */
function formatValue(value: number, decimals = 0) {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

// ── المواقع ─────────────────────────────────────────────────────────────

const siteCol = columnHelper<Site>();

const SITE_STATUS_MESSAGES: Record<SiteStatus, string> = {
  PLANNED: "أُعيد الموقع إلى «مخطط».",
  IN_PROGRESS: "بدأ العمل في الموقع.",
  COMPLETED: "اكتمل الموقع.",
  CANCELLED: "أُلغي الموقع.",
};

export function SitesSection({ initiative }: { initiative: InitiativeDetail }) {
  const confirm = useConfirm();
  const apply = useInitiativeCache();
  const [siteDialog, setSiteDialog] = useState<{ site: Site | null; open: boolean }>({
    site: null,
    open: false,
  });
  const [targetDialog, setTargetDialog] = useState<{ site: Site | null; open: boolean }>({
    site: null,
    open: false,
  });

  const setStatus = useApiMutation({
    mutationFn: ({ site, status }: { site: Site; status: SiteStatus }) =>
      updateSite(initiative.id, site.id, { status }),
    successMessage: (_, { status }) => SITE_STATUS_MESSAGES[status],
    errorFallback: "تعذّر تحديث الموقع.",
    onSuccess: apply,
  });

  const columns = useMemo(
    () =>
      siteCol.columns([
        siteCol.accessor("nameAr", {
          header: "الموقع",
          cell: (info) => (
            <PrimaryCell label={info.getValue()} description={info.row.original.descriptionAr} />
          ),
        }),
        siteCol.accessor((site) => site.areaNameAr ?? undefined, {
          id: "area",
          header: "المنطقة",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        siteCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <StatusBadge kind="siteStatus" value={info.getValue()} />,
        }),
        siteCol.accessor("targets", {
          header: "الأهداف",
          enableSorting: false,
          cell: (info) =>
            info.getValue().length > 0 ? (
              <div className="flex max-w-80 flex-wrap gap-1">
                {info.getValue().map((target) => (
                  <Badge key={target.metricId} tone="neutral">
                    {target.metricNameAr}:{" "}
                    <span className="numeric">{formatValue(target.value, target.decimals)}</span>{" "}
                    {target.unitAr}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">بلا أهداف</span>
            ),
        }),
      ]),
    [],
  );

  const add = {
    key: "add-site",
    label: "إضافة موقع",
    icon: Plus,
    requires: MANAGE,
    onSelect: () => setSiteDialog({ site: null, open: true }),
  };

  return (
    <Section
      title="مواقع التنفيذ"
      description="العدد مفتوح. الموقع الملغى يخرج من مجموع الأهداف ومن الخريطة."
      actions={[add]}
    >
      <DataTable
        caption="مواقع التنفيذ"
        columns={columns}
        data={initiative.sites}
        getRowId={(site) => site.id}
        pagination={false}
        empty={{
          title: "لا مواقع بعد",
          description: "لا يبدأ التنفيذ بلا موقع واحد على الأقل.",
          action: add,
        }}
        rowActions={(site) => {
          const loading = setStatus.isPendingFor((variables) => variables.site.id === site.id);
          const cancelled = site.status === "CANCELLED";

          return [
            {
              key: "target",
              label: "تحديد هدف",
              icon: Target,
              quick: true,
              requires: MANAGE,
              hidden: cancelled,
              onSelect: () => setTargetDialog({ site, open: true }),
            },
            {
              key: "edit",
              label: "تعديل الموقع",
              icon: Pencil,
              requires: MANAGE,
              onSelect: () => setSiteDialog({ site, open: true }),
            },
            {
              key: "start",
              label: "بدء العمل في الموقع",
              icon: Play,
              requires: MANAGE,
              hidden: site.status !== "PLANNED",
              loading,
              onSelect: () => setStatus.mutate({ site, status: "IN_PROGRESS" }),
            },
            {
              key: "complete",
              label: "إكمال الموقع",
              icon: CircleCheck,
              requires: MANAGE,
              hidden: site.status !== "IN_PROGRESS",
              loading,
              onSelect: () => setStatus.mutate({ site, status: "COMPLETED" }),
            },
            {
              key: "restore",
              label: "استعادة الموقع",
              icon: RotateCcw,
              requires: MANAGE,
              hidden: !cancelled,
              loading,
              onSelect: () => setStatus.mutate({ site, status: "PLANNED" }),
            },
            {
              key: "cancel",
              label: "إلغاء الموقع",
              icon: Ban,
              destructive: true,
              requires: MANAGE,
              hidden: cancelled,
              onSelect: () =>
                void confirm({
                  title: `إلغاء موقع «${site.nameAr}»؟`,
                  description:
                    "يخرج من مجموع الأهداف ومن الخريطة ويبقى في السجل. يمكن استعادته لاحقًا.",
                  confirmLabel: "إلغاء الموقع",
                  destructive: true,
                  successMessage: SITE_STATUS_MESSAGES.CANCELLED,
                  onConfirm: async () =>
                    apply(await updateSite(initiative.id, site.id, { status: "CANCELLED" })),
                }),
            },
          ];
        }}
      />

      <SiteDialog
        initiativeId={initiative.id}
        site={siteDialog.site}
        open={siteDialog.open}
        onOpenChange={(open) => setSiteDialog((current) => ({ ...current, open }))}
      />
      <TargetDialog
        initiative={initiative}
        site={targetDialog.site}
        open={targetDialog.open}
        onOpenChange={(open) => setTargetDialog((current) => ({ ...current, open }))}
      />
    </Section>
  );
}

// ── الأهداف والتقدم ─────────────────────────────────────────────────────

type TargetRow = {
  metricId: string;
  metricNameAr: string;
  unitAr: string;
  decimals: number;
  initiativeTarget: number | null;
  siteTargetSum: number;
  matches: boolean | null;
  actual: number;
  unverified: number;
  percent: number | null;
};

/**
 * ثلاث بطاقات جانبية («مطابقة الأهداف»، «أهداف المبادرة»، «التقدم») كانت
 * تكرر المؤشرات نفسها بثلاثة أشكال. صارت جدولًا واحدًا: صف لكل مؤشر فيه
 * الهدف ومجموع المواقع والمطابقة والمتحقق.
 */
function targetRows(initiative: InitiativeDetail): TargetRow[] {
  const rows = new Map<string, TargetRow>();

  const row = (metric: {
    metricId: string;
    metricNameAr: string;
    unitAr: string;
    decimals?: number;
  }) => {
    const existing = rows.get(metric.metricId);

    if (existing) return existing;

    const created: TargetRow = {
      metricId: metric.metricId,
      metricNameAr: metric.metricNameAr,
      unitAr: metric.unitAr,
      decimals: metric.decimals ?? 0,
      initiativeTarget: null,
      siteTargetSum: 0,
      matches: null,
      actual: 0,
      unverified: 0,
      percent: null,
    };

    rows.set(metric.metricId, created);

    return created;
  };

  for (const target of initiative.targets) row(target).initiativeTarget = target.value;

  for (const metric of initiative.rollup.metrics) {
    const current = row(metric);

    current.siteTargetSum = metric.siteTargetSum;
    current.initiativeTarget = metric.initiativeTarget;
    current.matches = metric.matches;
  }

  for (const progress of initiative.progress) {
    Object.assign(row(progress), {
      decimals: progress.decimals,
      siteTargetSum: progress.siteTargetSum,
      initiativeTarget: progress.initiativeTarget,
      actual: progress.actual,
      unverified: progress.unverified,
      percent: progress.percent,
    });
  }

  return [...rows.values()];
}

const targetCol = columnHelper<TargetRow>();

export function TargetsSection({ initiative }: { initiative: InitiativeDetail }) {
  const [dialog, setDialog] = useState<{ metricId: string | null; open: boolean }>({
    metricId: null,
    open: false,
  });
  const policy = initiative.rollup.policy;
  const rows = useMemo(() => targetRows(initiative), [initiative]);

  const columns = useMemo(
    () =>
      targetCol.columns([
        targetCol.accessor("metricNameAr", {
          header: "المؤشر",
          cell: (info) => (
            <PrimaryCell label={info.getValue()} description={info.row.original.unitAr} />
          ),
        }),
        targetCol.accessor((row) => row.initiativeTarget ?? undefined, {
          id: "target",
          header: "هدف المبادرة",
          sortUndefined: "last",
          meta: { numeric: true },
          cell: (info) => {
            const value = info.getValue();

            return value === undefined ? <EmptyCell /> : formatValue(value, info.row.original.decimals);
          },
        }),
        targetCol.accessor("siteTargetSum", {
          header: "مجموع المواقع",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const { matches, decimals } = info.row.original;

            return (
              <span className="inline-flex items-center gap-2">
                <span className="numeric">{formatValue(info.getValue(), decimals)}</span>
                {policy === "NONE" || matches === null ? null : matches ? (
                  <Badge tone="success">مطابق</Badge>
                ) : (
                  <Badge tone={policy === "STRICT" ? "danger" : "warning"}>غير مطابق</Badge>
                )}
              </span>
            );
          },
        }),
        targetCol.accessor("actual", {
          header: "المتحقق",
          cell: (info) => {
            const { percent, decimals } = info.row.original;

            return (
              <div className="min-w-28 space-y-1">
                <span className="numeric">{formatValue(info.getValue(), decimals)}</span>
                {percent !== null ? (
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percent)}
                    aria-label="نسبة التحقق من الهدف"
                  >
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          },
        }),
        targetCol.accessor("unverified", {
          header: "بانتظار التحقق",
          meta: { numeric: true },
          cell: (info) =>
            info.getValue() > 0 ? (
              <span className="text-[color-mix(in_oklch,var(--warning)_55%,var(--foreground))]">
                {formatValue(info.getValue(), info.row.original.decimals)}
              </span>
            ) : (
              <EmptyCell />
            ),
        }),
      ]),
    [policy],
  );

  const add = {
    key: "add-target",
    label: "تحديد هدف",
    icon: Target,
    requires: MANAGE,
    onSelect: () => setDialog({ metricId: null, open: true }),
  };

  return (
    <Section
      title="الأهداف والتقدم"
      description={`المطابقة ${ROLLUP_LABELS[policy]}. الموثّق وحده يدخل «المتحقق».`}
      actions={[add]}
    >
      <DataTable
        caption="الأهداف والتقدم"
        columns={columns}
        data={rows}
        getRowId={(row) => row.metricId}
        pagination={false}
        empty={{
          title: "لا أهداف بعد",
          description: "حدّد هدفًا للمبادرة، ثم أهدافًا لمواقعها من تبويب المواقع.",
          action: add,
        }}
        rowActions={(row) => [
          {
            key: "edit",
            label: row.initiativeTarget === null ? "تحديد هدف المبادرة" : "تعديل هدف المبادرة",
            icon: Pencil,
            quick: true,
            requires: MANAGE,
            onSelect: () => setDialog({ metricId: row.metricId, open: true }),
          },
        ]}
      />

      <TargetDialog
        initiative={initiative}
        metricId={dialog.metricId}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Section>
  );
}

// ── خطة العمل ───────────────────────────────────────────────────────────

const taskCol = columnHelper<WorkItem>();

function taskOwner(task: WorkItem) {
  return task.assigneeNameAr ?? task.assignedPartnerNameAr ?? task.followUpOfficeNameAr;
}

function MilestoneTasks({ title, milestone, tasks }: {
  title: string;
  milestone: Milestone | null;
  tasks: readonly WorkItem[];
}) {
  const columns = useMemo(
    () =>
      taskCol.columns([
        taskCol.accessor("titleAr", {
          header: "المهمة",
          enableSorting: false,
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={
                info.row.original.status === "BLOCKED" && info.row.original.blockedReasonAr
                  ? `سبب التعثّر: ${info.row.original.blockedReasonAr}`
                  : null
              }
            />
          ),
        }),
        taskCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <StatusBadge kind="workStatus" value={info.getValue()} />,
        }),
        taskCol.accessor("priority", {
          header: "الأولوية",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="workPriority" value={info.getValue()} />,
        }),
        taskCol.accessor((task) => taskOwner(task) ?? undefined, {
          id: "owner",
          header: "المسؤول",
          enableSorting: false,
          cell: (info) => cells.text(info.getValue()),
        }),
        taskCol.accessor("dueAt", {
          header: "الموعد",
          enableSorting: false,
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {milestone ? (
          <>
            <StatusBadge kind="milestoneStatus" value={milestone.status} />
            <span className="text-xs text-muted-foreground">
              <span className="numeric">
                {milestone.doneTaskCount}/{milestone.taskCount}
              </span>{" "}
              منجزة
              {milestone.dueAt ? ` · حتى ${formatDate(milestone.dueAt)}` : ""}
            </span>
          </>
        ) : null}
      </div>
      <DataTable
        caption={title}
        columns={columns}
        data={tasks}
        getRowId={(task) => task.id}
        pagination={false}
        empty={{ title: "لا مهام في هذه المرحلة" }}
      />
    </section>
  );
}

/**
 * المراحل بمهامها كما وُلّدت من قوالب البرنامج. المهام بلا مرحلة كانت لا
 * تظهر أصلًا (العرض يمرّ على المراحل وحدها)؛ لها الآن مجموعة «بلا مرحلة».
 * تغيير حالة المهمة من صفحة المهام، فهنا عرض الخطة كاملة.
 */
export function WorkPlanSection({ initiative }: { initiative: InitiativeDetail }) {
  const { milestones, workItems } = initiative.work;
  const orphans = workItems.filter(
    (task) => !task.milestoneId || !milestones.some((milestone) => milestone.id === task.milestoneId),
  );

  if (milestones.length === 0 && workItems.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          title="لا خطة عمل"
          description="برنامج هذه المبادرة بلا قوالب مراحل ومهام."
        />
      </div>
    );
  }

  return (
    <Section title="خطة العمل" description="مراحل ومهام مولّدة من قوالب البرنامج.">
      <div className="space-y-6">
        {[...milestones]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((milestone) => (
            <MilestoneTasks
              key={milestone.id}
              title={milestone.titleAr}
              milestone={milestone}
              tasks={workItems.filter((task) => task.milestoneId === milestone.id)}
            />
          ))}
        {orphans.length > 0 ? (
          <MilestoneTasks title="بلا مرحلة" milestone={null} tasks={orphans} />
        ) : null}
      </div>
    </Section>
  );
}

// ── النطاق الجغرافي ─────────────────────────────────────────────────────

const areaCol = columnHelper<Area>();

export function AreasSection({ initiative }: { initiative: InitiativeDetail }) {
  const confirm = useConfirm();
  const apply = useInitiativeCache();
  const [open, setOpen] = useState(false);

  const columns = useMemo(
    () =>
      areaCol.columns([
        areaCol.accessor("areaNameAr", {
          header: "المنطقة",
          cell: (info) => <PrimaryCell label={info.getValue()} description={info.row.original.noteAr} />,
        }),
        areaCol.accessor("level", {
          header: "المستوى",
          cell: (info) => AREA_LEVEL_LABELS[info.getValue()],
        }),
      ]),
    [],
  );

  const add = {
    key: "add-area",
    label: "إضافة منطقة",
    icon: MapPinPlus,
    requires: MANAGE,
    onSelect: () => setOpen(true),
  };

  return (
    <Section
      title="النطاق الجغرافي"
      description="المناطق المعلنة للمبادرة. الترشيح بمنطقة يشمل ما تحتها في التسلسل."
      actions={[add]}
    >
      <DataTable
        caption="النطاق الجغرافي"
        columns={columns}
        data={initiative.areas}
        getRowId={(area) => area.id}
        pagination={false}
        empty={{ title: "لم تُعلَن مناطق", action: add }}
        rowActions={(area) => [
          {
            key: "remove",
            label: "إزالة المنطقة",
            icon: Trash2,
            destructive: true,
            requires: MANAGE,
            onSelect: () =>
              void confirm({
                title: `إزالة «${area.areaNameAr}» من نطاق المبادرة؟`,
                description: "تُسحب المنطقة من النطاق المعلن وحده؛ المواقع فيها تبقى كما هي.",
                confirmLabel: "إزالة المنطقة",
                destructive: true,
                successMessage: "أُزيلت المنطقة.",
                onConfirm: async () => apply(await removeInitiativeArea(initiative.id, area.areaId)),
              }),
          },
        ]}
      />

      <AreaAddDialog initiative={initiative} open={open} onOpenChange={setOpen} />
    </Section>
  );
}
