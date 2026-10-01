"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { lookupLabel } from "@/components/lookups/lookup-select";
import { useMediaCache } from "@/components/media/media-dialogs";
import { useMediaActions } from "@/components/media/use-media-actions";
import { classificationItems } from "@/components/relations/classification";
import { Badge } from "@/components/ui/badge";
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
import { ApiError } from "@/lib/api/client";
import {
  getMediaContact,
  setFollowUpCompletion,
  type MediaInteraction,
} from "@/lib/api/media";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

const BREADCRUMB_ROOT = { label: "الشبكة الإعلامية", href: "/dashboard/media" };

const col = columnHelper<MediaInteraction>();

const OPEN_FOLLOW_UPS = {
  one: "متابعة مفتوحة",
  two: "متابعتان مفتوحتان",
  few: "متابعات مفتوحة",
  many: "متابعة مفتوحة",
  other: "متابعة مفتوحة",
};

/** حال موعد المتابعة في شارة واحدة؛ التأخر محسوب في الخادم لا بساعة المتصفح. */
function FollowUpBadge({ interaction }: { interaction: MediaInteraction }) {
  if (!interaction.dueAt) return <EmptyCell />;

  if (interaction.completedAt) {
    return <Badge tone="success">أُنجزت {formatDate(interaction.completedAt)}</Badge>;
  }

  return interaction.isOverdue ? (
    <Badge tone="danger">فات موعدها {formatDate(interaction.dueAt)}</Badge>
  ) : (
    <Badge tone="warning">تستحق {formatDate(interaction.dueAt)}</Badge>
  );
}

/**
 * ملف الشخص بعمود واحد: الترويسة بأفعالها، ثم ملخص «مفتاح: قيمة»، ثم سجل
 * التواصل. كان عمودين: نموذج تسجيل مفتوح فوق السجل، وعمود جانبي فيه رقائق
 * مرحلة تحفظ عند النقر ونموذج تصنيف يُفتح في مكانه — صارت كلها نوافذ من
 * أزرار الترويسة، والسجل جدولًا بعرض الصفحة.
 */
