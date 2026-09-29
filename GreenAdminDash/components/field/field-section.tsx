"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Settings2, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AnnouncementsSection } from "@/components/field/announcements-section";
import { AttendanceSection } from "@/components/field/attendance-section";
import { GroupDialog, fieldKey, useFieldCache } from "@/components/field/group-dialog";
import { MembersDialog } from "@/components/field/members-dialog";
import { PhotosSection } from "@/components/field/photos-section";
import { SettingsDialog } from "@/components/field/settings-dialog";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  deleteFieldGroup,
  getInitiativeField,
  type FieldGroup,
  type FieldSettings,
} from "@/lib/api/field";
import type { InitiativeDetail } from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";

const MANAGE = [CAPABILITIES.fieldManage] as const;

const NO_GROUPS: readonly FieldGroup[] = [];

const groupCol = columnHelper<FieldGroup>();

/**
 * تبويب «الميدان»: مجموعات المبادرة وأعضاؤها، وما يُعلَن لهم، ثم ما عاد من
 * الميدان — الحضور والصور. أقسام متتالية بعمود واحد، كل قسم بجدوله وأفعاله
 * فوقه.
 *
 * ما يُكوَّن هنا هو ما يراه القائد في التطبيق الميداني: تسميته قائدًا تفتح
 * له ورقة يوم المجموعة، وأعضاؤها هم قائمة حضوره.
 */
export function FieldSection({ initiative }: { initiative: InitiativeDetail }) {
  const field = useQuery({
    queryKey: fieldKey(initiative.id),
    queryFn: () => getInitiativeField(initiative.id),
  });

  return (
    <div className="space-y-8">
      <GroupsSection
        initiative={initiative}
        groups={field.data?.groups}
        settings={field.data?.settings}
        isLoading={field.isPending}
        error={field.error}
        onRetry={() => void field.refetch()}
      />
      <AnnouncementsSection
        initiative={initiative}
        groups={field.data?.groups ?? NO_GROUPS}
      />
      <AttendanceSection initiative={initiative} />
      <PhotosSection initiative={initiative} groups={field.data?.groups ?? NO_GROUPS} />
    </div>
  );
}

