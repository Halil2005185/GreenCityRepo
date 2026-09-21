"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { useMemo } from "react";

import { DueFollowUps } from "@/components/media/due-follow-ups";
import { MediaContactCreateDialog } from "@/components/media/media-dialogs";
import { useMediaActions } from "@/components/media/use-media-actions";
import {
  sinceLabel,
  useMediaChannels,
  useRelationshipTypes,
} from "@/components/relations/classification";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Select, type SelectOption } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, SearchInput, Toolbar } from "@/components/ui/toolbar";
import {
  HORIZON_LABELS,
  MEDIA_STAGES,
  listMediaContacts,
  type MediaContactSummary,
} from "@/lib/api/media";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { statusOptions } from "@/lib/status";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

const STALE_FILTERS: SelectOption[] = [
  { value: "30", label: "لم نكلّمه منذ شهر" },
  { value: "90", label: "منذ ٣ أشهر" },
];

const col = columnHelper<MediaContactSummary>();

const FOLLOW_UPS = {
  one: "متابعة واحدة",
  two: "متابعتان",
  few: "متابعات",
  many: "متابعة",
  other: "متابعة",
};

/** «جهاز» الشخص في سطر واحد: المسمى ثم جهته الشريكة أو جهة عمله. */
function affiliation(contact: MediaContactSummary) {
  const place = contact.partnerNameAr ?? contact.outletNameAr;

  return [contact.jobTitleAr, place].filter(Boolean).join(" — ") || null;
}

