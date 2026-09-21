"use client";

import {
  Ban,
  CircleCheck,
  Hand,
  OctagonAlert,
  Pencil,
  Play,
  RotateCcw,
  Send,
  UserRoundCog,
} from "lucide-react";
import { useState } from "react";

import {
  TaskAssignDialog,
  TaskEditDialog,
  useTaskInvalidation,
} from "@/components/tasks/task-dialogs";
import type { ActionDef } from "@/components/ui/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import {
  assignTask,
  changeTaskStatus,
  type WorkItemSummary,
  type WorkStatus,
} from "@/lib/api/work";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { statusLabel } from "@/lib/status";

/**
 * رسم الانتقالات كما في الخادم (`STATUS_TRANSITIONS`). نسخة للعرض وحده:
 * الخادم يرفض ما سواها، وهذه تمنع عرض زر سيُرفض.
 */
const TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "DONE", "BLOCKED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "TODO", "CANCELLED"],
  IN_REVIEW: ["DONE", "IN_PROGRESS", "CANCELLED"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["TODO"],
};

/** الخطوة الطبيعية التالية من كل حالة: تصير زر الصف السريع. */
const FORWARD: Partial<Record<WorkStatus, WorkStatus>> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "IN_REVIEW",
  BLOCKED: "IN_PROGRESS",
  IN_REVIEW: "DONE",
};

/** اسم الفعل يتبع الحالة التي يخرج منها: «بدء» من الانتظار و«استئناف» من التعثّر. */
function transitionLabel(from: WorkStatus, to: WorkStatus) {
  switch (to) {
    case "IN_PROGRESS":
      return from === "TODO"
        ? "بدء المهمة"
        : from === "BLOCKED"
          ? "استئناف المهمة"
          : from === "DONE"
            ? "إعادة فتح المهمة"
            : "إعادة إلى التنفيذ";
    case "IN_REVIEW":
      return "إرسال للاعتماد";
    case "DONE":
      return "اعتماد الإنجاز";
    case "BLOCKED":
      return "تسجيل تعثّر";
    case "TODO":
      return from === "CANCELLED" ? "استعادة المهمة" : "إعادة إلى الانتظار";
    case "CANCELLED":
      return "إلغاء المهمة";
  }
}

const ICONS: Record<WorkStatus, ActionDef["icon"]> = {
  TODO: RotateCcw,
  IN_PROGRESS: Play,
  IN_REVIEW: Send,
  DONE: CircleCheck,
  BLOCKED: OctagonAlert,
  CANCELLED: Ban,
};

/**
 * من يملك الانتقال: دخول «منجزة» والخروج منها لفريق العمليات
 * (`work.approve`)، والإلغاء لمن يدير العمل. الاستعادة من الإلغاء يقبلها
 * الخادم من الجميع؛ تُحصر هنا بمن يدير العمل لأنها تعيد مهمة إلى المتابعة.
 */
function requirement(from: WorkStatus, to: WorkStatus) {
  if (to === "DONE" || from === "DONE") return [CAPABILITIES.workApprove];
  if (to === "CANCELLED" || from === "CANCELLED") return [CAPABILITIES.workManage];

  return undefined;
}

type Target = { kind: "edit" | "assign"; task: WorkItemSummary };

/**
 * أفعال المهمة بتعريف واحد للجدول ولوحة التفاصيل. كانت أزرار الحالة كلها
 * ظاهرة في كل صف بأسماء الحالات («قيد التنفيذ»، «متعثّرة») فتُقرأ وصفًا لا
 * فعلًا، وسبب التعثّر يُطلب بـ`window.prompt`.
 */
