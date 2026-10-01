"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { lookupLabel } from "@/components/lookups/lookup-select";
import {
  AcknowledgementDialog,
  AddContactDialog,
  AddPartnershipDialog,
  usePartnerCache,
} from "@/components/partners/partner-dialogs";
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
  listInvitations,
  revokeInvitation,
  type Invitation,
} from "@/lib/api/invitations";
import {
  PARTNERSHIP_TYPE_LABELS,
  recordConsent,
  updatePartnership,
  type PartnerDetail,
} from "@/lib/api/partners";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDateTime } from "@/lib/utils";

type Contact = PartnerDetail["contacts"][number];
type Partnership = PartnerDetail["partnerships"][number];
type Acknowledgement = PartnerDetail["acknowledgements"][number];
type Interaction = PartnerDetail["interactions"][number];
type ConsentEvent = PartnerDetail["consentEvents"][number];

function EmailLink({ value }: { value: string | null }) {
  if (!value) return <EmptyCell />;

  return (
    <a href={`mailto:${value}`} dir="ltr" className="text-primary hover:underline">
      {value}
    </a>
  );
}

function PhoneLink({ value }: { value: string | null }) {
  if (!value) return <EmptyCell />;

  return (
    <a href={`tel:${value}`} dir="ltr" className="numeric hover:underline">
      {value}
    </a>
  );
}

// ── جهات الاتصال ────────────────────────────────────────────────────────

const contactCol = columnHelper<Contact>();

export function ContactsSection({
  partner,
  onInvite,
}: {
  partner: PartnerDetail;
  onInvite: (contact: Contact) => void;
}) {
  const [adding, setAdding] = useState(false);
  const canInvite = partner.stage === "ACTIVE" && !partner.isSuspended;

  const columns = useMemo(
    () =>
      contactCol.columns([
        contactCol.accessor("fullNameAr", {
          header: "الاسم",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={info.row.original.jobTitleAr}
              badge={
                <>
                  {info.row.original.isPrimary ? <Badge tone="primary">رئيسية</Badge> : null}
                  {info.row.original.hasAccount ? <Badge tone="success">لديه حساب</Badge> : null}
                </>
              }
            />
          ),
        }),
        contactCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="membershipStatus" value={info.getValue()} />,
        }),
        contactCol.accessor("email", {
          header: "البريد",
          cell: (info) => <EmailLink value={info.getValue()} />,
        }),
        contactCol.accessor("phone", {
          header: "الهاتف",
          enableSorting: false,
          cell: (info) => <PhoneLink value={info.getValue()} />,
        }),
      ]),
    [],
  );

  return (
    <Section
      title="جهات الاتصال"
      description="الأشخاص الذين يُتواصل معهم في الجهة، والرئيسية منهم شرط للتفعيل."
      actions={[
        {
          key: "add",
          label: "إضافة جهة اتصال",
          icon: Plus,
          requires: [CAPABILITIES.partnersManage],
          onSelect: () => setAdding(true),
        },
      ]}
    >
      <DataTable
        caption="جهات الاتصال"
        columns={columns}
        data={partner.contacts}
        getRowId={(contact) => contact.id}
        pagination={false}
        empty={{
          title: "لا جهات اتصال بعد",
          description: "التفعيل يشترط جهة اتصال رئيسية واحدة على الأقل.",
        }}
        rowActions={(contact) => [
          {
            key: "invite",
            label: "دعوة إلى البوابة",
            icon: UserPlus,
            requires: [CAPABILITIES.invitationsManage],
            hidden:
              !canInvite ||
              !contact.email ||
              contact.hasAccount ||
              contact.status !== "ACTIVE",
            onSelect: () => onInvite(contact),
          },
        ]}
      />
      <AddContactDialog partner={partner} open={adding} onOpenChange={setAdding} />
    </Section>
  );
}

// ── أنواع الشراكة ───────────────────────────────────────────────────────

const partnershipCol = columnHelper<Partnership>();

