"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, MessageSquare, Plus } from "lucide-react";
import { useMemo } from "react";

import { TaskCreateDialog } from "@/components/tasks/task-dialogs";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { useTaskActions } from "@/components/tasks/use-task-actions";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, Toolbar, type ChipOption } from "@/components/ui/toolbar";
import { UrlTabs } from "@/components/ui/url-tabs";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/types.gen";
import { OPEN_STATUSES, listTasks, type WorkItemSummary, type WorkStatus } from "@/lib/api/work";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { cn, formatDateTime } from "@/lib/utils";

type Summary = components["schemas"]["DashboardSummary"];
type ListKind = "mine" | "claimable" | "office";

/**
 * «العرض» مرشّح واحد بدل زر «إظهار المنجزة»: الرئيسية تفتح منه على
 * المتأخرة والمتعثّرة وما ينتظر الاعتماد، والرابط يحفظه.
 */
const VIEWS: Record<string, { label: string; status?: readonly WorkStatus[]; overdue?: boolean }> = {
  open: { label: "المفتوحة", status: OPEN_STATUSES },
  overdue: { label: "المتأخرة", status: OPEN_STATUSES, overdue: true },
  blocked: { label: "المتعثّرة", status: ["BLOCKED"] },
  review: { label: "بانتظار الاعتماد", status: ["IN_REVIEW"] },
  done: { label: "المنجزة", status: ["DONE"] },
  all: { label: "الكل" },
};

const VIEW_OPTIONS: ChipOption[] = Object.entries(VIEWS).map(([value, view]) => ({
  value,
  label: view.label,
}));

/** ما لا مسؤول عنه مفتوح بطبيعته: المنجز والملغى لا يُلتقط. */
const CLAIMABLE_VIEWS = VIEW_OPTIONS.filter((option) => option.value === "open" || option.value === "overdue");

const col = columnHelper<WorkItemSummary>();

function TaskList({
  kind,
  officeId,
  view,
  onView,
  onOpenTask,
}: {
  kind: ListKind;
  officeId: string | undefined;
  view: string;
  onView: (view: string) => void;
  onOpenTask: (task: WorkItemSummary) => void;
}) {
  const taskActions = useTaskActions();
  const current = VIEWS[kind === "claimable" && !["open", "overdue"].includes(view) ? "open" : view] ?? VIEWS.open;

  const tasks = useQuery({
    queryKey: ["work", "tasks", { kind, officeId, view }],
    queryFn: () =>
      listTasks({
        ...(kind === "mine" ? { mine: true } : { officeId }),
        ...(kind === "claimable" ? { unassigned: true } : {}),
        ...(current.status ? { status: current.status } : {}),
        ...(current.overdue ? { overdue: true } : {}),
      }),
    enabled: kind === "mine" || Boolean(officeId),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("titleAr", {
          header: "المهمة",
          cell: (info) => {
            const task = info.row.original;

            return (
              <PrimaryCell
                label={info.getValue()}
                onClick={() => onOpenTask(task)}
                description={
                  task.status === "BLOCKED" && task.blockedReasonAr ? (
                    <span className="text-destructive">سبب التعثّر: {task.blockedReasonAr}</span>
                  ) : (
                    [task.scope.labelAr, task.milestoneTitleAr].filter(Boolean).join(" · ") || null
                  )
                }
                badge={
                  task.commentCount > 0 ? (
                    <Badge tone="neutral" title="تعليقات">
                      <MessageSquare className="size-3" aria-hidden />
                      <span className="numeric">{task.commentCount}</span>
                      <span className="sr-only"> تعليقات</span>
                    </Badge>
                  ) : null
                }
              />
            );
          },
        }),
        col.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <StatusBadge kind="workStatus" value={info.getValue()} />,
        }),
        col.accessor("priority", {
          header: "الأولوية",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="workPriority" value={info.getValue()} />,
        }),
        ...(kind === "mine"
          ? []
          : [
              col.accessor((task) => task.assigneeNameAr ?? undefined, {
                id: "assignee",
                header: "المسؤول",
                sortUndefined: "last",
                cell: (info) => info.getValue() ?? <span className="text-muted-foreground">بلا مسؤول</span>,
              }),
            ]),
        col.accessor((task) => task.dueAt ?? undefined, {
          id: "dueAt",
          header: "الموعد",
          sortUndefined: "last",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const value = info.getValue();

            // التأخّر محسوب في الخادم: تعريف ثانٍ هنا قد ينحرف عنه.
            return value ? (
              <span className={cn(info.row.original.isOverdue && "font-medium text-destructive")}>
                {formatDateTime(value)}
              </span>
            ) : (
              <EmptyCell />
            );
          },
        }),
      ]),
    [kind, onOpenTask],
  );

  const empty =
    kind === "mine"
      ? { title: "لا مهام مسندة إليك هنا", description: "المهام التي تُسند إليك أو تلتقطها من بركة مكتبك تظهر هنا." }
      : kind === "claimable"
        ? { title: "لا مهام تنتظر من يلتقطها", description: "كل مهام المكتب المفتوحة لها مسؤول." }
        : { title: "لا مهام للمكتب في هذا العرض" };

  return (
    <div className="space-y-3">
      <Toolbar mobile="inline">
        <FilterChips
          label="العرض"
          value={kind === "claimable" && !["open", "overdue"].includes(view) ? "open" : view}
          onChange={onView}
          options={kind === "claimable" ? CLAIMABLE_VIEWS : VIEW_OPTIONS}
        />
      </Toolbar>
      <DataTable
        caption={kind === "mine" ? "مهامي" : kind === "claimable" ? "مهام بلا مسؤول" : "مهام المكتب"}
        columns={columns}
        data={tasks.data}
        getRowId={(task) => task.id}
        isLoading={tasks.isPending && tasks.fetchStatus !== "idle"}
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
        urlState
        filtered={view !== "open"}
        onClearFilters={() => onView("open")}
        empty={empty}
        onRowClick={onOpenTask}
        rowActions={(task) => [
          ...taskActions.actions(task, { claimable: kind === "claimable" }),
          { key: "details", label: "عرض التفاصيل", icon: Eye, onSelect: () => onOpenTask(task) },
        ]}
      />
      {taskActions.dialogs}
    </div>
  );
}