export default function MediaContactPage() {
  const params = useParams<{ id: string }>();
  const contactId = params.id;
  const { can } = useAuth();
  const mediaActions = useMediaActions();
  const apply = useMediaCache();

  const contact = useQuery({
    queryKey: ["media", "contact", contactId],
    queryFn: () => getMediaContact(contactId),
  });

  const followUp = useApiMutation({
    mutationFn: ({ interactionId, completed }: { interactionId: string; completed: boolean }) =>
      setFollowUpCompletion(contactId, interactionId, completed),
    successMessage: (_, { completed }) =>
      completed ? "أُغلقت المتابعة." : "أُعيد فتح المتابعة.",
    errorFallback: "تعذّر تحديث المتابعة.",
    onSuccess: apply,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("summaryAr", {
          header: "الخلاصة",
          enableSorting: false,
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={
                info.row.original.bodyAr ? (
                  <span className="block max-w-prose whitespace-pre-wrap">
                    {info.row.original.bodyAr}
                  </span>
                ) : null
              }
            />
          ),
        }),
        col.accessor("kind", {
          header: "النوع",
          enableSorting: false,
          cell: (info) => <Badge tone="accent">{lookupLabel(info.getValue())}</Badge>,
        }),
        col.display({
          id: "followUp",
          header: "المتابعة",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <FollowUpBadge interaction={info.row.original} />,
        }),
        col.accessor("recordedByNameAr", {
          header: "سجّلها",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => cells.text(info.getValue()),
        }),
        col.accessor("occurredAt", {
          header: "التاريخ",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
      ]),
    [],
  );

  if (contact.isPending) return <DetailSkeleton />;

  if (contact.isError) {
    const notFound = contact.error instanceof ApiError && contact.error.status === 404;

    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[BREADCRUMB_ROOT]} title="ملف الشخص" />
        <div className="rounded-xl border border-border bg-card">
          <ErrorState
            title={notFound ? "لا يوجد شخص بهذا الرابط." : "تعذّر تحميل الملف."}
            error={notFound ? undefined : contact.error}
            onRetry={notFound ? undefined : () => void contact.refetch()}
          />
        </div>
      </div>
    );
  }

  const person = contact.data;
  const actions = mediaActions.actions(person);
  const affiliation = [person.jobTitleAr, person.partnerNameAr ?? person.outletNameAr]
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[BREADCRUMB_ROOT, { label: person.fullNameAr }]}
        title={person.fullNameAr}
        description={affiliation || "بلا مسمى مسجَّل"}
        badges={
          <>
            <StatusBadge kind="mediaStage" value={person.stage} />
            {person.openFollowUps > 0 ? (
              <Badge tone="warning">{countAr(person.openFollowUps, OPEN_FOLLOW_UPS)}</Badge>
            ) : null}
          </>
        }
        primaryAction={actions.log}
        secondaryActions={[actions.stage]}
        menuActions={[actions.edit, actions.classification]}
      />

      <DescriptionList
        items={[
          {
            label: "الهاتف",
            value: person.phone ? (
              <a href={`tel:${person.phone}`} dir="ltr" className="numeric text-primary hover:underline">
                {person.phone}
              </a>
            ) : null,
          },
          {
            label: "البريد",
            value: person.email ? (
              <a href={`mailto:${person.email}`} dir="ltr" className="text-primary hover:underline">
                {person.email}
              </a>
            ) : null,
          },
          {
            label: "الحساب",
            value: person.profileUrl ? (
              <a
                href={person.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                فتح الحساب
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(في تبويب جديد)</span>
              </a>
            ) : null,
          },
          person.partnerId
            ? {
                label: "الجهة الشريكة",
                value: (
                  <Link
                    href={`/dashboard/partners/${person.partnerId}`}
                    className="text-primary hover:underline"
                  >
                    {person.partnerNameAr}
                  </Link>
                ),
              }
            : { label: "جهة العمل", value: person.outletNameAr },
          ...classificationItems({
            priority: person.priority,
            horizon: person.horizon,
            relationshipType: person.relationshipType,
            channels: person.channels,
            lastContactAt: person.lastContactAt,
          }),
          { label: "مسؤول العلاقة", value: person.accountManagerNameAr },
          {
            label: "ملاحظات داخلية",
            wide: true,
            // الخادم يعيدها `null` لمن لا يملك الاطلاع عليها؛ لمن يملكه
            // تظهر «—» حين تكون فارغة بدل أن يختفي الحقل.
            hidden: !can(CAPABILITIES.mediaNotesView),
            value: person.internalNotesAr ? (
              <span className="whitespace-pre-wrap font-normal">{person.internalNotesAr}</span>
            ) : null,
          },
        ]}
      />

      <Section
        title="سجل التواصل"
        description="كل مكالمة ورسالة واجتماع وتغيير مرحلة، الأحدث أولًا، ومعها مواعيد المتابعة."
      >
        <DataTable
          caption={`سجل التواصل مع ${person.fullNameAr}`}
          columns={columns}
          data={person.interactions}
          getRowId={(interaction) => interaction.id}
          empty={{
            title: "لا سجل تواصل بعد",
            description: "سجّل أول مكالمة أو رسالة، ومعها موعد المتابعة إن وُجد.",
            action: actions.log,
          }}
          rowActions={(interaction) => {
            if (!interaction.dueAt) return [];

            const loading = followUp.isPendingFor(
              (variables) => variables.interactionId === interaction.id,
            );

            return [
              interaction.completedAt
                ? {
                    key: "reopen",
                    label: "إعادة فتح المتابعة",
                    icon: RotateCcw,
                    quick: true,
                    loading,
                    requires: [CAPABILITIES.mediaManage],
                    onSelect: () =>
                      followUp.mutate({ interactionId: interaction.id, completed: false }),
                  }
                : {
                    key: "complete",
                    label: "إغلاق المتابعة",
                    icon: Check,
                    quick: true,
                    loading,
                    requires: [CAPABILITIES.mediaManage],
                    onSelect: () =>
                      followUp.mutate({ interactionId: interaction.id, completed: true }),
                  },
            ];
          }}
        />
      </Section>

      {mediaActions.dialogs}
    </div>
  );
}
