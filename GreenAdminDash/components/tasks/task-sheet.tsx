"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTaskInvalidation } from "@/components/tasks/task-dialogs";
import {
  ActionButton,
  ActionMenu,
  type ActionDef,
  useVisibleActions,
} from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DescriptionList } from "@/components/ui/description-list";
import { CheckboxField, TextareaField } from "@/components/ui/form-fields";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { addTaskComment, getTask, type WorkItemDetail } from "@/lib/api/work";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDate, formatDateTime } from "@/lib/utils";

const commentSchema = z.object({
  bodyAr: z.string().trim().min(1, "اكتب التعليق.").max(4000, "التعليق طويل جدًا."),
  visibleToPartner: z.boolean(),
});

type CommentValues = z.infer<typeof commentSchema>;

/**
 * التعليقات قائمة في الـAPI منذ البداية (`commentCount` في كل صف) ولم تكن
 * لها واجهة. الكتابة حق كل من يرى المهمة؛ الإظهار للجهة الشريكة لمن يدير
 * العمل وحده، ولا معنى له إلا حين تكون للمهمة جهة شريكة.
 */
function Comments({ task }: { task: WorkItemDetail }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = useTaskInvalidation();
  const form = useForm<CommentValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: { bodyAr: "", visibleToPartner: false },
  });
  const partnerInvolved = Boolean(task.assignedPartnerId) || task.scope.kind === "PARTNER";
  const canShare = can(CAPABILITIES.workManage) && partnerInvolved;

  const add = useApiMutation({
    mutationFn: (values: CommentValues) =>
      addTaskComment(task.id, {
        bodyAr: values.bodyAr,
        isInternal: !(canShare && values.visibleToPartner),
      }),
    successMessage: "أُضيف التعليق.",
    errorFallback: "تعذّر إضافة التعليق.",
    onSuccess: (detail) => {
      queryClient.setQueryData(["work", "task", task.id], detail);
      invalidate();
      form.reset({ bodyAr: "", visibleToPartner: false });
    },
  });

  return (
    <section aria-labelledby="task-comments" className="space-y-3">
      <h3 id="task-comments" className="text-sm font-semibold">
        التعليقات
      </h3>

      {task.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا تعليقات بعد.</p>
      ) : (
        <ol className="space-y-3">
          {task.comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.authorNameAr}</span>
                {comment.isPartnerAuthor ? <Badge tone="info">من الجهة الشريكة</Badge> : null}
                {comment.isInternal ? null : <Badge tone="accent">ظاهر للجهة</Badge>}
                <span className="ms-auto">{formatDateTime(comment.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap">{comment.bodyAr}</p>
            </li>
          ))}
        </ol>
      )}

      <form
        noValidate
        className="space-y-3"
        onSubmit={form.handleSubmit((values) => add.mutate(values))}
      >
        <TextareaField control={form.control} name="bodyAr" label="تعليق جديد" rows={3} />
        {canShare ? (
          <CheckboxField
            control={form.control}
            name="visibleToPartner"
            label="إظهاره للجهة الشريكة"
            hint="التعليقات داخلية ما لم يُختر هذا."
          />
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" variant="outline" size="sm" loading={add.isPending}>
            إضافة التعليق
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * تفاصيل المهمة في لوحة من جهة النهاية: الصف لا يتسع للوصف وسبب التعثّر
 * والتعليقات، والانتقال إلى صفحة يُفقد مكان القائمة. تُفتح من `?task=`
 * فتُنسخ وتُشارك.
 */
export function TaskSheet({
  taskId,
  onClose,
  actionsFor,
}: {
  taskId: string | null;
  onClose: () => void;
  actionsFor: (task: WorkItemDetail) => ActionDef[];
}) {
  const visible = useVisibleActions();
  const task = useQuery({
    queryKey: ["work", "task", taskId],
    queryFn: () => getTask(taskId!),
    enabled: Boolean(taskId),
  });

  const data = task.data;
  const actions = data ? visible(actionsFor(data)) : [];
  const primary = actions.find((action) => action.quick);
  const rest = actions.filter((action) => action !== primary);

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="end" width="md">
        <SheetHeader>
          <SheetTitle>{data?.titleAr ?? "المهمة"}</SheetTitle>
          <SheetDescription>{data?.scope.labelAr ?? " "}</SheetDescription>
          {data ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <StatusBadge kind="workStatus" value={data.status} />
              <StatusBadge kind="workPriority" value={data.priority} />
              {data.isOverdue ? <Badge tone="danger">متأخرة</Badge> : null}
            </div>
          ) : null}
        </SheetHeader>

        <SheetBody className="space-y-5">
          {task.isPending ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-full max-w-64" />
              <Skeleton className="h-4 w-full max-w-48" />
            </div>
          ) : task.isError ? (
            <ErrorState title="تعذّر تحميل المهمة." error={task.error} onRetry={() => void task.refetch()} />
          ) : data ? (
            <>
              <DescriptionList
                items={[
                  { label: "المسؤول", value: data.assigneeNameAr ?? "بلا مسؤول" },
                  { label: "الموعد", value: data.dueAt ? formatDateTime(data.dueAt) : null },
                  { label: "المرحلة", value: data.milestoneTitleAr, hidden: !data.milestoneTitleAr },
                  { label: "الجهة الشريكة", value: data.assignedPartnerNameAr, hidden: !data.assignedPartnerNameAr },
                  { label: "مكتب المتابعة", value: data.followUpOfficeNameAr, hidden: !data.followUpOfficeNameAr },
                  { label: "بدأت", value: data.startedAt ? formatDate(data.startedAt) : null, hidden: !data.startedAt },
                  {
                    label: "أُنجزت",
                    value: data.completedAt ? formatDate(data.completedAt) : null,
                    hidden: !data.completedAt,
                  },
                  {
                    label: "سبب التعثّر",
                    wide: true,
                    hidden: data.status !== "BLOCKED" || !data.blockedReasonAr,
                    value: <span className="text-destructive">{data.blockedReasonAr}</span>,
                  },
                  {
                    label: "التفاصيل",
                    wide: true,
                    value: data.descriptionAr ? (
                      <span className="whitespace-pre-wrap font-normal">{data.descriptionAr}</span>
                    ) : null,
                  },
                ]}
              />
              <Comments task={data} />
            </>
          ) : null}
        </SheetBody>

        {primary || rest.length > 0 ? (
          <SheetFooter>
            <ActionMenu actions={rest} />
            {primary ? <ActionButton action={primary} variant="default" /> : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
