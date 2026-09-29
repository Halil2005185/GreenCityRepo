"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { GroupDialog, fieldKey, useFieldCache } from "@/components/field/group-dialog";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteFieldGroup, getInitiativeField, type FieldGroup } from "@/lib/api/field";
import type { InitiativeDetail } from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";

const MANAGE = [CAPABILITIES.fieldManage] as const;

const groupCol = columnHelper<FieldGroup>();

/**
 * تبويب «الميدان»: مجموعات المبادرة على مواقعها، وقائد كل مجموعة.
 *
 * ما يُكوَّن هنا هو ما يراه القائد في التطبيق الميداني: تسميته قائدًا تفتح
 * له ورقة يوم المجموعة، وإعفاؤه يغلقها.
 */
export function FieldSection({ initiative }: { initiative: InitiativeDetail }) {
  const confirm = useConfirm();
  const apply = useFieldCache();
  const [dialog, setDialog] = useState<{ group: FieldGroup | null; open: boolean }>({
    group: null,
    open: false,
  });

  const field = useQuery({
    queryKey: fieldKey(initiative.id),
    queryFn: () => getInitiativeField(initiative.id),
  });

  // المبادرة المغلقة انتهى ميدانها: يبقى سجلًا يُقرأ ولا يُعدَّل.
  const closed = initiative.status === "COMPLETED" || initiative.status === "CANCELLED";
  const hasSite = initiative.sites.some((site) => site.status !== "CANCELLED");

  const columns = useMemo(
    () =>
      groupCol.columns([
        groupCol.accessor("nameAr", {
          header: "المجموعة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
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
          : "لكل موقع مجموعة أو أكثر. قائد المجموعة يفتح ورقة يومها من التطبيق الميداني."
      }
      actions={[add]}
    >
      <DataTable
        caption="المجموعات الميدانية"
        columns={columns}
        data={field.data?.groups}
        getRowId={(group) => group.id}
        isLoading={field.isPending}
        error={field.error}
        onRetry={() => void field.refetch()}
        pagination={false}
        empty={{
          title: "لا مجموعات بعد",
          description: hasSite
            ? "كوّن مجموعة لكل موقع وسمِّ قائدها قبل يوم الحملة."
            : "المجموعة تُكوَّن لموقع تنفيذ، فأضف موقعًا أولًا.",
          action: add,
        }}
        rowActions={(group) =>
          closed
            ? []
            : [
                {
                  key: "edit",
                  label: group.leadUserId ? "تعديل المجموعة" : "تسمية قائد وتعديل",
                  icon: Pencil,
                  quick: true,
                  requires: MANAGE,
                  onSelect: () => setDialog({ group, open: true }),
                },
                {
                  key: "delete",
                  label: "حذف المجموعة",
                  icon: Trash2,
                  destructive: true,
                  requires: MANAGE,
                  onSelect: () =>
                    void confirm({
                      title: `حذف «${group.nameAr}»؟`,
                      description:
                        "تُحذف المجموعة من الميدان، ولا يراها قائدها في التطبيق بعدها.",
                      confirmLabel: "حذف المجموعة",
                      destructive: true,
                      successMessage: "حُذفت المجموعة.",
                      onConfirm: async () =>
                        apply(await deleteFieldGroup(initiative.id, group.id)),
                    }),
                },
              ]
        }
      />

      <GroupDialog
        initiative={initiative}
        group={dialog.group}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Section>
  );
}
