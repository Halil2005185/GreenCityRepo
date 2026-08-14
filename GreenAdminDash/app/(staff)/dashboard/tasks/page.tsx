"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import {
  OPEN_STATUSES,
  PRIORITY_LABELS,
  WORK_STATUS_LABELS,
  type WorkStatus,
  assignTask,
  changeTaskStatus,
  listTasks,
} from "@/lib/api/work";
import { useAuth } from "@/lib/auth/auth-context";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_STYLES: Record<WorkStatus, string> = {
  TODO: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-primary/10 text-primary",
  BLOCKED: "bg-destructive/10 text-destructive",
  IN_REVIEW: "bg-warning/15 text-warning",
  DONE: "bg-success/15 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** الانتقالات المتاحة من كل حالة — مطابقة لرسم الخادم. */
const NEXT_STATUSES: Record<WorkStatus, readonly WorkStatus[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED", "DONE"],
  BLOCKED: ["TODO", "IN_PROGRESS"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["TODO"],
};

export default function MyTasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const tasks = useQuery({
    queryKey: ["my-tasks", showDone],
    queryFn: () =>
      listTasks({
        mine: true,
        ...(showDone ? {} : { status: OPEN_STATUSES }),
      }),
  });

  /**
   * مهام مكتبك التي لم يلتقطها أحد.
   *
   * مهام القوالب تُولَّد بمكتب متابعة بلا مُسنَد إليه، فبدون هذه القائمة
   * تبقى «مهامي» فارغة ولو كانت الحملة مخطَّطة بالكامل — الخطة موجودة
   * ولا أحد يعرف أنها تخصّه.
   */
  const primaryOffice =
    user?.memberships.find((membership) => membership.isPrimary) ??
    user?.memberships[0];

  const claimable = useQuery({
    queryKey: ["claimable-tasks", primaryOffice?.officeId],
    queryFn: () =>
      listTasks({
        unassigned: true,
        officeId: primaryOffice!.officeId,
        status: OPEN_STATUSES,
      }),
    enabled: Boolean(primaryOffice),
  });

  const claim = useMutation({
    mutationFn: (taskId: string) => assignTask(taskId, user!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["claimable-tasks"] });
      setError(null);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : "تعذّر إسناد المهمة.",
      ),
  });

  const move = useMutation({
    mutationFn: (input: {
      id: string;
      status: WorkStatus;
      blockedReasonAr?: string;
    }) => changeTaskStatus(input.id, input.status, input.blockedReasonAr),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      setError(null);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError
          ? caught.message
          : "تعذّر تحديث المهمة. حاول مجددًا.",
      ),
  });

  function onMove(id: string, status: WorkStatus) {
    if (status !== "BLOCKED") {
      move.mutate({ id, status });
      return;
    }

    // القاعدة تفرض سببًا للحجب، فيُطلب هنا بدل انتظار رفض الخادم.
    const reason = window.prompt("ما سبب تعثّر المهمة؟");

    if (reason?.trim()) {
      move.mutate({ id, status, blockedReasonAr: reason.trim() });
    }
  }

  // `isOverdue` يأتي محسوبًا من الخادم: حسابه هنا يضيف تعريفًا ثانيًا
  // للتأخّر قد ينحرف عن تعريف الخادم عند أول تغيير.
  const overdue = (tasks.data ?? []).filter((task) => task.isOverdue);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">مهامي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ما أُسند إليك، من المبادرات والمكاتب معًا.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDone((current) => !current)}
        >
          {showDone ? "إخفاء المنجزة" : "إظهار المنجزة"}
        </Button>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {overdue.length > 0 ? (
        <Alert variant="info">
          <AlertTriangle className="me-1 inline size-4" />
          {overdue.length} مهمة تجاوزت موعدها.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {tasks.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : tasks.isError ? (
            <div className="p-6">
              <Alert>تعذّر تحميل المهام.</Alert>
            </div>
          ) : tasks.data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {user?.fullNameAr ? `لا مهام مسندة إليك يا ${user.fullNameAr}.` : "لا مهام."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.data.map((task) => {
                return (
                  <li key={task.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{task.titleAr}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5",
                              STATUS_STYLES[task.status],
                            )}
                          >
                            {WORK_STATUS_LABELS[task.status]}
                          </span>
                          {task.priority !== "NORMAL" ? (
                            <span>{PRIORITY_LABELS[task.priority]}</span>
                          ) : null}
                          {task.dueAt ? (
                            <span className={cn(task.isOverdue && "text-destructive")}>
                              {formatDateTime(task.dueAt)}
                            </span>
                          ) : null}
                          {task.scope.labelAr ? <span>{task.scope.labelAr}</span> : null}
                        </p>
                        {task.blockedReasonAr ? (
                          <p className="mt-1 text-xs text-destructive">
                            سبب التعثّر: {task.blockedReasonAr}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {NEXT_STATUSES[task.status].map((next) => (
                          <Button
                            key={next}
                            size="sm"
                            variant="outline"
                            onClick={() => onMove(task.id, next)}
                          >
                            {WORK_STATUS_LABELS[next]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {claimable.data && claimable.data.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">
            مهام {primaryOffice?.officeNameAr} بلا مسؤول
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {claimable.data.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{task.titleAr}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {task.scope.labelAr ?? "—"}
                        {task.dueAt ? ` · ${formatDateTime(task.dueAt)}` : ""}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      loading={claim.isPending && claim.variables === task.id}
                      onClick={() => claim.mutate(task.id)}
                    >
                      أسندها لي
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
