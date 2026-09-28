"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Pencil, UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AddMembershipDialog } from "@/components/people/add-membership-dialog";
import { EditMembershipDialog } from "@/components/people/edit-membership-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DetailSkeleton, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { ApiError } from "@/lib/api/client";
import {
  endMembership,
  getPerson,
  primaryMembership,
  type TeamMembership,
} from "@/lib/api/people";
import { OPEN_STATUSES, listTasks, type WorkItemSummary } from "@/lib/api/work";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const BREADCRUMB_ROOT = { label: "دليل الفريق", href: "/dashboard/people" };

const membershipCol = columnHelper<TeamMembership>();
const taskCol = columnHelper<WorkItemSummary>();

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { canAny } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [editingMembership, setEditingMembership] = useState<TeamMembership | null>(null);

  const canManageRoles = canAny(CAPABILITIES.rolesManage);

  const member = useQuery({
    queryKey: ["people", id],
    queryFn: () => getPerson(id),
  });

  /**
   * المهام تُقرأ من مسار العمل نفسه بمرشّح المُسنَد إليه، لا من مسار
   * جديد في وحدة الفريق. تكرار الاستعلام يعني تعريفين لـ«مهمة مفتوحة»
   * ينحرف أحدهما عن الآخر أول مرة تتغير الحالات.
   */
  const tasks = useQuery({
    queryKey: ["work", "tasks", { assigneeUserId: id, open: true }],
    queryFn: () => listTasks({ assigneeUserId: id, status: OPEN_STATUSES }),
    enabled: Boolean(member.data),
  });

  const membershipColumns = useMemo(
    () =>
      membershipCol.columns([
        membershipCol.accessor("officeNameAr", {
          header: "المكتب",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              // «رئيسي» للعضوية النشطة وحدها: المنتهية لا تحدد شيئًا اليوم.
              badge={
                info.row.original.isPrimary && info.row.original.status === "ACTIVE" ? (
                  <Badge tone="primary">رئيسي</Badge>
                ) : null
              }
            />
          ),
        }),
        membershipCol.accessor("roleNameAr", { header: "الدور" }),
        membershipCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="membershipStatus" value={info.getValue()} />,
        }),
        membershipCol.accessor("startedAt", {
          header: "من",
          cell: (info) => cells.date(info.getValue()),
        }),
        membershipCol.accessor((membership) => membership.endedAt ?? undefined, {
          id: "endedAt",
          header: "إلى",
          sortUndefined: "last",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  /** نسخة مختصرة للإدارة: نشطة وحدها، فلا حاجة لعمودَي الحالة والانتهاء. */
  const manageMembershipColumns = useMemo(
    () =>
      membershipCol.columns([
        membershipCol.accessor("officeNameAr", {
          header: "المكتب",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              badge={info.row.original.isPrimary ? <Badge tone="primary">رئيسي</Badge> : null}
            />
          ),
        }),
        membershipCol.accessor("roleNameAr", { header: "الدور" }),
        membershipCol.accessor("startedAt", {
          header: "منذ",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const taskColumns = useMemo(
    () =>
      taskCol.columns([
        taskCol.accessor("titleAr", {
          header: "المهمة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/tasks?task=${info.row.original.id}`}
              description={info.row.original.scope.labelAr}
            />
          ),
        }),
        taskCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="workStatus" value={info.getValue()} />,
        }),
        taskCol.accessor((task) => task.dueAt ?? undefined, {
          id: "dueAt",
          header: "الموعد",
          sortUndefined: "last",
          meta: { className: "whitespace-nowrap" },
          cell: (info) =>
            info.getValue() ? (
              <span className={cn(info.row.original.isOverdue && "font-medium text-destructive")}>
                {formatDateTime(info.getValue()!)}
              </span>
            ) : (
              <EmptyCell />
            ),
        }),
      ]),
    [],
  );

  if (member.isPending) return <DetailSkeleton />;

  if (member.isError) {
    const notFound = member.error instanceof ApiError && member.error.status === 404;

    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[BREADCRUMB_ROOT]} title="ملف العضو" />
        <div className="rounded-xl border border-border bg-card">
          <ErrorState
            title={notFound ? "لا يوجد عضو بهذا الرابط." : "تعذّر تحميل ملف العضو."}
            error={notFound ? undefined : member.error}
            onRetry={notFound ? undefined : () => void member.refetch()}
          />
        </div>
      </div>
    );
  }

  const person = member.data;
  const primary = primaryMembership(person);
  const hasActive = person.memberships.some((membership) => membership.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[BREADCRUMB_ROOT, { label: person.fullNameAr }]}
        title={person.fullNameAr}
        description={<span dir="ltr">{person.email}</span>}
        badges={<StatusBadge kind="userStatus" value={person.status} />}
      />

      {hasActive ? null : (
        <Alert variant="warning" className="px-4 py-3">
          لا عضوية نشطة: الحساب قائم لكنه بلا مكتب ولا دور، فلا يرى شيئًا في اللوحة.
        </Alert>
      )}

      <DescriptionList
        items={[
          { label: "المكتب الرئيس", value: primary?.officeNameAr },
          { label: "الدور", value: primary?.roleNameAr },
          {
            label: "البريد موثَّق",
            value: person.emailVerifiedAt ? formatDate(person.emailVerifiedAt) : "لا",
          },
          { label: "في الفريق منذ", value: formatDate(person.createdAt) },
        ]}
      />

      <Section title="العضويات" description="المكاتب والأدوار، الحالية والسابقة.">
        <DataTable
          caption="العضويات"
          columns={membershipColumns}
          data={[...person.memberships].sort(
            // النشطة أولًا ثم الأحدث: ما يحدد صلاحياته اليوم قبل تاريخه.
            (a, b) =>
              Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
              b.startedAt.localeCompare(a.startedAt),
          )}
          getRowId={(membership) => membership.id}
          pagination={false}
          empty={{ title: "لا عضويات" }}
        />
      </Section>

      {/*
       * قسم منفصل عن «العضويات» أعلاه لا زر إضافي فيه: الأول للجميع
       * وللقراءة وحدها، وهذا لا يُركَّب أصلًا لمن لا يحمل `roles.manage`
       * — لا يظهر فارغًا ولا معطَّلًا، بل يغيب كليًا.
       */}
      {canManageRoles ? (
        <Section
          title="إدارة صلاحيات العضو"
          description="إضافة عضوية أو تعديل مكتبها ودورها أو إنهاؤها. يظهر لمن يحمل roles.manage وحده."
          actions={[
            {
              key: "add-membership",
              label: "إضافة عضوية",
              icon: UserPlus,
              onSelect: () => setAddMembershipOpen(true),
            },
          ]}
        >
          <DataTable
            caption="إدارة العضويات"
            columns={manageMembershipColumns}
            data={person.memberships.filter((membership) => membership.status === "ACTIVE")}
            getRowId={(membership) => membership.id}
            pagination={false}
            empty={{ title: "لا عضويات نشطة" }}
            rowActions={(membership) => [
              {
                key: "edit",
                label: "تعديل",
                icon: Pencil,
                quick: true,
                onSelect: () => setEditingMembership(membership),
              },
              {
                key: "end",
                label: "إنهاء العضوية",
                icon: Ban,
                destructive: true,
                onSelect: () =>
                  void confirm({
                    title: `إنهاء عضوية ${person.fullNameAr} في ${membership.officeNameAr}؟`,
                    description: "يفقد صلاحيات هذا المكتب والدور فورًا. لا يُحذف سجل العضوية.",
                    confirmLabel: "إنهاء العضوية",
                    destructive: true,
                    successMessage: "أُنهيت العضوية.",
                    onConfirm: async () => {
                      await endMembership(person.id, membership.id);
                      await queryClient.invalidateQueries({ queryKey: ["people", person.id] });
                    },
                  }),
              },
            ]}
          />
        </Section>
      ) : null}

      <AddMembershipDialog
        open={addMembershipOpen}
        onOpenChange={setAddMembershipOpen}
        personId={person.id}
        existingOfficeIds={person.memberships
          .filter((membership) => membership.status === "ACTIVE")
          .map((membership) => membership.officeId)}
      />

      <EditMembershipDialog
        open={Boolean(editingMembership)}
        onOpenChange={(open) => {
          if (!open) setEditingMembership(null);
        }}
        personId={person.id}
        membership={editingMembership}
        otherActiveOfficeIds={person.memberships
          .filter(
            (membership) =>
              membership.status === "ACTIVE" && membership.id !== editingMembership?.id,
          )
          .map((membership) => membership.officeId)}
      />

      <Section title="المهام المفتوحة" description="ما هو مسنَد إليه ولم يُغلق بعد.">
        <DataTable
          caption="المهام المفتوحة"
          columns={taskColumns}
          data={tasks.data}
          getRowId={(task) => task.id}
          isLoading={tasks.isPending}
          error={tasks.error}
          onRetry={() => void tasks.refetch()}
          empty={{ title: "لا مهام مفتوحة" }}
          rowHref={(task) => `/dashboard/tasks?task=${task.id}`}
        />
      </Section>
    </div>
  );
}
