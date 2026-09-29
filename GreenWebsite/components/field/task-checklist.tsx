"use client";

import {
  Check,
  ClipboardList,
  MessageSquarePlus,
  OctagonAlert,
  Play,
} from "lucide-react";
import { useId, useState } from "react";

import { TEXTAREA_CLASS } from "@/components/field/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FieldTask } from "@/lib/field/api";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  formatDay,
} from "@/lib/field/labels";
import { cn } from "@/lib/utils";

type Move = "IN_PROGRESS" | "BLOCKED" | "DONE";

export type TaskActions = {
  move: (
    task: FieldTask,
    status: Move,
    blockedReasonAr?: string,
  ) => Promise<boolean>;
  note: (task: FieldTask, bodyAr: string) => Promise<boolean>;
};

/**
 * ما يُعرض من أفعال بحسب حال المهمة — كما يسمح رسم الانتقالات في الخادم.
 *
 * «أُنجزت» متاحة لمهمة لم تبدأ: في الميدان تُنجز المهمة قبل أن ينقر أحد
 * «بدأت»، والخادم يمشي الخطوتين. ومن لا يعتمد الإنجاز يرسلها للاعتماد،
 * فالزر يقول ما سيقع فعلًا.
 */
function movesFor(task: FieldTask, canApprove: boolean) {
  const done = {
    status: "DONE" as const,
    label: canApprove ? "أُنجزت" : "أُنجزت — للاعتماد",
    icon: Check,
  };
  const start = { status: "IN_PROGRESS" as const, label: "بدأت", icon: Play };
  const resume = { status: "IN_PROGRESS" as const, label: "استؤنفت", icon: Play };

  switch (task.status) {
    case "TODO":
      return { primary: [done, start], canBlock: true };

    case "IN_PROGRESS":
      return { primary: [done], canBlock: true };

    case "BLOCKED":
      return { primary: [resume], canBlock: false };

    case "IN_REVIEW":
      return {
        primary: canApprove ? [{ ...done, label: "اعتمد الإنجاز" }] : [],
        canBlock: false,
      };

    default:
      return { primary: [], canBlock: false };
  }
}

export function TaskChecklist({
  tasks,
  canApprove,
  writable,
  actions,
}: {
  tasks: readonly FieldTask[];
  canApprove: boolean;
  writable: boolean;
  actions: TaskActions;
}) {
  if (tasks.length === 0) {
    return (
      // سطران لا بطاقة داخل بطاقة: الفراغ هنا معلومة عابرة لا حالة صفحة.
      <div className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
        <ClipboardList
          className="mt-0.5 size-5 shrink-0 text-accent-ink"
          aria-hidden
        />
        <p>
          لا مهام على هذا الموقع بعد. ما يضيفه المنسّق للموقع، أو يسنده إليك من
          مهام الحملة، يظهر هنا.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          canApprove={canApprove}
          writable={writable}
          actions={actions}
        />
      ))}
    </ul>
  );
}

function TaskRow({
  task,
  canApprove,
  writable,
  actions,
}: {
  task: FieldTask;
  canApprove: boolean;
  writable: boolean;
  actions: TaskActions;
}) {
  const id = useId();
  const [form, setForm] = useState<"block" | "note" | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const { primary, canBlock } = movesFor(task, canApprove);
  const body = text.trim();
  // العائق يلزمه سبب يُفهم، والملاحظة يكفيها حرف.
  const valid = form === "block" ? body.length >= 3 : body.length >= 1;

  function open(next: "block" | "note") {
    setText("");
    setForm((current) => (current === next ? null : next));
  }

  async function run(action: () => Promise<boolean>) {
    setSaving(true);

    try {
      if (await action()) {
        setForm(null);
        setText("");
      }
    } finally {
      setSaving(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!valid) return;

    void run(() =>
      form === "block"
        ? actions.move(task, "BLOCKED", body)
        : actions.note(task, body),
    );
  }

  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-sm font-semibold leading-relaxed text-foreground",
            task.status === "DONE" && "line-through decoration-muted-foreground",
          )}
        >
          {task.titleAr}
        </p>
        <Badge tone={TASK_STATUS_TONES[task.status]} className="shrink-0">
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      </div>

      {task.descriptionAr ? (
        <p className="text-sm leading-relaxed text-foreground">
          {task.descriptionAr}
        </p>
      ) : null}

      {task.status === "BLOCKED" && task.blockedReasonAr ? (
        <p className="text-sm leading-relaxed text-warning">
          سبب التعثّر: {task.blockedReasonAr}
        </p>
      ) : null}

      {task.dueAt || task.scope === "INITIATIVE" || task.commentCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {[
            task.scope === "INITIATIVE" ? "من مهام الحملة" : null,
            task.dueAt
              ? `${task.isOverdue ? "تأخرت عن" : "حتى"} ${formatDay(task.dueAt)}`
              : null,
            task.commentCount > 0 ? `ملاحظات: ${task.commentCount}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {writable ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {primary.map((move, index) => (
            <Button
              key={move.label}
              size="sm"
              variant={index === 0 ? "default" : "secondary"}
              disabled={saving}
              onClick={() => void run(() => actions.move(task, move.status))}
            >
              <move.icon aria-hidden />
              {move.label}
            </Button>
          ))}

          {canBlock ? (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={form === "block"}
              onClick={() => open("block")}
            >
              <OctagonAlert aria-hidden />
              عائق
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="ghost"
            aria-expanded={form === "note"}
            onClick={() => open("note")}
          >
            <MessageSquarePlus aria-hidden />
            ملاحظة
          </Button>
        </div>
      ) : null}

      {writable && form ? (
        <form onSubmit={submit} className="space-y-3 rounded-lg bg-surface p-3">
          <label
            htmlFor={`${id}-text`}
            className="block text-sm font-semibold text-foreground"
          >
            {form === "block" ? "ما الذي يعيق المهمة؟" : "ملاحظة للمنسّق"}
          </label>
          <textarea
            id={`${id}-text`}
            required
            maxLength={form === "block" ? 1000 : 4000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              form === "block"
                ? "مثال: لم تصل الشتلات، والصهريج متأخر ساعة."
                : undefined
            }
            className={TEXTAREA_CLASS}
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={saving || !valid}>
              {saving
                ? "…جارٍ الحفظ"
                : form === "block"
                  ? "سجّل العائق"
                  : "أضف الملاحظة"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              إلغاء
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
