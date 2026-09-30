"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, RotateCcw, ScanSearch, Undo2 } from "lucide-react";

import {
  ActionButton,
  ActionMenu,
  type ActionDef,
  useVisibleActions,
} from "@/components/ui/actions";
import { Alert } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
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
import {
  REDACTED_SUBMISSION_LABEL,
  getSubmission,
  setSubmissionStatus,
  type SubmissionStatus,
  type SubmissionSummary,
} from "@/lib/api/forms";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { statusLabel } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";

/**
 * الفرز داخلي لا يراسل المتقدّم، فكل انتقال يُعاد ولا يحتاج تأكيدًا. الزر
 * الأول هو الخطوة الطبيعية: «بدء المراجعة» للجديد و«قبول الطلب» لما يُراجَع.
 */
const NEXT: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  NEW: ["IN_REVIEW", "ACCEPTED", "REJECTED"],
  IN_REVIEW: ["ACCEPTED", "REJECTED", "NEW"],
  ACCEPTED: ["IN_REVIEW", "REJECTED"],
  REJECTED: ["IN_REVIEW", "ACCEPTED"],
};

const FORWARD: Partial<Record<SubmissionStatus, SubmissionStatus>> = {
  NEW: "IN_REVIEW",
  IN_REVIEW: "ACCEPTED",
};

function transitionLabel(from: SubmissionStatus, to: SubmissionStatus) {
  if (to === "IN_REVIEW") return from === "NEW" ? "بدء المراجعة" : "إعادة إلى المراجعة";
  if (to === "ACCEPTED") return "قبول الطلب";
  if (to === "REJECTED") return "رفض الطلب";

  return "إعادة إلى «جديد»";
}

const ICONS: Record<SubmissionStatus, ActionDef["icon"]> = {
  NEW: Undo2,
  IN_REVIEW: ScanSearch,
  ACCEPTED: CircleCheck,
  REJECTED: CircleX,
};

/** أفعال الحالة بتعريف واحد لصف الجدول ولوحة الطلب. */
export function useSubmissionActions(formId: string) {
  const queryClient = useQueryClient();

  const move = useApiMutation({
    mutationFn: ({ submission, status }: { submission: SubmissionSummary; status: SubmissionStatus }) =>
      setSubmissionStatus(formId, submission.id, status),
    successMessage: (_, { status }) => `نُقل الطلب إلى «${statusLabel("submissionStatus", status)}».`,
    errorFallback: "تعذّر تحديث حالة الطلب.",
    onSuccess: (detail) => {
      queryClient.setQueryData(["submission", formId, detail.id], detail);
      void queryClient.invalidateQueries({ queryKey: ["submissions", formId] });
    },
  });

  return (submission: SubmissionSummary): ActionDef[] =>
    NEXT[submission.status].map((to) => ({
      key: `status-${to}`,
      label: transitionLabel(submission.status, to),
      icon: to === "IN_REVIEW" && submission.status !== "NEW" ? RotateCcw : ICONS[to],
      quick: FORWARD[submission.status] === to,
      requires: [CAPABILITIES.formsManage],
      loading: move.isPendingFor(
        (variables) => variables.submission.id === submission.id && variables.status === to,
      ),
      onSelect: () => move.mutate({ submission, status: to }),
    }));
}

/**
 * الطلب في لوحة من جهة النهاية بدل عمود ثالث يضيّق القائمة: الإجابات
 * بأسئلة الإصدار الذي أُرسل معه لا بأسئلة المسوّدة الحالية — الخادم يبنيها
 * كذلك. تُفتح من `?submission=` فتُشارك.
 */
export function SubmissionSheet({
  formId,
  submissionId,
  onClose,
  actionsFor,
}: {
  formId: string;
  submissionId: string | null;
  onClose: () => void;
  actionsFor: (submission: SubmissionSummary) => ActionDef[];
}) {
  const visible = useVisibleActions();
  const detail = useQuery({
    queryKey: ["submission", formId, submissionId],
    queryFn: () => getSubmission(formId, submissionId!),
    enabled: Boolean(submissionId),
  });

  const data = detail.data;
  const actions = data ? visible(actionsFor(data)) : [];
  const primary = actions.find((action) => action.quick);
  const rest = actions.filter((action) => action !== primary);

  return (
    <Sheet open={Boolean(submissionId)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="end" width="md">
        <SheetHeader>
          <SheetTitle>
            {data?.redactedAt
              ? REDACTED_SUBMISSION_LABEL
              : (data?.applicantNameAr ?? "الطلب")}
          </SheetTitle>
          <SheetDescription>
            {data ? `الإصدار ${data.formVersion} · ${formatDateTime(data.submittedAt)}` : " "}
          </SheetDescription>
          {data ? (
            <div className="pt-1">
              <StatusBadge kind="submissionStatus" value={data.status} />
            </div>
          ) : null}
        </SheetHeader>

        <SheetBody className="space-y-5">
          {detail.isPending ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-4 w-full max-w-48" />
              <Skeleton className="h-4 w-full max-w-72" />
              <Skeleton className="h-4 w-full max-w-56" />
            </div>
          ) : detail.isError ? (
            <ErrorState title="تعذّر تحميل الطلب." error={detail.error} onRetry={() => void detail.refetch()} />
          ) : data ? (
            <>
              {data.applicantEmail || data.applicantPhone ? (
                <DescriptionList
                  items={[
                    {
                      label: "البريد",
                      hidden: !data.applicantEmail,
                      value: (
                        <a href={`mailto:${data.applicantEmail}`} dir="ltr" className="text-primary hover:underline">
                          {data.applicantEmail}
                        </a>
                      ),
                    },
                    {
                      label: "الهاتف",
                      hidden: !data.applicantPhone,
                      value: (
                        <a href={`tel:${data.applicantPhone}`} dir="ltr" className="numeric text-primary hover:underline">
                          {data.applicantPhone}
                        </a>
                      ),
                    },
                  ]}
                />
              ) : null}

              <section aria-labelledby="submission-answers" className="space-y-3">
                <h3 id="submission-answers" className="text-sm font-semibold">
                  الإجابات
                </h3>
                {data.redactedAt ? (
                  <Alert variant="info">
                    مُحيت إجابات هذا الطلب واسم صاحبه في{" "}
                    {formatDateTime(data.redactedAt)}، بطلبه حذفَ بياناته. الطلب
                    يبقى في عدد الطلبات بحاله.
                  </Alert>
                ) : (data.answers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا إجابات مسجّلة.</p>
                ) : (
                  <dl className="divide-y divide-border rounded-xl border border-border bg-card">
                    {(data.answers ?? []).map((answer, index) => (
                      <div key={index} className="space-y-1 px-4 py-3">
                        <dt className="text-xs text-muted-foreground">{answer.labelAr}</dt>
                        <dd className="whitespace-pre-wrap text-sm">{answer.valueAr}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
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
