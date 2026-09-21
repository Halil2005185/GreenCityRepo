"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { DescriptionList } from "@/components/ui/description-list";
import { FormDialog } from "@/components/ui/form-dialog";
import { TextField, TextareaField } from "@/components/ui/form-fields";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DetailSkeleton, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ORGANIZATION_KIND_LABELS,
  PARTNERSHIP_TYPE_LABELS,
  SUPPORT_FORM_LABELS,
  getMyOrganization,
  updateMyDisplayConsent,
  updateMyOrganization,
  type Partnership as AdminPartnership,
  type PartnerSelf,
  type PartnershipType,
  type SupportForm,
} from "@/lib/api/partners";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils";

type ConsentKey = "publicNameConsent" | "publicLogoConsent";
type ConsentRow = { key: ConsentKey; label: string; effect: string; granted: boolean };
type Partnership = PartnerSelf["partnerships"][number];
/** العقد يصف حالة الشراكة في البوابة نصًا؛ قيمها قيم الإدارة نفسها. */
type PartnershipStatus = AdminPartnership["status"];
type Contact = PartnerSelf["contacts"][number];
type Acknowledgement = PartnerSelf["acknowledgements"][number];

const consentCol = columnHelper<ConsentRow>();
const partnershipCol = columnHelper<Partnership>();
const contactCol = columnHelper<Contact>();
const ackCol = columnHelper<Acknowledgement>();

// ── تعديل ملف الجهة ─────────────────────────────────────────────────────

const profileSchema = z.object({
  displayNameAr: z.string().trim().min(2, "الاسم المعروض مطلوب.").max(200, "الاسم طويل جدًا."),
  nameEn: z.string().trim().max(200, "الاسم طويل جدًا."),
  websiteUrl: z.union([z.url("رابط غير صالح.").max(500, "الرابط طويل جدًا."), z.literal("")]),
  summaryAr: z.string().trim().max(2000, "النبذة طويلة جدًا."),
});

type ProfileValues = z.infer<typeof profileSchema>;

/**
 * ملف الجهة العلني بأيدي ممثليها — المسار قائم في الـAPI ولم تكن له واجهة،
 * فكان كل تصحيح لاسم أو رابط يمرّ عبر مكتب العلاقات. الاسم القانوني وأنواع
 * الشراكة خارج هذا النموذج: تلك يعتمدها الفريق.
 */
function ProfileDialog({
  organization,
  open,
  onOpenChange,
}: {
  organization: PartnerSelf;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayNameAr: "", nameEn: "", websiteUrl: "", summaryAr: "" },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="تعديل ملف الجهة"
      description="ما يظهر عن جهتكم في صفحات المشروع حين تمنحون موافقة الإظهار."
      form={form}
      values={{
        displayNameAr: organization.displayNameAr,
        nameEn: organization.nameEn ?? "",
        websiteUrl: organization.websiteUrl ?? "",
        summaryAr: organization.summaryAr ?? "",
      }}
      submitLabel="حفظ الملف"
      onSubmit={(values) =>
        updateMyOrganization({
          displayNameAr: values.displayNameAr,
          // الحقول الاختيارية تُرسل حين تُكتب فقط: العقد لا يقبل مسحها بـnull.
          ...(values.nameEn ? { nameEn: values.nameEn } : {}),
          ...(values.websiteUrl ? { websiteUrl: values.websiteUrl } : {}),
          ...(values.summaryAr ? { summaryAr: values.summaryAr } : {}),
        })
      }
      successMessage="حُفظ ملف الجهة."
      onSuccess={(updated) => queryClient.setQueryData(["my-organization"], updated)}
    >
      <TextField control={form.control} name="displayNameAr" label="الاسم المعروض" />
      <TextField
        control={form.control}
        name="nameEn"
        label="الاسم بالإنجليزية (اختياري)"
        dir="ltr"
        className="text-start"
      />
      <TextField
        control={form.control}
        name="websiteUrl"
        label="الموقع الإلكتروني (اختياري)"
        dir="ltr"
        className="text-start"
        placeholder="https://…"
      />
      <TextareaField control={form.control} name="summaryAr" label="نبذة (اختيارية)" rows={4} />
    </FormDialog>
  );
}

// ── الصفحة ──────────────────────────────────────────────────────────────

/**
 * بوابة الشريك بعمود واحد: ترويسة بفعل تعديل الملف، وملخص الجهة، ثم أقسام
 * موافقة الإظهار والشراكات وجهات الاتصال والإقرار. كانت بطاقتين متجاورتين
 * وأزرار «منح/سحب» تحفظ فورًا بلا إشعار؛ السحب الآن بتأكيد يشرح أثره.
 */