function GroupsSection({
  initiative,
  groups,
  settings,
  isLoading,
  error,
  onRetry,
}: {
  initiative: InitiativeDetail;
  groups: readonly FieldGroup[] | undefined;
  settings: FieldSettings | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const confirm = useConfirm();
  const apply = useFieldCache();
  const [dialog, setDialog] = useState<{ group: FieldGroup | null; open: boolean }>({
    group: null,
    open: false,
  });
  const [members, setMembers] = useState<{ groupId: string | null; open: boolean }>({
    groupId: null,
    open: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // المبادرة المغلقة انتهى ميدانها: يبقى سجلًا يُقرأ ولا يُعدَّل.
  const closed = initiative.status === "COMPLETED" || initiative.status === "CANCELLED";
  const hasSite = initiative.sites.some((site) => site.status !== "CANCELLED");

  // المجموعة تُقرأ من الذاكرة لا من لقطة عند الفتح: عدّادها يتغيّر خلف النافذة.
  const membersGroup = groups?.find((group) => group.id === members.groupId) ?? null;

  const columns = useMemo(
    () =>
      groupCol.columns([
        groupCol.accessor("nameAr", {
          header: "المجموعة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              onClick={() => setMembers({ groupId: info.row.original.id, open: true })}
              description={
                info.row.original.meetingPointAr
                  ? `اللقاء عند: ${info.row.original.meetingPointAr}`
                  : null
              }
            />
          ),
        }),
        groupCol.accessor("siteNameAr", {
          header: "الموقع",
          cell: (info) => (
            <span className="inline-flex flex-wrap items-center gap-2">
              {info.getValue()}
              {info.row.original.siteStatus === "CANCELLED" ? (
                <StatusBadge kind="siteStatus" value="CANCELLED" />
              ) : null}
            </span>
          ),
        }),
        groupCol.accessor((group) => group.leadNameAr ?? undefined, {
          id: "lead",
          header: "القائد",
          sortUndefined: "last",
          cell: (info) =>
            // بلا قائد لا يفتح أحدٌ ورقة المجموعة: يُنبَّه إليه لا يُترك شرطة.
            info.getValue() ?? <Badge tone="warning">بلا قائد</Badge>,
        }),
        groupCol.accessor((group) => group.meetsAt ?? undefined, {
          id: "meetsAt",
          header: "موعد اللقاء",
          sortUndefined: "last",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
        groupCol.accessor("memberCount", {
          header: "الأعضاء",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        groupCol.accessor("linkedCount", {
          header: "لهم رابط",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        groupCol.accessor("comingCount", {
          header: "أكّدوا",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        groupCol.accessor("attendedCount", {
          header: "حضروا",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
      ]),
    [],
  );

  const add = {
    key: "add-group",
    label: "إضافة مجموعة",
    icon: Plus,
    requires: MANAGE,
    hidden: closed,
    disabled: !hasSite,
    disabledReason: "أضف موقع تنفيذ أولًا من تبويب «المواقع».",
    onSelect: () => setDialog({ group: null, open: true }),
  };

  return (
    <Section
      title="المجموعات الميدانية"
      description={
        closed
          ? "المبادرة مغلقة، فميدانها سجلّ يُقرأ ولا يُعدَّل."
          : "لكل موقع مجموعة أو أكثر. قائد المجموعة يفتح ورقة يومها من التطبيق الميداني، وأعضاؤها قائمة حضوره."
      }
      actions={[add]}
      menuActions={[
        {
          key: "settings",
          label: "إعدادات الميدان",
          icon: Settings2,
          requires: MANAGE,
          onSelect: () => setSettingsOpen(true),
        },
      ]}
    >
      <DataTable
        caption="المجموعات الميدانية"
        columns={columns}
        data={groups}
        getRowId={(group) => group.id}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        pagination={false}
        empty={{
          title: "لا مجموعات بعد",
          description: hasSite
            ? "كوّن مجموعة لكل موقع وسمِّ قائدها قبل يوم الحملة."
            : "المجموعة تُكوَّن لموقع تنفيذ، فأضف موقعًا أولًا.",
          action: add,
        }}
        rowActions={(group) => [
          {
            key: "members",
            label: "أعضاء المجموعة",
            icon: Users,
            quick: true,
            requires: MANAGE,
            onSelect: () => setMembers({ groupId: group.id, open: true }),
          },
          {
            key: "edit",
            label: group.leadUserId ? "تعديل المجموعة" : "تسمية قائد وتعديل",
            icon: Pencil,
            requires: MANAGE,
            hidden: closed,
            onSelect: () => setDialog({ group, open: true }),
          },
          {
            key: "delete",
            label: "حذف المجموعة",
            icon: Trash2,
            destructive: true,
            requires: MANAGE,
            hidden: closed,
            onSelect: () =>
              void confirm({
                title: `حذف «${group.nameAr}»؟`,
                description:
                  "تُحذف المجموعة وقائمة أعضائها، ولا يراها قائدها في التطبيق بعدها. مجموعة لها سجل حضور لا تُحذف.",
                confirmLabel: "حذف المجموعة",
                destructive: true,
                successMessage: "حُذفت المجموعة.",
                onConfirm: async () => apply(await deleteFieldGroup(initiative.id, group.id)),
              }),
          },
        ]}
      />

      <GroupDialog
        initiative={initiative}
        group={dialog.group}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />

      <SettingsDialog
        initiativeId={initiative.id}
        settings={settings}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <MembersDialog
        initiativeId={initiative.id}
        group={membersGroup}
        readOnly={closed}
        open={members.open && membersGroup !== null}
        onOpenChange={(open) => setMembers((current) => ({ ...current, open }))}
      />
    </Section>
  );
}
