"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, UserX } from "lucide-react";
import { useMemo } from "react";

import { fieldKey } from "@/components/field/group-dialog";
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
import { StatusBadge } from "@/components/ui/status-badge";
import {
  approveDeletionRequest,
  listDeletionRequests,
  rejectDeletionRequest,
  type FieldDeletionRequest,
  type FieldDeletionRequests,
} from "@/lib/api/field";
import type { InitiativeDetail } from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { countAr } from "@/lib/text/plural-ar";

const MANAGE = [CAPABILITIES.fieldManage] as const;

export const deletionRequestsKey = (initiativeId: string) =>
  ["field-deletion-requests", initiativeId] as const;

const DAYS = {
  one: "يوم حضور واحد",
  two: "يومَي حضور",
  few: "أيام حضور",
  many: "يوم حضور",
  other: "يوم حضور",
};

const INITIATIVES = {
  one: "مبادرة واحدة",
  two: "مبادرتين",
  few: "مبادرات",
  many: "مبادرة",
  other: "مبادرة",
};

const SUBMISSIONS = {
  one: "طلب استمارته",
  two: "طلبا استمارتيه",
  few: "طلبات استمارات له",
  many: "طلب استمارة له",
  other: "طلب استمارة له",
};

/** بلا عدد: الجملة عن «شهادته» لا عن كم هي. */
const certificatesOf = (count: number) =>
  count === 1 ? "شهادته" : count === 2 ? "شهادتاه" : "شهاداته";

const col = columnHelper<FieldDeletionRequest>();

