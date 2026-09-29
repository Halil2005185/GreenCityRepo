"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus, UserPlus, UserRoundCheck, UserRoundCog } from "lucide-react";
import { useMemo, useState } from "react";

import { AddMembersDialog, membersKey } from "@/components/field/add-members-dialog";
import { fieldKey } from "@/components/field/group-dialog";
import { ActionButton } from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyCell, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/toolbar";
import {
  MEMBER_ROLE_LABELS,
  listGroupMembers,
  removeGroupMember,
  updateGroupMember,
  type FieldGroup,
  type FieldGroupMember,
  type FieldGroupMembers,
} from "@/lib/api/field";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { matchesQuery } from "@/lib/text/normalize-ar";
import { countAr } from "@/lib/text/plural-ar";

const MANAGE = [CAPABILITIES.fieldManage] as const;

const DAYS = { one: "يوم واحد", two: "يومان", few: "أيام", many: "يومًا", other: "يوم" };

const memberCol = columnHelper<FieldGroupMember>();

/**
 * أعضاء المجموعة: من يراهم قائدها في «الحضور» بالتطبيق الميداني.
 *
 * نافذة لا صفحة: المنسّق يوزّع المتطوعين على مجموعات المبادرة واحدة بعد
 * أخرى، ويعود إلى قائمتها بين كل اثنتين.
 */
export function MembersDialog({
  initiativeId,
  group,
  readOnly,
  open,
  onOpenChange,
}: {
  initiativeId: string;
  group: FieldGroup | null;
  /** المبادرة مغلقة: القائمة سجلّ يُقرأ. */
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {group ? (
          <Members
            // مجموعة أخرى جلسة أخرى: بحثها ونافذة إضافتها يبدآن من جديد.
            key={group.id}
            initiativeId={initiativeId}
            group={group}
            readOnly={readOnly}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Members({
  initiativeId,
  group,
  readOnly,
}: {
  initiativeId: string;
  group: FieldGroup;
  readOnly: boolean;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const key = membersKey(initiativeId, group.id);

  const members = useQuery({
    queryKey: key,
    queryFn: () => listGroupMembers(initiativeId, group.id),
  });

  /** كل كتابة تعيد القائمة كاملة؛ وعدّاد المجموعة في الجدول خلفها يتبعها. */
  const apply = (next: FieldGroupMembers) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: fieldKey(initiativeId) });
  };

  const changeRole = useApiMutation({
    mutationFn: (member: FieldGroupMember) =>
      updateGroupMember(initiativeId, group.id, member.id, {
        role: member.role === "ASSISTANT" ? "MEMBER" : "ASSISTANT",
      }),
    successMessage: (_data, member) =>
      member.role === "ASSISTANT"
        ? `عاد ${member.fullNameAr} عضوًا.`
        : `صار ${member.fullNameAr} مساعدًا للقائد.`,
    onSuccess: apply,
  });

  const visible = useMemo(
    () =>
      (members.data?.members ?? []).filter((member) =>
        matchesQuery(search, member.fullNameAr, member.phone, member.email),
      ),
    [members.data, search],
  );

  const columns = useMemo(
    () =>
      memberCol.columns([
        memberCol.accessor("fullNameAr", {
          header: "الاسم",
          cell: (info) => {
            const { phone, email, fromForm } = info.row.original;

            return (
              <PrimaryCell
                label={info.getValue()}
                description={
                  phone || email ? <bdi>{[phone, email].filter(Boolean).join(" · ")}</bdi> : null
                }
                badge={fromForm ? <Badge tone="outline">من استمارة</Badge> : null}
              />
            );
          },
        }),
        memberCol.accessor("role", {
          header: "الدور",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => (
            <Badge tone={info.getValue() === "ASSISTANT" ? "primary" : "neutral"}>
              {MEMBER_ROLE_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
        memberCol.accessor("attendedDays", {
          header: "حضر",
          meta: { className: "whitespace-nowrap" },
          cell: (info) =>
            info.getValue() > 0 ? countAr(info.getValue(), DAYS) : <EmptyCell />,
        }),
        memberCol.accessor((member) => member.lastAttendedOn ?? undefined, {
          id: "lastAttendedOn",
          header: "آخر حضور",
          sortUndefined: "last",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const add = {
    key: "add-members",
    label: "إضافة أعضاء",
    icon: UserPlus,
    requires: MANAGE,
    hidden: readOnly,
    onSelect: () => setAdding(true),
  };

  const total = members.data?.members.length ?? group.memberCount;

  return (
    <>
      <DialogHeader>
        <DialogTitle>أعضاء «{group.nameAr}»</DialogTitle>
        <DialogDescription>
          {[
            group.siteNameAr,
            group.leadNameAr ? `القائد: ${group.leadNameAr}` : "بلا قائد",
            total > 0 ? countAr(total, MEMBERS) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث بالاسم أو الهاتف"
            label="ابحث في أعضاء المجموعة"
            className="min-w-0 flex-1 sm:max-w-72"
          />
          {can(CAPABILITIES.fieldManage) && !readOnly ? (
            <ActionButton action={add} variant="default" size="sm" />
          ) : null}
        </div>

        <DataTable
          caption={`أعضاء ${group.nameAr}`}
          columns={columns}
          data={members.data ? visible : undefined}
          getRowId={(member) => member.id}
          isLoading={members.isPending}
          error={members.error}
          onRetry={() => void members.refetch()}
          pagination={{ mode: "client", pageSize: 10 }}
          filtered={search !== ""}
          onClearFilters={() => setSearch("")}
          empty={{
            title: "لا أعضاء في المجموعة بعد",
            description:
              "أضف المقبولين في استمارة التطوع، أو من شارك سابقًا، أو اكتب الأسماء. ومن يحضر بلا تسجيل يضيفه القائد من التطبيق.",
            action: add,
          }}
          rowActions={(member) =>
            readOnly
              ? []
              : [
                  {
                    key: "role",
                    label: member.role === "ASSISTANT" ? "أعده عضوًا" : "اجعله مساعدًا للقائد",
                    icon: member.role === "ASSISTANT" ? UserRoundCheck : UserRoundCog,
                    requires: MANAGE,
                    loading: changeRole.isPendingFor((pending) => pending.id === member.id),
                    onSelect: () => changeRole.mutate(member),
                  },
                  {
                    key: "remove",
                    label: "إخراج من المجموعة",
                    icon: UserMinus,
                    destructive: true,
                    requires: MANAGE,
                    onSelect: () =>
                      void confirm({
                        title: `إخراج ${member.fullNameAr} من «${group.nameAr}»؟`,
                        description:
                          "يخرج من قائمة المجموعة ويبقى في سجل المشاركين، وحضوره السابق فيها محفوظ.",
                        confirmLabel: "إخراج من المجموعة",
                        destructive: true,
                        successMessage: "أُخرج من المجموعة.",
                        onConfirm: async () =>
                          apply(await removeGroupMember(initiativeId, group.id, member.id)),
                      }),
                  },
                ]
          }
        />
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            إغلاق
          </Button>
        </DialogClose>
      </DialogFooter>

      <AddMembersDialog
        initiativeId={initiativeId}
        group={group}
        open={adding}
        onOpenChange={setAdding}
      />
    </>
  );
}

const MEMBERS = {
  one: "عضو واحد",
  two: "عضوان",
  few: "أعضاء",
  many: "عضوًا",
  other: "عضو",
};