export function PartnershipsSection({ partner }: { partner: PartnerDetail }) {
  const apply = usePartnerCache();
  const [adding, setAdding] = useState(false);

  const approve = useApiMutation({
    mutationFn: (partnershipId: string) =>
      updatePartnership(partner.id, partnershipId, "APPROVED"),
    successMessage: "اعتُمد نوع الشراكة.",
    errorFallback: "تعذّر اعتماد نوع الشراكة.",
    onSuccess: apply,
  });

  const columns = useMemo(
    () =>
      partnershipCol.columns([
        partnershipCol.accessor("type", {
          header: "النوع",
          cell: (info) => (
            <span className="font-medium">{PARTNERSHIP_TYPE_LABELS[info.getValue()]}</span>
          ),
        }),
        partnershipCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="partnershipStatus" value={info.getValue()} />,
        }),
        partnershipCol.accessor("approvedByNameAr", {
          header: "اعتمدها",
          cell: (info) => cells.text(info.getValue()),
        }),
        partnershipCol.accessor("approvedAt", {
          header: "تاريخ الاعتماد",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  return (
    <Section
      title="أنواع الشراكة"
      description="كل نوع يُقترح أولًا ثم يعتمده صاحب الصلاحية."
      actions={[
        {
          key: "add",
          label: "إضافة نوع شراكة",
          icon: Plus,
          requires: [CAPABILITIES.partnersManage],
          onSelect: () => setAdding(true),
        },
      ]}
    >
      <DataTable
        caption="أنواع الشراكة"
        columns={columns}
        data={partner.partnerships}
        getRowId={(partnership) => partnership.id}
        pagination={false}
        empty={{
          title: "لا أنواع شراكة بعد",
          description: "التفعيل يشترط نوع شراكة معتمدًا واحدًا على الأقل.",
        }}
        rowActions={(partnership) => [
          {
            key: "approve",
            label: `اعتماد «${PARTNERSHIP_TYPE_LABELS[partnership.type]}»`,
            icon: Check,
            quick: true,
            requires: [CAPABILITIES.partnersApprove],
            hidden: partnership.status !== "PROPOSED",
            loading: approve.isPendingFor((id) => id === partnership.id),
            onSelect: () => approve.mutate(partnership.id),
          },
        ]}
      />
      <AddPartnershipDialog partner={partner} open={adding} onOpenChange={setAdding} />
    </Section>
  );
}

// ── الإقرار بالميثاق ────────────────────────────────────────────────────

const acknowledgementCol = columnHelper<Acknowledgement>();

export function CharterSection({ partner }: { partner: PartnerDetail }) {
  const [adding, setAdding] = useState(false);

  const columns = useMemo(
    () =>
      acknowledgementCol.columns([
        acknowledgementCol.accessor("acknowledgedByNameAr", {
          header: "المُقِرّ",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={info.row.original.acknowledgedByTitleAr}
            />
          ),
        }),
        acknowledgementCol.accessor("charterVersion", {
          header: "الإصدار",
          cell: (info) => <span className="numeric">{info.getValue()}</span>,
        }),
        acknowledgementCol.accessor("method", {
          header: "الطريقة",
          enableSorting: false,
          cell: (info) => lookupLabel(info.getValue()),
        }),
        acknowledgementCol.accessor("acknowledgedAt", {
          header: "التاريخ",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
      ]),
    [],
  );

  return (
    <Section
      title="الإقرار بالميثاق"
      description="كل إقرار يشير إلى إصدار محدد من الميثاق."
      actions={[
        {
          key: "add",
          label: "تسجيل إقرار",
          icon: Plus,
          requires: [CAPABILITIES.charterAcknowledgementsRecord],
          onSelect: () => setAdding(true),
        },
      ]}
    >
      <DataTable
        caption="الإقرارات بالميثاق"
        columns={columns}
        data={partner.acknowledgements}
        getRowId={(acknowledgement) => acknowledgement.id}
        pagination={false}
        empty={{
          title: "لم تُقرّ الجهة بالميثاق بعد",
          description: "التفعيل يشترط إقرارًا بالإصدار الساري.",
        }}
      />
      <AcknowledgementDialog partner={partner} open={adding} onOpenChange={setAdding} />
    </Section>
  );
}

// ── سجل المتابعة ────────────────────────────────────────────────────────

const interactionCol = columnHelper<Interaction>();

export function FollowUpSection({ partner }: { partner: PartnerDetail }) {
  const columns = useMemo(
    () =>
      interactionCol.columns([
        interactionCol.accessor("summaryAr", {
          header: "الخلاصة",
          enableSorting: false,
          cell: (info) => (
            <PrimaryCell label={info.getValue()} description={info.row.original.bodyAr} />
          ),
        }),
        interactionCol.accessor("kind", {
          header: "النوع",
          enableSorting: false,
          cell: (info) => <Badge tone="accent">{lookupLabel(info.getValue())}</Badge>,
        }),
        interactionCol.accessor("recordedByNameAr", {
          header: "سجّلها",
          cell: (info) => cells.text(info.getValue()),
        }),
        interactionCol.accessor("occurredAt", {
          header: "التاريخ",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
      ]),
    [],
  );

  return (
    <Section title="سجل المتابعة" description="تغييرات المرحلة وما دُوّن عن الجهة، الأحدث أولًا.">
      <DataTable
        caption="سجل المتابعة"
        columns={columns}
        data={partner.interactions}
        getRowId={(interaction) => interaction.id}
        empty={{ title: "لا سجلات متابعة بعد" }}
      />
    </Section>
  );
}

// ── البوابة: موافقة الإظهار والدعوات ────────────────────────────────────

type ConsentType = "PUBLIC_NAME" | "PUBLIC_LOGO";
type ConsentRow = {
  type: ConsentType;
  label: string;
  subject: string;
  granted: boolean;
  last: ConsentEvent | undefined;
};

const consentCol = columnHelper<ConsentRow>();
const eventCol = columnHelper<ConsentEvent>();
const invitationCol = columnHelper<Invitation>();

const CONSENT_LABELS: Record<ConsentType, string> = {
  PUBLIC_NAME: "إظهار اسم الجهة",
  PUBLIC_LOGO: "إظهار شعار الجهة",
};

function consentSource(event: ConsentEvent) {
  return event.source === "PARTNER_SELF" ? "الجهة من بوابتها" : (event.actorNameAr ?? "الإدارة");
}

export function PortalSection({
  partner,
  onInvite,
}: {
  partner: PartnerDetail;
  onInvite: () => void;
}) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const apply = usePartnerCache();
  const queryClient = useQueryClient();
  const canInvite = partner.stage === "ACTIVE" && !partner.isSuspended;

  const invitations = useQuery({
    queryKey: ["invitations", "PENDING"],
    queryFn: () => listInvitations("PENDING"),
    enabled: can(CAPABILITIES.invitationsManage),
  });

  const grant = useApiMutation({
    mutationFn: (type: ConsentType) => recordConsent(partner.id, type, "GRANTED"),
    successMessage: (_, type) => `مُنحت موافقة «${CONSENT_LABELS[type]}».`,
    errorFallback: "تعذّر تسجيل الموافقة.",
    onSuccess: apply,
  });

  // الأحدث أولًا: آخر تغيير لكل نوع هو أول ما يطابقه بعد الترتيب.
  const events = useMemo(
    () =>
      [...partner.consentEvents].sort(
        (a, b) => new Date(b.actedAt).getTime() - new Date(a.actedAt).getTime(),
      ),
    [partner.consentEvents],
  );

  const rows: ConsentRow[] = [
    {
      type: "PUBLIC_NAME",
      label: CONSENT_LABELS.PUBLIC_NAME,
      subject: "الاسم",
      granted: partner.publicNameConsent,
      last: events.find((event) => event.consentType === "PUBLIC_NAME"),
    },
    {
      type: "PUBLIC_LOGO",
      label: CONSENT_LABELS.PUBLIC_LOGO,
      subject: "الشعار",
      granted: partner.publicLogoConsent,
      last: events.find((event) => event.consentType === "PUBLIC_LOGO"),
    },
  ];

  const consentColumns = useMemo(
    () =>
      consentCol.columns([
        consentCol.accessor("label", {
          header: "الموافقة",
          enableSorting: false,
          cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        consentCol.accessor("granted", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => (
            <StatusBadge kind="consent" value={info.getValue() ? "GRANTED" : "NOT_GRANTED"} />
          ),
        }),
        consentCol.display({
          id: "last",
          header: "آخر تغيير",
          cell: (info) => {
            const last = info.row.original.last;

            return last ? (
              <span className="text-xs text-muted-foreground">
                {formatDateTime(last.actedAt)} · {consentSource(last)}
              </span>
            ) : (
              <EmptyCell />
            );
          },
        }),
      ]),
    [],
  );

  const eventColumns = useMemo(
    () =>
      eventCol.columns([
        eventCol.accessor("consentType", {
          header: "الموافقة",
          enableSorting: false,
          cell: (info) => CONSENT_LABELS[info.getValue()],
        }),
        eventCol.accessor("action", {
          header: "الإجراء",
          enableSorting: false,
          cell: (info) => (
            <StatusBadge kind="consent" value={info.getValue() === "GRANTED" ? "GRANTED" : "NOT_GRANTED"} />
          ),
        }),
        eventCol.display({
          id: "source",
          header: "بواسطة",
          cell: (info) => consentSource(info.row.original),
        }),
        eventCol.accessor("actedAt", {
          header: "التاريخ",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
      ]),
    [],
  );

  const invitationColumns = useMemo(
    () =>
      invitationCol.columns([
        invitationCol.accessor("email", {
          header: "البريد",
          cell: (info) => (
            <PrimaryCell
              label={<span dir="ltr">{info.getValue()}</span>}
              description={info.row.original.fullNameAr}
            />
          ),
        }),
        invitationCol.accessor("roleNameAr", { header: "الدور" }),
        invitationCol.accessor("expiresAt", {
          header: "تنتهي",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
      ]),
    [],
  );

  const pending = (invitations.data ?? []).filter(
    (invitation) => invitation.partnerId === partner.id,
  );

  return (
    <div className="space-y-8">
      <Section
        title="موافقة الإظهار"
        description="إظهار اسم الجهة وشعارها علنًا مشروط بموافقتها، وكل منح وسحب يُسجَّل."
      >
        <DataTable
          caption="موافقات الإظهار"
          columns={consentColumns}
          data={rows}
          getRowId={(row) => row.type}
          pagination={false}
          empty={{ title: "لا موافقات" }}
          rowActions={(row) => [
            {
              key: "grant",
              label: `منح «${row.label}»`,
              icon: Check,
              quick: true,
              requires: [CAPABILITIES.partnersConsentManage],
              hidden: row.granted,
              loading: grant.isPendingFor((type) => type === row.type),
              onSelect: () => grant.mutate(row.type),
            },
            {
              key: "revoke",
              label: `سحب «${row.label}»`,
              icon: X,
              destructive: true,
              requires: [CAPABILITIES.partnersConsentManage],
              hidden: !row.granted,
              onSelect: () =>
                void confirm({
                  title: `سحب موافقة «${row.label}» عن «${partner.displayNameAr}»؟`,
                  description: `يُسجَّل السحب في سجل الموافقات، ولا يُستعمل ${row.subject} علنًا حتى تُمنح الموافقة من جديد.`,
                  confirmLabel: "سحب الموافقة",
                  destructive: true,
                  successMessage: "سُحبت الموافقة.",
                  onConfirm: async () =>
                    apply(await recordConsent(partner.id, row.type, "REVOKED")),
                }),
            },
          ]}
        />
      </Section>

      <Section title="سجل الموافقات" description="كل منح وسحب، من الإدارة أو من الجهة في بوابتها.">
        <DataTable
          caption="سجل الموافقات"
          columns={eventColumns}
          data={events}
          getRowId={(event) => event.id}
          empty={{ title: "لم تُسجَّل موافقة بعد" }}
        />
      </Section>

      {can(CAPABILITIES.invitationsManage) ? (
        <Section
          title="دعوات الممثلين المعلّقة"
          description="الممثل يدخل البوابة بعد قبول دعوته، ونطاقه جهته وحدها."
          actions={[
            {
              key: "invite",
              label: "دعوة ممثل",
              icon: UserPlus,
              hidden: !canInvite,
              onSelect: onInvite,
            },
          ]}
        >
          <DataTable
            caption="دعوات الممثلين المعلّقة"
            columns={invitationColumns}
            data={invitations.isPending ? undefined : pending}
            isLoading={invitations.isPending}
            error={invitations.error}
            onRetry={() => void invitations.refetch()}
            getRowId={(invitation) => invitation.id}
            pagination={false}
            empty={{
              title: "لا دعوات معلّقة",
              description: canInvite
                ? "ادعُ ممثلًا عن الجهة ليدخل بوابتها."
                : "تُرسل الدعوات بعد تفعيل الجهة.",
            }}
            rowActions={(invitation) => [
              {
                key: "revoke",
                label: "إلغاء الدعوة",
                icon: X,
                destructive: true,
                requires: [CAPABILITIES.invitationsManage],
                onSelect: () =>
                  void confirm({
                    title: `إلغاء الدعوة المرسلة إلى ${invitation.email}؟`,
                    description: "يتوقف الرابط عن العمل فورًا. يمكن إرسال دعوة جديدة لاحقًا.",
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
        </Section>
      ) : null}
    </div>
  );
}