export default function TasksPage() {
  const { user, can } = useAuth();
  const [state, setState] = useUrlState({ view: "open", office: "", new: "", task: "" });
  const sheetActions = useTaskActions();

  const memberships = user?.memberships ?? [];
  const primary = memberships.find((membership) => membership.isPrimary) ?? memberships[0];
  const office = memberships.find((membership) => membership.officeId === state.office) ?? primary;

  // الأعداد على التبويبات من ملخص الرئيسية: طلب واحد بدل ثلاث قوائم كاملة.
  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<Summary>("/admin/dashboard"),
  });

  // أعداد المكتب في الملخص تخصّ المكتب الرئيس وحده.
  const officeCounts = office && summary.data?.officeId === office.officeId ? summary.data.officeTasks : undefined;

  const openTask = (task: WorkItemSummary) => setState({ task: task.id }, { keepPage: true });
  const setView = (view: string) => setState({ view });

  const create = {
    key: "create",
    label: "إنشاء مهمة",
    icon: Plus,
    requires: [CAPABILITIES.workManage],
    onSelect: () => setState({ new: "1" }, { keepPage: true }),
  };

  const list = (kind: ListKind) => (
    <TaskList
      kind={kind}
      officeId={office?.officeId}
      view={state.view}
      onView={setView}
      onOpenTask={openTask}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="المهام"
        description="ما أُسند إليك، وما ينتظر في بركة مكتبك من يلتقطه، ومهام المكتب كلها."
        primaryAction={create}
      />

      {/* عضو في أكثر من مكتب يختار أيها يتابع؛ الافتراض مكتبه الرئيس. */}
      {memberships.length > 1 ? (
        <Select
          size="sm"
          label="المكتب"
          className="w-64"
          options={memberships.map((membership) => ({
            value: membership.officeId,
            label: membership.officeNameAr,
            description: membership.roleNameAr,
          }))}
          value={office?.officeId ?? null}
          onChange={(officeId) => setState({ office: officeId ?? "" })}
        />
      ) : null}

      <UrlTabs
        label="قوائم المهام"
        tabs={[
          { value: "mine", label: "مهامي", count: summary.data?.myTasks.open, content: list("mine") },
          {
            value: "claimable",
            label: "بلا مسؤول",
            count: officeCounts?.unassigned,
            hidden: !office,
            content: list("claimable"),
          },
          {
            value: "office",
            label: office ? `مهام ${office.officeNameAr}` : "مهام المكتب",
            count: officeCounts?.open,
            hidden: !office,
            content: list("office"),
          },
        ]}
      />

      <TaskSheet
        taskId={state.task || null}
        onClose={() => setState({ task: null }, { keepPage: true })}
        actionsFor={(task) => sheetActions.actions(task)}
      />
      {sheetActions.dialogs}

      {can(CAPABILITIES.workManage) ? (
        <TaskCreateDialog
          defaultOfficeId={primary?.officeId}
          open={state.new === "1"}
          onOpenChange={(open) => setState({ new: open ? "1" : null }, { keepPage: true })}
        />
      ) : null}
    </div>
  );
}
