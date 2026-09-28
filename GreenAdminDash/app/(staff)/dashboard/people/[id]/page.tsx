"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Pencil, SlidersHorizontal, UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AddMembershipDialog } from "@/components/people/add-membership-dialog";
import { EditMembershipDialog } from "@/components/people/edit-membership-dialog";
import { MembershipCapabilitiesSheet } from "@/components/people/membership-capabilities-sheet";
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
import { useAccess } from "@/lib/auth/access";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { ApiError } from "@/lib/api/client";
import {
  endMembership,
  getPerson,
  primaryMembership,
  type TeamMembershipDetail,
} from "@/lib/api/people";
import { OPEN_STATUSES, listTasks, type WorkItemSummary } from "@/lib/api/work";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const BREADCRUMB_ROOT = { label: "دليل الفريق", href: "/dashboard/people" };

const membershipCol = columnHelper<TeamMembershipDetail>();
const taskCol = columnHelper<WorkItemSummary>();

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const access = useAccess();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [editingMembership, setEditingMembership] = useState<TeamMembershipDetail | null>(null);
  const [customizing, setCustomizing] = useState<TeamMembershipDetail | null>(null);

  // لا يدير أحد عضوياته بنفسه — الخادم يرفضها، فلا يُعرض قسم الإدارة أصلًا.
  const isSelf = user?.id === id;
  const canViewTasks = can(CAPABILITIES.workView);

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
    enabled: Boolean(member.data) && canViewTasks,
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
        membershipCol.accessor((membership) => membership.effective.length, {
          id: "capabilities",
          header: "الصلاحيات",
          cell: (info) => {
            const { overrides } = info.row.original;
            const granted = overrides.filter((override) => override.effect === "GRANT").length;
            const revoked = overrides.length - granted;

            return (
              <span className="flex flex-wrap items-center gap-1.5">
                {cells.number(info.getValue())}
                {granted > 0 ? <Badge tone="success">+{granted} مضافة</Badge> : null}
                {revoked > 0 ? <Badge tone="danger">−{revoked} منزوعة</Badge> : null}
              </span>
            );
          },
        }),
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
  const active = person.memberships.filter((membership) => membership.status === "ACTIVE");
  const hasActive = active.length > 0;
  // القسم لمن يدير فريقًا ما: يضيف إليه، أو يمسّ عضوية هنا تقع في فريقه.
  const showManage =
    !isSelf && (active.some((membership) => membership.canManage) || access.managesAnyTeam);

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
       * قسم منفصل عن «العضويات» أعلاه: الأول للجميع وللقراءة وحدها، وهذا
       * لا يُركَّب أصلًا لمن لا يدير فريقًا — لا يظهر فارغًا ولا معطَّلًا.
       * أفعال كل صف من قرار الخادم (`canManage`/`canCustomize`) لا من
       * نسخة من قواعده هنا.
       */}
      {showManage ? (
        <Section
          title="إدارة العضويات والصلاحيات"
          description="ضمّ العضو إلى فريق تديره، أو تعديل دوره فيه، أو تخصيص صلاحياته — كمساعد يرى أمورًا بعينها — أو إنهاء العضوية."
          actions={[
            access.managesAnyTeam && {
              key: "add-membership",
              label: "إضافة إلى فريق",
              icon: UserPlus,
              onSelect: () => setAddMembershipOpen(true),
            },
          ]}
        >
          <DataTable
            caption="إدارة العضويات"
            columns={manageMembershipColumns}
            data={active}
            getRowId={(membership) => membership.id}
            pagination={false}
            empty={{ title: "لا عضويات نشطة" }}
            rowActions={(membership) => [
              membership.canCustomize && {
                key: "customize",
                label: "تخصيص الصلاحيات",
                icon: SlidersHorizontal,
                quick: true,
                onSelect: () => setCustomizing(membership),
              },
              membership.canManage && {
                key: "edit",
                label: "تعديل الفريق أو الدور",
                icon: Pencil,
                onSelect: () => setEditingMembership(membership),
              },
              membership.canManage && {
                key: "end",
                label: "إنهاء العضوية",
                icon: Ban,
                destructive: true,
                onSelect: () =>
                  void confirm({
                    title: `إنهاء عضوية ${person.fullNameAr} في ${membership.officeNameAr}؟`,
                    description: "يفقد صلاحيات هذا الفريق والدور فورًا. لا يُحذف سجل العضوية.",
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
        existingOfficeIds={active.map((membership) => membership.officeId)}
      />

      <MembershipCapabilitiesSheet
        open={Boolean(customizing)}
        onOpenChange={(open) => {
          if (!open) setCustomizing(null);
        }}
        personId={person.id}
        personName={person.fullNameAr}
        membership={customizing}
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

      {canViewTasks ? (
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
      ) : null}
    </div>
  );
}