/** ما يقع عند التنفيذ، بأعداد هذا الشخص: يُقرأ قبل النقر لا بعده. */
function Consequences({ request }: { request: FieldDeletionRequest }) {
  const erased = [
    "اسمه وهاتفه وبريده وملاحظاته.",
    request.submissionCount > 0
      ? `${countAr(request.submissionCount, SUBMISSIONS)}، بكل ما كُتب فيها: ما جاء منه، وما طابقه اسمًا مع هاتفه أو بريده.`
      : null,
    request.initiativeCount > 1
      ? `عضويته في مجموعات ${countAr(request.initiativeCount, INITIATIVES)}، لا في هذه وحدها.`
      : "عضويته في مجموعاته.",
    "رابطه الشخصي: لا تُفتح به بطاقته بعدها.",
    request.certificateCount > 0
      ? `${certificatesOf(request.certificateCount)}: لا يجدها من يتحقق منها.`
      : null,
    "اسمه في سجل التدقيق، ورسائل البريد التي أُرسلت إليه.",
  ].filter((line): line is string => line !== null);

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">يُمحى:</p>
        <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
          {erased.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">يبقى:</p>
        <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
          <li>
            {request.attendedDays > 0
              ? `${countAr(request.attendedDays, DAYS)} تُعدّ في أرقام الحملة، بلا اسم.`
              : "لا حضور مسجَّلًا له، فلا يبقى منه شيء في الأرقام."}
          </li>
          <li>
            صور الميدان التي قد يظهر فيها: تُراجَع وتُحذف من قسم الصور.
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * طلبات حذف البيانات: يطلبها المتطوع من تبويب «أنا» في بطاقته، وتُنفَّذ أو
 * تُرفض هنا.
 *
 * القسم يغيب ما لم يصل طلب: أغلب المبادرات لا طلب فيها، وجدول فارغ بهذا
 * العنوان يسأل المنسّق عمّا لم يحدث.
 */
export function DeletionRequestsSection({
  initiative,
}: {
  initiative: InitiativeDetail;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const key = deletionRequestsKey(initiative.id);

  const requests = useQuery({
    queryKey: key,
    queryFn: () => listDeletionRequests(initiative.id),
  });

  const apply = (next: FieldDeletionRequests) => {
    queryClient.setQueryData(key, next);
    // الحذف يُخرج صاحبه من مجموعاته ويمحو شهادته: عدّادات الميدان وقوائم
    // الأعضاء وما يُختار منه المشاركون تتبعه.
    void queryClient.invalidateQueries({ queryKey: fieldKey(initiative.id) });

    for (const key of ["field-members", "field-participants", "field-applicants"]) {
      void queryClient.invalidateQueries({ queryKey: [key, initiative.id] });
    }
  };

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("fullNameAr", {
          header: "صاحب الطلب",
          enableSorting: false,
          cell: (info) => {
            const request = info.row.original;
            const contact = [request.phone, request.email].filter(Boolean).join(" · ");

            return (
              <PrimaryCell
                label={info.getValue()}
                description={contact ? <span dir="ltr">{contact}</span> : null}
              />
            );
          },
        }),
        col.accessor((row) => row.groupNamesAr.join("، ") || undefined, {
          id: "groups",
          header: "مجموعاته هنا",
          enableSorting: false,
          cell: (info) => info.getValue() ?? <EmptyCell />,
        }),
        col.accessor("requestedAt", {
          header: "طُلب",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
        col.accessor("status", {
          header: "الحال",
          cell: (info) => (
            <StatusBadge kind="deletionRequestStatus" value={info.getValue()} />
          ),
        }),
        col.accessor((row) => row.decidedAt ?? undefined, {
          id: "decision",
          header: "القرار",
          sortUndefined: "last",
          cell: (info) => {
            const request = info.row.original;

            if (!request.decidedAt) return <EmptyCell />;

            return (
              <div className="space-y-0.5">
                {cells.dateTime(request.decidedAt)}
                {request.decidedByNameAr ? (
                  <p className="text-xs text-muted-foreground">
                    {request.decidedByNameAr}
                  </p>
                ) : null}
                {request.decisionNoteAr ? (
                  <p className="max-w-64 whitespace-pre-line text-xs text-muted-foreground">
                    {request.decisionNoteAr}
                  </p>
                ) : null}
              </div>
            );
          },
        }),
      ]),
    [],
  );

  if (!requests.data || requests.data.requests.length === 0) return null;

  const pending = requests.data.pendingCount;

  return (
    <Section
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          طلبات حذف البيانات
          {pending > 0 ? (
            <Badge tone="warning">
              ينتظر القرار: <span className="numeric">{pending}</span>
            </Badge>
          ) : null}
        </span>
      }
      description="متطوع طلب من بطاقته أن تُحذف بياناته. تحقّق أن الطلب منه، ثم نفّذه أو ارفضه بملاحظة يقرؤها."
    >
      <DataTable
        caption="طلبات حذف البيانات"
        columns={columns}
        data={requests.data.requests}
        getRowId={(row) => row.id}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => void requests.refetch()}
        pagination={{ mode: "client", pageSize: 5 }}
        // لا يُعرض: القسم يغيب حين لا طلب. الجدول يطلبه.
        empty={{ title: "لا طلبات حذف" }}
        rowActions={(row) => [
          {
            key: "approve",
            label: "نفّذ الحذف",
            icon: UserX,
            destructive: true,
            requires: MANAGE,
            hidden: row.status !== "PENDING",
            onSelect: () =>
              void confirm({
                title: `حذف بيانات «${row.fullNameAr}»؟`,
                description:
                  "الحذف على الشخص كله لا على هذه المبادرة، ولا يُتراجع عنه: لا نسخة تُحفظ قبل المحو.",
                details: <Consequences request={row} />,
                confirmLabel: "نفّذ الحذف",
                destructive: true,
                successMessage: "حُذفت بيانات المشارك.",
                onConfirm: async () =>
                  apply(await approveDeletionRequest(initiative.id, row.id)),
              }),
          },
          {
            key: "reject",
            label: "ارفض الطلب",
            icon: Ban,
            requires: MANAGE,
            hidden: row.status !== "PENDING",
            onSelect: () =>
              void confirm({
                title: `رفض طلب «${row.fullNameAr}»؟`,
                description:
                  "بياناته تبقى كما هي، وله أن يطلب مرة أخرى. ما تكتبه يقرؤه في بطاقته.",
                reason: {
                  label: "ما يقرؤه صاحب الطلب",
                  placeholder:
                    "وصل الطلب من هاتف غير هاتفك. اتصل بمنسّق الحملة لنتأكد أنه منك.",
                  minLength: 3,
                },
                confirmLabel: "ارفض الطلب",
                successMessage: "رُفض الطلب، وتصله ملاحظتك في بطاقته.",
                onConfirm: async ({ reason }) =>
                  apply(
                    await rejectDeletionRequest(initiative.id, row.id, {
                      noteAr: reason,
                    }),
                  ),
              }),
          },
        ]}
      />
    </Section>
  );
}
