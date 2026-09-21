"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Send, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { PartnerInviteDialog } from "@/components/partners/partner-dialogs";
import { InviteStaffDialog } from "@/components/people/invite-staff-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, Toolbar, type ChipOption } from "@/components/ui/toolbar";
import { listInvitations, revokeInvitation, type Invitation } from "@/lib/api/invitations";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { statusOptions } from "@/lib/status";

/** مرشّح الحالة قائم في الـAPI ولم تكن له واجهة؛ المعلّقة أولًا لأنها ما يُتابَع. */
const STATUS_CHIPS: ChipOption[] = [{ value: "", label: "الكل" }, ...statusOptions("invitationStatus")];

const col = columnHelper<Invitation>();

type Resend = { invitation: Invitation; open: boolean };

export default function InvitationsPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useUrlState({ status: "", invite: "" });
  const [resend, setResend] = useState<Resend | null>(null);

  const invitations = useQuery({
    queryKey: ["invitations", filters.status || "ALL"],
    queryFn: () => listInvitations((filters.status || undefined) as Invitation["status"] | undefined),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("email", {
          header: "البريد",
          cell: (info) => (
            <PrimaryCell
              label={<span dir="ltr">{info.getValue()}</span>}
              description={info.row.original.fullNameAr}
            />
          ),
        }),
        col.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="invitationStatus" value={info.getValue()} />,
        }),
        col.accessor("roleNameAr", {
          header: "الدور",
          cell: (info) => cells.text(info.getValue()),
        }),
        // دعوة الفريق لمكتب ودعوة الممثل لجهة؛ عمود واحد للاثنتين.
        col.accessor((invitation) => invitation.officeNameAr ?? invitation.partnerNameAr ?? undefined, {
          id: "scope",
          header: "المكتب أو الجهة",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor("createdAt", {
          header: "أُرسلت",
          cell: (info) => cells.date(info.getValue()),
        }),
        col.accessor("expiresAt", {
          header: "تنتهي",
          cell: (info) =>
            info.row.original.status === "PENDING" ? cells.dateTime(info.getValue()) : cells.text(null),
        }),
      ]),
    [],
  );

  const invite = {
    key: "invite",
    label: "دعوة عضو",
    icon: UserPlus,
    requires: [CAPABILITIES.invitationsManage],
    onSelect: () => setFilters({ invite: "1" }, { keepPage: true }),
  };

  const closeResend = (open: boolean) => setResend((current) => (current ? { ...current, open } : null));

  return (
    <div className="space-y-6">
      <PageHeader
        title="الدعوات"
        description="الدعوة هي المدخل الوحيد لإنشاء حساب. الدور والمكتب يُثبَّتان وقت الإرسال، فلا يغيّرهما تعديل لاحق."
        primaryAction={invite}
      />

      <div className="space-y-3">
        <Toolbar mobile="inline">
          <FilterChips
            label="حالة الدعوة"
            value={filters.status}
            onChange={(status) => setFilters({ status })}
            options={STATUS_CHIPS}
          />
        </Toolbar>

        <DataTable
          caption="الدعوات"
          columns={columns}
          data={invitations.data}
          getRowId={(invitation) => invitation.id}
          isLoading={invitations.isPending}
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
          urlState
          filtered={Boolean(filters.status)}
          onClearFilters={() => setFilters({ status: "" })}
          empty={{ title: "لم تُرسل أي دعوة بعد", action: invite }}
          rowActions={(invitation) => [
            {
              key: "resend",
              label: "إعادة إرسال الدعوة",
              icon: Send,
              quick: true,
              requires: [CAPABILITIES.invitationsManage],
              // المقبولة صارت حسابًا؛ ما عداها يُعاد بالبيانات نفسها.
              hidden: invitation.status === "ACCEPTED",
              onSelect: () => setResend({ invitation, open: true }),
            },
            {
              key: "revoke",
              label: "إلغاء الدعوة",
              icon: Ban,
              destructive: true,
              requires: [CAPABILITIES.invitationsManage],
              hidden: invitation.status !== "PENDING",
              onSelect: () =>
                void confirm({
                  title: `إلغاء الدعوة المرسلة إلى ${invitation.email}؟`,
                  description: "يتوقف رابطها عن العمل فورًا. يمكن إرسال دعوة جديدة لاحقًا.",
                  confirmLabel: "إلغاء الدعوة",
                  destructive: true,
                  successMessage: "أُلغيت الدعوة.",
                  onConfirm: async () => {
                    await revokeInvitation(invitation.id);
                    await queryClient.invalidateQueries({ queryKey: ["invitations"] });
                  },
                }),
            },
          ]}
        />
      </div>

      <InviteStaffDialog
        open={filters.invite === "1"}
        onOpenChange={(open) => setFilters({ invite: open ? "1" : null }, { keepPage: true })}
      />

      {resend?.invitation.kind === "STAFF" ? (
        <InviteStaffDialog
          open={resend.open}
          onOpenChange={closeResend}
          initial={{
            email: resend.invitation.email,
            fullNameAr: resend.invitation.fullNameAr ?? "",
            officeId: resend.invitation.officeId ?? "",
            roleId: resend.invitation.roleId,
          }}
        />
      ) : resend?.invitation.kind === "PARTNER" && resend.invitation.partnerId ? (
        <PartnerInviteDialog
          open={resend.open}
          onOpenChange={closeResend}
          partner={{
            id: resend.invitation.partnerId,
            displayNameAr: resend.invitation.partnerNameAr ?? "الجهة",
          }}
          email={resend.invitation.email}
          fullNameAr={resend.invitation.fullNameAr ?? ""}
          roleId={resend.invitation.roleId}
        />
      ) : null}
    </div>
  );
}
