"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { safeToIsoString } from "@/lib/validation/rules";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { listInitiatives } from "@/lib/api/initiatives";
import { listOffices } from "@/lib/api/invitations";
import { listPeople } from "@/lib/api/people";
import {
  OPEN_STATUSES,
  PRIORITY_LABELS,
  WORK_STATUS_LABELS,
  type WorkItemSummary,
  type WorkPriority,
  type WorkStatus,
  assignTask,
  changeTaskStatus,
  createTask,
  listTasks,
} from "@/lib/api/work";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
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

const taskFormSchema = z.object({
  titleAr: z
    .string()
    .trim()
    .min(3, "عنوان المهمة يجب ألا يقل عن 3 أحرف.")
    .max(300, "عنوان المهمة طويل جدًا."),
  scopeKind: z.enum(["OFFICE", "INITIATIVE"]),
  scopeId: z.string().trim().min(1, "يرجى اختيار جهة المهمة."),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  assigneeUserId: z.string().optional(),
  dueAt: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || !val.trim()) return true;
        return !isNaN(new Date(val).getTime());
      },
      { message: "تاريخ الاستحقاق غير صالح." },
    ),
  descriptionAr: z.string().max(4000, "الوصف طويل جدًا.").optional(),
});

/** لا مكوّن `Select` في المكتبة بعد، والصنف يتكرر في النموذج فيُسمّى مرة. */
const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Assignable = { id: string; fullNameAr: string };

/**
 * المسؤول عن المهمة: قائمة تُبدَّل في مكانها لا نافذة تُفتح — الإسناد قرار
 * من قائمة قصيرة، والنافذة تضيف خطوتين إلى نقرة واحدة.
 *
 * ومن أُسندت إليه المهمة يبقى في القائمة ولو خرج من الأعضاء النشطين، وإلا
 * ظهرت المهمة بلا مسؤول وهي مسندة، فأُسندت مرتين.
 */
function AssigneeSelect({
  task,
  people,
  pending,
  onAssign,
}: {
  task: WorkItemSummary;
  people: Assignable[];
  pending: boolean;
  onAssign: (assigneeUserId: string | null) => void;
}) {
  const options =
    task.assigneeUserId && !people.some((one) => one.id === task.assigneeUserId)
      ? [
          {
            id: task.assigneeUserId,
            fullNameAr: task.assigneeNameAr ?? "المسؤول الحالي",
          },
          ...people,
        ]
      : people;

  return (
    <select
      aria-label={`المسؤول عن «${task.titleAr}»`}
      value={task.assigneeUserId ?? ""}
      disabled={pending}
      onChange={(event) => onAssign(event.target.value || null)}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
    >
      <option value="">بلا مسؤول</option>
      {options.map((person) => (
        <option key={person.id} value={person.id}>
          {person.fullNameAr}
        </option>
      ))}
    </select>
  );
}

