"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useOffices } from "@/components/offices/office-options";
import { RoleSheet } from "@/components/roles/role-sheet";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { listStaffRoles } from "@/lib/api/invitations";
import { type Role, deleteRole } from "@/lib/api/roles";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";

const MANAGE = [CAPABILITIES.rolesManage] as const;

const col = columnHelper<Role>();

/**
 * حزم الصلاحيات لكل منصب. الانضمام إلى فريق بدور يمنح حزمته تلقائيًا،
 * والاستثناءات لشخص بعينه تُضبط من ملفه لا من هنا.
 */
export default function RolesPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const offices = useOffices();
  const [editing, setEditing] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  const roles = useQuery({ queryKey: ["roles", "STAFF"], queryFn: listStaffRoles });

  const officeNames = useMemo(
    () => new Map((offices.data ?? []).map((office) => [office.id, office.nameAr])),
    [offices.data],
  );

  /** مرآة شرط الخادم: الحزمة كلها مما يحمله المحرِّر، والدور غير مقفل. */
  const held = useMemo(() => new Set(user?.capabilities ?? []), [user?.capabilities]);
  const canEdit = (role: Role) =>
    !role.isLocked && role.capabilities.every((capability) => held.has(capability));

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("nameAr", {
          header: "الدور",
          cell: (info) => {
            const role = info.row.original;

            return (
              <PrimaryCell
                label={info.getValue()}
                description={role.descriptionAr}
                badge={
                  role.isLocked ? (
                    <Badge tone="warning">كل الصلاحيات</Badge>
                  ) : role.customizedAt ? (
                    <Badge tone="info">مُعدَّل</Badge>
                  ) : null
                }
              />
            );
          },
        }),
        col.accessor((role) => (role.officeId ? officeNames.get(role.officeId) ?? "—" : "عام"), {
          id: "office",
          header: "الفريق",
        }),
        col.accessor((role) => role.capabilities.length, {
          id: "capabilities",
          header: "الصلاحيات",
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor("activeMembers", {
          header: "الأعضاء",
          cell: (info) => cells.number(info.getValue()),
        }),
      ]),
    [officeNames],
  );

  function openSheet(role: Role | null) {
    setEditing(role);
    setOpen(true);
  }

  const add = {
    key: "add",
    label: "دور جديد",
    icon: Plus,
    requires: MANAGE,
    onSelect: () => openSheet(null),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأدوار والصلاحيات"
        description="لكل منصب حزمة صلاحيات يحملها صاحبه تلقائيًا في فريقه. ما يُعدَّل هنا يسري على كل من يحمل الدور، ولا يعيده النشر إلى ما كان. استثناءات شخص بعينه تُضبط من ملفه في دليل الفريق."
        primaryAction={add}
      />

      <DataTable
        caption="الأدوار"
        columns={columns}
        data={roles.data}
        getRowId={(role) => role.id}
        isLoading={roles.isPending}
        error={roles.error}
        onRetry={() => void roles.refetch()}
        pagination={false}
        empty={{ title: "لا أدوار بعد", action: add }}
        rowActions={(role) => [
          canEdit(role) && {
            key: "edit",
            label: "تحرير الحزمة",
            icon: Pencil,
            quick: true,
            requires: MANAGE,
            onSelect: () => openSheet(role),
          },
          canEdit(role) &&
            !role.isSystem && {
              key: "delete",
              label: "حذف",
              icon: Trash2,
              destructive: true,
              requires: MANAGE,
              onSelect: () =>
                void confirm({
                  title: `حذف الدور «${role.nameAr}»؟`,
                  description:
                    "يُحذف الدور الذي لم يُسنَد قط. إن حمله أحد — ولو في عضوية منتهية — يبقى جزءًا من تاريخها، فانقل أصحابه إلى دور آخر.",
                  confirmLabel: "حذف",
                  destructive: true,
                  successMessage: "حُذف الدور.",
                  onConfirm: async () => {
                    await deleteRole(role.id);
                    await queryClient.invalidateQueries({ queryKey: ["roles"] });
                  },
                }),
            },
        ]}
      />

      <RoleSheet role={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}