export function useTaskActions() {
  const { user, can } = useAuth();
  const confirm = useConfirm();
  const invalidate = useTaskInvalidation();
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  const move = useApiMutation({
    mutationFn: ({ task, status }: { task: WorkItemSummary; status: WorkStatus }) =>
      changeTaskStatus(task.id, status),
    successMessage: (_, { task, status }) =>
      status === "DONE"
        ? `اعتُمد إنجاز «${task.titleAr}».`
        : `نُقلت «${task.titleAr}» إلى «${statusLabel("workStatus", status)}».`,
    errorFallback: "تعذّر تحديث المهمة.",
    onSuccess: invalidate,
  });

  const claim = useApiMutation({
    mutationFn: (task: WorkItemSummary) => assignTask(task.id, user!.id),
    successMessage: (_, task) => `صارت «${task.titleAr}» ضمن مهامك.`,
    errorFallback: "تعذّر التقاط المهمة.",
    onSuccess: invalidate,
  });

  function show(next: Target) {
    setTarget(next);
    setOpen(true);
  }

  function transition(task: WorkItemSummary, to: WorkStatus): ActionDef {
    const base = {
      key: `status-${to}`,
      label: transitionLabel(task.status, to),
      icon: ICONS[to],
      requires: requirement(task.status, to),
      quick: FORWARD[task.status] === to,
    };

    if (to === "BLOCKED") {
      return {
        ...base,
        // القاعدة تفرض سببًا للتعثّر، فيُطلب في النافذة نفسها قبل الإرسال.
        onSelect: () =>
          void confirm({
            title: `ما سبب تعثّر «${task.titleAr}»؟`,
            description: "يظهر السبب مع المهمة لكل من يتابعها حتى تُستأنف.",
            reason: { label: "سبب التعثّر", placeholder: "بانتظار وصول الشتول من المشتل…", minLength: 3 },
            confirmLabel: "تسجيل التعثّر",
            successMessage: `سُجّل تعثّر «${task.titleAr}».`,
            onConfirm: async ({ reason }) => {
              await changeTaskStatus(task.id, "BLOCKED", reason);
              invalidate();
            },
          }),
      };
    }

    if (to === "CANCELLED") {
      return {
        ...base,
        destructive: true,
        onSelect: () =>
          void confirm({
            title: `إلغاء «${task.titleAr}»؟`,
            description: "تخرج المهمة من المتابعة كلها. يمكن استعادتها لاحقًا.",
            confirmLabel: "إلغاء المهمة",
            destructive: true,
            successMessage: `أُلغيت «${task.titleAr}».`,
            onConfirm: async () => {
              await changeTaskStatus(task.id, "CANCELLED");
              invalidate();
            },
          }),
      };
    }

    return {
      ...base,
      loading: move.isPendingFor((variables) => variables.task.id === task.id && variables.status === to),
      onSelect: () => move.mutate({ task, status: to }),
    };
  }

  function actions(task: WorkItemSummary, options: { claimable?: boolean } = {}): ActionDef[] {
    const transitions = TRANSITIONS[task.status].map((to) => transition(task, to));

    return [
      {
        key: "claim",
        label: "التقاط المهمة",
        icon: Hand,
        // في «بلا مسؤول» الالتقاط هو الفعل الأول، لا نقل الحالة.
        quick: true,
        hidden: !options.claimable || !user,
        loading: claim.isPendingFor((variables) => variables.id === task.id),
        onSelect: () => claim.mutate(task),
      },
      ...transitions.map((action) => (options.claimable ? { ...action, quick: false } : action)),
      {
        key: "assign",
        label: "إسناد المهمة",
        icon: UserRoundCog,
        requires: [CAPABILITIES.workManage],
        // قائمة الأعضاء تحتاج صلاحية الاطلاع على الفريق.
        hidden: !can(CAPABILITIES.usersView),
        onSelect: () => show({ kind: "assign", task }),
      },
      {
        key: "edit",
        label: "تعديل المهمة",
        icon: Pencil,
        requires: [CAPABILITIES.workManage],
        onSelect: () => show({ kind: "edit", task }),
      },
    ];
  }

  const dialogs =
    target?.kind === "edit" ? (
      <TaskEditDialog task={target.task} open={open} onOpenChange={setOpen} />
    ) : target?.kind === "assign" ? (
      <TaskAssignDialog task={target.task} open={open} onOpenChange={setOpen} />
    ) : null;

  return { actions, dialogs };
}