export default function MyTasksPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scopeKind, setScopeKind] = useState<"OFFICE" | "INITIATIVE">("OFFICE");
  const [scopeId, setScopeId] = useState("");
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});

  const canManage = can(CAPABILITIES.workManage);

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

  /** أعضاء الفريق النشطون. تحتاج `users.view`، فإن لم تصل لم تظهر قوائم الإسناد. */
  const people = useQuery({
    queryKey: ["people", "assignable"],
    queryFn: () => listPeople({ status: "ACTIVE" }),
    enabled: canManage,
  });

  const offices = useQuery({
    queryKey: ["offices"],
    queryFn: listOffices,
    enabled: creating,
  });

  const initiatives = useQuery({
    queryKey: ["initiatives", "assignable-scope"],
    queryFn: () => listInitiatives(),
    enabled: creating && scopeKind === "INITIATIVE",
  });

  const assignable = people.data ?? [];

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["claimable-tasks"] });
      setCreating(false);
      setError(null);

      // مهمة أُسندت إلى غيرك لا تظهر في أيٍّ من القائمتين، فيُقال أين ذهبت
      // بدل أن يبدو الإنشاء بلا أثر.
      setNotice(
        task.assigneeNameAr
          ? `أُنشئت «${task.titleAr}» وأُسندت إلى ${task.assigneeNameAr}.`
          : `أُنشئت «${task.titleAr}» بلا مسؤول — تنتظر في بركة جهتها.`,
      );
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError
          ? caught.message
          : "تعذّر إنشاء المهمة. حاول مجددًا.",
      ),
  });

  /**
   * الإسناد والسحب والالتقاط طفرة واحدة: المسار واحد والإبطال واحد ورسالة
   * الخطأ واحدة، و«أسندها لي» ليست إلا إسنادًا إلى نفسك.
   */
  const assign = useMutation({
    mutationFn: (input: { id: string; assigneeUserId: string | null }) =>
      assignTask(input.id, input.assigneeUserId),
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

        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDone((current) => !current)}
          >
            {showDone ? "إخفاء المنجزة" : "إظهار المنجزة"}
          </Button>

          {canManage ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                // المكتب الرئيس هو الافتراض: أكثر ما يُنشأ يدويًا عمل مكتبك.
                setScopeKind("OFFICE");
                setScopeId(primaryOffice?.officeId ?? "");
                setNotice(null);
                setCreating(true);
              }}
            >
              <Plus className="size-4" />
              مهمة جديدة
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {notice ? <Alert variant="info">{notice}</Alert> : null}

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">مهمة جديدة</CardTitle>
          </CardHeader>

          <CardContent>
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setTaskErrors({});
                const form = new FormData(event.currentTarget);
                const rawValues = {
                  scopeKind,
                  scopeId,
                  titleAr: String(form.get("titleAr") ?? ""),
                  priority: String(form.get("priority") ?? "NORMAL") as WorkPriority,
                  assigneeUserId:
                    String(form.get("assigneeUserId") ?? "") || undefined,
                  dueAt: String(form.get("dueAt") ?? "") || undefined,
                  descriptionAr:
                    String(form.get("descriptionAr") ?? "").trim() || undefined,
                };

                const parsed = taskFormSchema.safeParse(rawValues);
                if (!parsed.success) {
                  const errors: Record<string, string> = {};
                  for (const issue of parsed.error.issues) {
                    const key = String(issue.path[0] ?? "");
                    if (key && !errors[key]) {
                      errors[key] = issue.message;
                    }
                  }
                  setTaskErrors(errors);
                  return;
                }

                const { data } = parsed;
                const isoDueAt = safeToIsoString(data.dueAt);

                create.mutate({
                  ...(data.scopeKind === "OFFICE"
                    ? { officeId: data.scopeId }
                    : { initiativeId: data.scopeId }),
                  titleAr: data.titleAr,
                  priority: data.priority as WorkPriority,
                  ...(data.assigneeUserId ? { assigneeUserId: data.assigneeUserId } : {}),
                  ...(isoDueAt ? { dueAt: isoDueAt } : {}),
                  ...(data.descriptionAr ? { descriptionAr: data.descriptionAr } : {}),
                });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="scopeKind">جهة المهمة</Label>
                  <select
                    id="scopeKind"
                    value={scopeKind}
                    onChange={(event) => {
                      setScopeKind(
                        event.target.value as "OFFICE" | "INITIATIVE",
                      );
                      setScopeId("");
                    }}
                    className={SELECT_CLASS}
                  >
                    <option value="OFFICE">مكتب</option>
                    <option value="INITIATIVE">مبادرة</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="scopeId">
                    {scopeKind === "OFFICE" ? "المكتب" : "المبادرة"}
                  </Label>
                  <select
                    id="scopeId"
                    value={scopeId}
                    onChange={(event) => {
                      setScopeId(event.target.value);
                      if (taskErrors.scopeId) {
                        setTaskErrors((prev) => {
                          const next = { ...prev };
                          delete next.scopeId;
                          return next;
                        });
                      }
                    }}
                    className={SELECT_CLASS}
                  >
                    <option value="">
                      {scopeKind === "OFFICE"
                        ? "اختر المكتب…"
                        : "اختر المبادرة…"}
                    </option>
                    {scopeKind === "OFFICE"
                      ? offices.data?.map((office) => (
                          <option key={office.id} value={office.id}>
                            {office.nameAr}
                          </option>
                        ))
                      : initiatives.data?.map((initiative) => (
                          <option key={initiative.id} value={initiative.id}>
                            {initiative.nameAr}
                            {initiative.season ? ` — ${initiative.season}` : ""}
                          </option>
                        ))}
                  </select>
                  {taskErrors.scopeId ? (
                    <p className="text-xs text-destructive">{taskErrors.scopeId}</p>
                  ) : null}
                </div>
              </div>

              <Field id="titleAr" label="عنوان المهمة" error={taskErrors.titleAr}>
                {(props) => (
                  <Input
                    {...props}
                    name="titleAr"
                    required
                    minLength={3}
                    maxLength={300}
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="assigneeUserId">المسؤول</Label>
                  <select
                    id="assigneeUserId"
                    name="assigneeUserId"
                    defaultValue=""
                    className={SELECT_CLASS}
                  >
                    <option value="">بلا مسؤول — تنتظر في بركة الجهة</option>
                    {assignable.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullNameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="priority">الأولوية</Label>
                  <select
                    id="priority"
                    name="priority"
                    defaultValue="NORMAL"
                    className={SELECT_CLASS}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <Field id="dueAt" label="الموعد" hint="اختياري." error={taskErrors.dueAt}>
                  {(props) => (
                    <Input
                      {...props}
                      name="dueAt"
                      type="datetime-local"
                      dir="ltr"
                      className="text-start"
                    />
                  )}
                </Field>
              </div>

              <Field id="descriptionAr" label="التفاصيل" error={taskErrors.descriptionAr}>
                {(props) => (
                  <textarea
                    {...props}
                    name="descriptionAr"
                    rows={3}
                    maxLength={4000}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                )}
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={create.isPending}>
                  إنشاء المهمة
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(false)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

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

                      <div className="flex flex-wrap items-center gap-1.5">
                        {canManage && assignable.length > 0 ? (
                          <AssigneeSelect
                            task={task}
                            people={assignable}
                            pending={
                              assign.isPending && assign.variables?.id === task.id
                            }
                            onAssign={(assigneeUserId) =>
                              assign.mutate({ id: task.id, assigneeUserId })
                            }
                          />
                        ) : null}

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

                    <div className="flex flex-wrap items-center gap-1.5">
                      {canManage && assignable.length > 0 ? (
                        <AssigneeSelect
                          task={task}
                          people={assignable}
                          pending={
                            assign.isPending && assign.variables?.id === task.id
                          }
                          onAssign={(assigneeUserId) =>
                            assign.mutate({ id: task.id, assigneeUserId })
                          }
                        />
                      ) : null}

                      <Button
                        size="sm"
                        variant="outline"
                        loading={
                          assign.isPending && assign.variables?.id === task.id
                        }
                        onClick={() =>
                          assign.mutate({
                            id: task.id,
                            assigneeUserId: user!.id,
                          })
                        }
                      >
                        أسندها لي
                      </Button>
                    </div>
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