export default function PartnerPortalPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const organization = useQuery({ queryKey: ["my-organization"], queryFn: getMyOrganization });

  const grant = useApiMutation({
    mutationFn: (row: ConsentRow) => updateMyDisplayConsent({ [row.key]: true }),
    successMessage: (_, row) => `مُنحت موافقة «${row.label}».`,
    errorFallback: "تعذّر منح الموافقة.",
    onSuccess: (updated) => queryClient.setQueryData(["my-organization"], updated),
  });

  const consentColumns = useMemo(
    () =>
      consentCol.columns([
        consentCol.accessor("label", {
          header: "الموافقة",
          enableSorting: false,
          cell: (info) => <PrimaryCell label={info.getValue()} description={info.row.original.effect} />,
        }),
        consentCol.accessor("granted", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="consent" value={info.getValue() ? "GRANTED" : "NOT_GRANTED"} />,
        }),
      ]),
    [],
  );

  const partnershipColumns = useMemo(
    () =>
      partnershipCol.columns([
        partnershipCol.accessor("type", {
          header: "النوع",
          enableSorting: false,
          cell: (info) => PARTNERSHIP_TYPE_LABELS[info.getValue() as PartnershipType] ?? info.getValue(),
        }),
        partnershipCol.accessor("status", {
          header: "الحالة",
          enableSorting: false,
          cell: (info) => (
            <StatusBadge kind="partnershipStatus" value={info.getValue() as PartnershipStatus} />
          ),
        }),
        partnershipCol.accessor((row) => row.approvedAt ?? undefined, {
          id: "approvedAt",
          header: "اعتُمدت",
          enableSorting: false,
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const contactColumns = useMemo(
    () =>
      contactCol.columns([
        contactCol.accessor("fullNameAr", {
          header: "الاسم",
          enableSorting: false,
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={info.row.original.jobTitleAr}
              badge={info.row.original.isPrimary ? <Badge tone="primary">الأساسية</Badge> : null}
            />
          ),
        }),
        contactCol.display({
          id: "reach",
          header: "التواصل",
          cell: (info) => {
            const { email, phone } = info.row.original;

            if (!email && !phone) return cells.text(null);

            return (
              <div className="space-y-0.5 text-xs">
                {email ? (
                  <a href={`mailto:${email}`} dir="ltr" className="block w-fit text-primary hover:underline">
                    {email}
                  </a>
                ) : null}
                {phone ? (
                  <a href={`tel:${phone}`} dir="ltr" className="numeric block w-fit hover:underline">
                    {phone}
                  </a>
                ) : null}
              </div>
            );
          },
        }),
      ]),
    [],
  );

  const ackColumns = useMemo(
    () =>
      ackCol.columns([
        ackCol.accessor("charterVersion", {
          header: "إصدار الميثاق",
          enableSorting: false,
          cell: (info) => (
            <span>
              الإصدار <span className="numeric">{info.getValue()}</span>
            </span>
          ),
        }),
        ackCol.accessor("acknowledgedByNameAr", {
          header: "أقرّ به",
          enableSorting: false,
          cell: (info) => cells.text(info.getValue()),
        }),
        ackCol.accessor("acknowledgedAt", {
          header: "التاريخ",
          enableSorting: false,
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  if (!user) return null;

  if (organization.isPending) return <DetailSkeleton />;

  if (organization.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={`أهلًا ${user.fullNameAr}`} />
        <div className="rounded-xl border border-border bg-card">
          <ErrorState
            title="تعذّر تحميل ملف الجهة."
            error={organization.error}
            onRetry={() => void organization.refetch()}
          />
        </div>
      </div>
    );
  }

  const data = organization.data;
  // الحساب المعلّق يقرأ ولا يغيّر ما يظهر عنه للناس حتى يُرفع التعليق.
  const writable = !data.isSuspended;

  const consents: ConsentRow[] = [
    {
      key: "publicNameConsent",
      label: "إظهار اسم الجهة",
      effect: "يظهر اسم جهتكم حيث يُعرض الشركاء علنًا.",
      granted: data.publicNameConsent,
    },
    {
      key: "publicLogoConsent",
      label: "إظهار شعار الجهة",
      effect: "يظهر شعاركم بجوار اسمكم حيث يُعرض الشركاء علنًا.",
      granted: data.publicLogoConsent,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلًا ${user.fullNameAr}`}
        description={user.partner ? `${user.partner.displayNameAr} · ${user.partner.roleNameAr}` : undefined}
        primaryAction={{
          key: "edit",
          label: "تعديل ملف الجهة",
          icon: Pencil,
          requires: [CAPABILITIES.partnerProfileManage],
          hidden: !writable,
          onSelect: () => setEditing(true),
        }}
      />

      {data.isSuspended ? (
        <Alert>
          حساب جهتكم معلّق مؤقتًا{data.suspensionReasonAr ? ` — ${data.suspensionReasonAr}` : ""}. راجعوا مكتب
          العلاقات.
        </Alert>
      ) : null}

      <DescriptionList
        items={[
          { label: "الاسم المعروض", value: data.displayNameAr },
          { label: "الاسم القانوني", value: data.legalNameAr },
          {
            label: "نوع الجهة",
            value: ORGANIZATION_KIND_LABELS[data.organizationKind as keyof typeof ORGANIZATION_KIND_LABELS] ?? null,
          },
          { label: "شريك منذ", value: data.activatedAt ? formatDate(data.activatedAt) : null },
          {
            label: "الموقع الإلكتروني",
            value: data.websiteUrl ? (
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                dir="ltr"
                className="text-primary hover:underline"
              >
                {data.websiteUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : null,
          },
          { label: "الاسم بالإنجليزية", value: data.nameEn },
          {
            label: "أشكال الدعم",
            wide: true,
            value:
              data.supportForms.length > 0
                ? data.supportForms.map((form) => SUPPORT_FORM_LABELS[form as SupportForm] ?? form).join("، ")
                : null,
          },
          { label: "نبذة", wide: true, value: data.summaryAr },
        ]}
      />

      <Section
        title="موافقة الإظهار"
        description="أنتم تقررون ظهور اسم جهتكم وشعارها. السحب متاح في أي وقت ولا يؤثر على الشراكة."
      >
        <DataTable
          caption="موافقة الإظهار"
          columns={consentColumns}
          data={consents}
          getRowId={(row) => row.key}
          pagination={false}
          empty={{ title: "لا موافقات" }}
          rowActions={(row) => [
            row.granted
              ? {
                  key: "revoke",
                  label: "سحب الموافقة",
                  icon: EyeOff,
                  destructive: true,
                  requires: [CAPABILITIES.partnerConsentManage],
                  hidden: !writable,
                  onSelect: () =>
                    void confirm({
                      title: `سحب موافقة «${row.label}»؟`,
                      description: "يتوقف الإظهار في صفحات المشروع العلنية. يمكنكم منحها من جديد في أي وقت.",
                      confirmLabel: "سحب الموافقة",
                      destructive: true,
                      successMessage: `سُحبت موافقة «${row.label}».`,
                      onConfirm: async () =>
                        queryClient.setQueryData(
                          ["my-organization"],
                          await updateMyDisplayConsent({ [row.key]: false }),
                        ),
                    }),
                }
              : {
                  key: "grant",
                  label: "منح الموافقة",
                  icon: Eye,
                  quick: true,
                  requires: [CAPABILITIES.partnerConsentManage],
                  hidden: !writable,
                  loading: grant.isPendingFor((variables) => variables.key === row.key),
                  onSelect: () => grant.mutate(row),
                },
          ]}
        />
      </Section>

      <Section title="أنواع الشراكة" description="يعتمدها فريق المشروع وفق الميثاق.">
        <DataTable
          caption="أنواع الشراكة"
          columns={partnershipColumns}
          data={data.partnerships}
          getRowId={(row) => row.type}
          pagination={false}
          empty={{ title: "لا أنواع شراكة مسجّلة بعد" }}
        />
      </Section>

      <Section title="جهات الاتصال" description="من يتواصل معهم فريق المشروع باسم جهتكم.">
        <DataTable
          caption="جهات الاتصال"
          columns={contactColumns}
          data={data.contacts}
          getRowId={(row) => row.id}
          pagination={false}
          empty={{ title: "لا جهات اتصال مسجّلة", description: "راجعوا مكتب العلاقات لإضافتها." }}
        />
      </Section>

      <Section title="الإقرار بالميثاق">
        <DataTable
          caption="الإقرار بالميثاق"
          columns={ackColumns}
          data={data.acknowledgements}
          getRowId={(row) => `${row.charterVersion}-${row.acknowledgedAt}`}
          pagination={false}
          empty={{ title: "لا إقرار مسجّل بعد" }}
        />
      </Section>

      <ProfileDialog organization={data} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