export default function MediaPage() {
  const [filters, setFilters, resetFilters] = useUrlState({
    q: "",
    stage: "",
    priority: "",
    channel: "",
    relationship: "",
    stale: "",
    followUp: "",
    new: "",
  });
  const mediaActions = useMediaActions();
  const channels = useMediaChannels();
  const relationshipTypes = useRelationshipTypes();

  const contacts = useQuery({
    queryKey: [
      "media",
      "contacts",
      {
        q: filters.q,
        stage: filters.stage,
        priority: filters.priority,
        channel: filters.channel,
        relationship: filters.relationship,
        stale: filters.stale,
        followUp: filters.followUp,
      },
    ],
    queryFn: () =>
      listMediaContacts({
        q: filters.q,
        stage: filters.stage,
        priority: filters.priority,
        channelId: filters.channel,
        relationshipTypeId: filters.relationship,
        hasOpenFollowUp: filters.followUp === "1",
        ...(filters.stale ? { staleDays: Number(filters.stale) } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("fullNameAr", {
          header: "الاسم",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/media/${info.row.original.id}`}
              description={affiliation(info.row.original)}
              badge={
                info.row.original.openFollowUps > 0 ? (
                  <Badge tone="warning">{countAr(info.row.original.openFollowUps, FOLLOW_UPS)}</Badge>
                ) : null
              }
            />
          ),
        }),
        col.accessor("stage", {
          header: "المرحلة",
          enableSorting: false,
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <StatusBadge kind="mediaStage" value={info.getValue()} />,
        }),
        col.accessor("priority", {
          header: "الأولوية",
          enableSorting: false,
          cell: (info) => {
            const { relationshipTypeNameAr, horizon } = info.row.original;
            const detail = [relationshipTypeNameAr, horizon && HORIZON_LABELS[horizon]]
              .filter(Boolean)
              .join(" · ");

            return (
              <div className="min-w-24 space-y-1">
                <StatusBadge kind="contactPriority" value={info.getValue()} />
                {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
              </div>
            );
          },
        }),
        col.accessor("channels", {
          header: "شكل العمل",
          enableSorting: false,
          cell: (info) =>
            info.getValue().length > 0 ? (
              <div className="flex max-w-56 flex-wrap gap-1">
                {info.getValue().map((channel) => (
                  <Badge key={channel.id} tone="accent">
                    {channel.nameAr}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyCell />
            ),
        }),
        col.display({
          id: "reach",
          header: "التواصل",
          cell: (info) => {
            const { phone, email } = info.row.original;

            if (!phone && !email) return <EmptyCell />;

            // الحاوية باتجاه الصفحة والروابط وحدها `ltr`: كانت الحاوية كلها
            // `ltr` فتلتصق الأرقام بطرف العمود المقابل لعنوانه.
            return (
              <div className="space-y-0.5 text-xs">
                {phone ? (
                  <a href={`tel:${phone}`} dir="ltr" className="block w-fit hover:underline">
                    {phone}
                  </a>
                ) : null}
                {email ? (
                  <a href={`mailto:${email}`} dir="ltr" className="block w-fit text-primary hover:underline">
                    {email}
                  </a>
                ) : null}
              </div>
            );
          },
        }),
        col.accessor((contact) => contact.lastContactAt ?? undefined, {
          id: "lastContactAt",
          header: "آخر تواصل",
          sortUndefined: "last",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const value = info.getValue();

            return value ? (
              <span title={formatDate(value)}>{sinceLabel(value)}</span>
            ) : (
              <span className="text-destructive">لم يُتواصل بعد</span>
            );
          },
        }),
      ]),
    [],
  );

  const activeCount = [
    filters.stage,
    filters.priority,
    filters.channel,
    filters.relationship,
    filters.stale,
    filters.followUp,
  ].filter(Boolean).length;
  const hasFilters = Boolean(filters.q) || activeCount > 0;

  const openCreate = () => setFilters({ new: "1" }, { keepPage: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الشبكة الإعلامية"
        description="صنّاع المحتوى والإعلاميون — سجل أشخاص مستقل عن سجل الشركاء، مصنّف بشكل العمل وأولوية التواصل."
        primaryAction={{
          key: "create",
          label: "إضافة شخص",
          icon: Plus,
          requires: [CAPABILITIES.mediaManage],
          onSelect: openCreate,
        }}
        secondaryActions={[
          {
            key: "taxonomy",
            label: "المرجعيات",
            icon: Settings2,
            href: "/dashboard/media/taxonomy",
            requires: [CAPABILITIES.relationsTaxonomyManage],
          },
        ]}
      />

      <DueFollowUps />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="اسم، جهة، هاتف…"
              label="البحث في الشبكة الإعلامية"
            />
          }
          hasActiveFilters={hasFilters}
          activeCount={activeCount}
          onReset={resetFilters}
        >
          <FilterChips
            label="المتابعة"
            value={filters.followUp}
            onChange={(followUp) => setFilters({ followUp })}
            options={[
              { value: "", label: "الكل" },
              { value: "1", label: "بمتابعة مفتوحة" },
            ]}
          />
          <Select
            size="sm"
            label="المرحلة"
            placeholder="الكل"
            className="w-40"
            clearable
            options={statusOptions("mediaStage", MEDIA_STAGES)}
            value={filters.stage || null}
            onChange={(stage) => setFilters({ stage })}
          />
          <Select
            size="sm"
            label="الأولوية"
            placeholder="الكل"
            className="w-40"
            clearable
            options={statusOptions("contactPriority")}
            value={filters.priority || null}
            onChange={(priority) => setFilters({ priority })}
          />
          <Select
            size="sm"
            label="شكل العمل"
            placeholder="الكل"
            className="w-44"
            clearable
            loading={channels.isPending}
            options={(channels.data ?? []).map((channel) => ({
              value: channel.id,
              label: channel.nameAr,
            }))}
            value={filters.channel || null}
            onChange={(channel) => setFilters({ channel })}
          />
          <Select
            size="sm"
            label="نوع العلاقة"
            placeholder="الكل"
            className="w-44"
            clearable
            loading={relationshipTypes.isPending}
            options={(relationshipTypes.data ?? []).map((type) => ({
              value: type.id,
              label: type.nameAr,
            }))}
            value={filters.relationship || null}
            onChange={(relationship) => setFilters({ relationship })}
          />
          <Select
            size="sm"
            label="آخر تواصل"
            placeholder="أي تاريخ"
            className="w-48"
            clearable
            options={STALE_FILTERS}
            value={filters.stale || null}
            onChange={(stale) => setFilters({ stale })}
          />
        </Toolbar>

        <DataTable
          caption="الشبكة الإعلامية"
          columns={columns}
          data={contacts.data}
          getRowId={(contact) => contact.id}
          isLoading={contacts.isPending}
          error={contacts.error}
          onRetry={() => void contacts.refetch()}
          urlState
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{
            title: "لا أحد في الشبكة بعد",
            description: "أضف أول صانع محتوى أو إعلامي لتبدأ متابعة التواصل معه.",
            action: {
              key: "create",
              label: "إضافة شخص",
              icon: Plus,
              requires: [CAPABILITIES.mediaManage],
              onSelect: openCreate,
            },
          }}
          rowHref={(contact) => `/dashboard/media/${contact.id}`}
          rowActions={(contact) => {
            const actions = mediaActions.actions(contact);

            return [
              { ...actions.log, quick: true },
              actions.open,
              actions.edit,
              actions.classification,
              actions.stage,
            ];
          }}
        />
      </div>

      <MediaContactCreateDialog
        open={filters.new === "1"}
        onOpenChange={(open) => setFilters({ new: open ? "1" : null }, { keepPage: true })}
      />
      {mediaActions.dialogs}
    </div>
  );
}
