"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { lookupLabel } from "@/components/lookups/lookup-select";
import {
  CharterSection,
  ContactsSection,
  FollowUpSection,
  PartnershipsSection,
  PortalSection,
} from "@/components/partners/partner-sections";
import { usePartnerActions } from "@/components/partners/use-partner-actions";
import { classificationItems } from "@/components/relations/classification";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/card";
import { Checklist } from "@/components/ui/checklist";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DetailSkeleton, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { UrlTabs } from "@/components/ui/url-tabs";
import { ApiError } from "@/lib/api/client";
import { getPartner } from "@/lib/api/partners";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils";

const BREADCRUMB_ROOT = { label: "الشركاء", href: "/dashboard/partners" };

/**
 * ملف الجهة بعمود واحد: الترويسة بأفعالها، ثم ملخص «مفتاح: قيمة»، ثم
 * شروط الاعتماد ما دامت الجهة غير مفعّلة، ثم تبويبات لمجموعاتها. كانت
 * ثلاثة أعمدة غير متوازنة وخمسة نماذج مفتوحة في الصفحة؛ صارت كل إضافة
 * وتعديل نافذة تُفتح من زرها.
 */
export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const { can } = useAuth();
  const partnerActions = usePartnerActions();

  const partner = useQuery({
    queryKey: ["partner", partnerId],
    queryFn: () => getPartner(partnerId),
  });

  if (partner.isPending) return <DetailSkeleton />;

  if (partner.isError) {
    const notFound = partner.error instanceof ApiError && partner.error.status === 404;

    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[BREADCRUMB_ROOT]} title="ملف الجهة" />
        <div className="rounded-xl border border-border bg-card">
          <ErrorState
            title={notFound ? "لا توجد جهة بهذا الرابط." : "تعذّر تحميل ملف الجهة."}
            error={notFound ? undefined : partner.error}
            onRetry={notFound ? undefined : () => void partner.refetch()}
          />
        </div>
      </div>
    );
  }

  const data = partner.data;
  const actions = partnerActions.actions(data);
  const activate = partnerActions.activate(data);
  const isActive = data.stage === "ACTIVE";

  // زر أساسي واحد بحسب حال الجهة: اعتمادها قبل التفعيل، ودعوة ممثليها
  // بعده، ورفع التعليق حين تكون معلّقة.
  const primaryAction = data.isSuspended
    ? actions.restore
    : isActive
      ? actions.invite
      : activate;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[BREADCRUMB_ROOT, { label: data.displayNameAr }]}
        title={data.displayNameAr}
        description={
          <>
            {data.legalNameAr}
            {data.activatedAt ? ` · معتمدة منذ ${formatDate(data.activatedAt)}` : ""}
          </>
        }
        badges={
          <>
            <StatusBadge kind="partnerStage" value={data.stage} />
            {data.isSuspended ? <Badge tone="danger">معلّقة</Badge> : null}
          </>
        }
        primaryAction={primaryAction}
        secondaryActions={[actions.stage]}
        menuActions={[actions.classification, actions.suspend]}
      />

      {data.isSuspended && data.suspensionReasonAr ? (
        <Alert>سبب التعليق: {data.suspensionReasonAr}</Alert>
      ) : null}
      {data.stage === "REJECTED" && data.rejectionReasonAr ? (
        <Alert>سبب الرفض: {data.rejectionReasonAr}</Alert>
      ) : null}

      <DescriptionList
        items={[
          { label: "نوع الجهة", value: lookupLabel(data.organizationKind) },
          ...classificationItems({
            priority: data.contactPriority,
            horizon: data.engagementHorizon,
            relationshipType: data.relationshipType,
            channels: data.mediaChannels,
            lastContactAt: data.lastContactAt,
          }),
          { label: "مسؤول العلاقة", value: data.accountManagerNameAr },
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
          {
            label: "أشكال المشاركة والدعم",
            wide: true,
            value:
              data.supportForms.length > 0
                ? data.supportForms.map(lookupLabel).join("، ")
                : null,
          },
          { label: "نبذة", wide: true, value: data.summaryAr },
          {
            label: "ملاحظات داخلية",
            wide: true,
            // الخادم لا يرسلها لمن لا يملك صلاحية الاطلاع عليها.
            hidden: data.internalNotesAr === null,
            value: <span className="whitespace-pre-wrap font-normal">{data.internalNotesAr}</span>,
          },
        ]}
      />

      {!isActive && data.stage !== "REJECTED" && data.stage !== "ENDED" ? (
        <Section
          title="شروط الاعتماد"
          description="تُحسب في الخادم من بيانات الجهة؛ حين تكتمل يتاح الاعتماد والتفعيل."
          variant="card"
        >
          <Checklist
            items={data.activation.requirements.map((requirement) => ({
              key: requirement.key,
              label: requirement.labelAr,
              done: requirement.satisfied,
            }))}
          />
          {can(CAPABILITIES.partnersApprove) ? null : (
            <p className="mt-3 text-xs text-muted-foreground">
              الاعتماد النهائي من صلاحية المدير العام.
            </p>
          )}
        </Section>
      ) : null}

      <UrlTabs
        label="أقسام ملف الجهة"
        tabs={[
          {
            value: "contacts",
            label: "جهات الاتصال",
            count: data.contacts.length,
            content: (
              <ContactsSection
                partner={data}
                onInvite={(contact) =>
                  partnerActions.inviteContact(data, contact.email ?? "", contact.fullNameAr)
                }
              />
            ),
          },
          {
            value: "partnerships",
            label: "أنواع الشراكة",
            count: data.partnerships.length,
            content: <PartnershipsSection partner={data} />,
          },
          {
            value: "charter",
            label: "الميثاق",
            count: data.acknowledgements.length,
            content: <CharterSection partner={data} />,
          },
          {
            value: "follow-up",
            label: "سجل المتابعة",
            count: data.interactions.length,
            content: <FollowUpSection partner={data} />,
          },
          {
            value: "portal",
            label: "البوابة",
            content: <PortalSection partner={data} onInvite={() => actions.invite.onSelect()} />,
          },
        ]}
      />

      {partnerActions.dialogs}
    </div>
  );
}
