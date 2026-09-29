"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import {
  AUDIENCE_LABELS,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  type FieldAnnouncements,
  type FieldGroup,
  type FieldManagedAnnouncement,
} from "@/lib/api/field";
import type { InitiativeDetail } from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { countAr } from "@/lib/text/plural-ar";

const MANAGE = [CAPABILITIES.fieldManage] as const;

export const announcementsKey = (initiativeId: string) =>
  ["field-announcements", initiativeId] as const;

const DEVICES = {
  one: "جهاز واحد",
  two: "جهازين",
  few: "أجهزة",
  many: "جهازًا",
  other: "جهاز",
};

const col = columnHelper<FieldManagedAnnouncement>();

/** «وصل 12 من 14» — وما لم يصل بعدُ يُقال، لا يُحسب وصولًا. */
function Delivery({ devices }: { devices: FieldManagedAnnouncement["devices"] }) {
  if (devices.targeted === 0) return <EmptyCell />;

  return (
    <div className="space-y-0.5">
      <p>
        <span className="numeric">{devices.sent}</span> من{" "}
        <span className="numeric">{devices.targeted}</span>
      </p>
      {devices.pending > 0 ? (
        <p className="text-xs text-muted-foreground">
          قيد الإرسال: <span className="numeric">{devices.pending}</span>
        </p>
      ) : devices.failed > 0 ? (
        <p className="text-xs text-muted-foreground">
          لم يصل: <span className="numeric">{devices.failed}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * إعلانات المنسّق للميدان: «تغيّر الموعد»، «اللقاء عند البوابة الشرقية».
 *
 * الإعلان يظهر في ورقة القائد وبطاقة المتطوع لكل من يفتحهما، ويُرسَل إشعارًا
 * لمن فعّل الإشعارات على هاتفه. عمود «وصل الأجهزة» عن الإشعار وحده.
 */
export function AnnouncementsSection({
  initiative,
  groups,
}: {
  initiative: InitiativeDetail;
  groups: readonly FieldGroup[];
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = announcementsKey(initiative.id);

  const announcements = useQuery({
    queryKey: key,
    queryFn: () => listAnnouncements(initiative.id),
    // الإشعارات يرسلها عامل خلف الطلب: العدّاد يلحق به ما دام فيه ما ينتظر.
    refetchInterval: (query) =>
      query.state.data?.announcements.some((item) => item.devices.pending > 0)
        ? 5000
        : false,
  });

  const apply = (next: FieldAnnouncements) => queryClient.setQueryData(key, next);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("titleAr", {
          header: "الإعلان",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={
                <span className="line-clamp-2 whitespace-pre-line">
                  {info.row.original.bodyAr}
                </span>
              }
            />
          ),
        }),
        col.accessor((row) => row.groupNameAr ?? undefined, {
          id: "group",
          header: "لمن",
          sortUndefined: "last",
          cell: (info) => (
            <div className="space-y-1">
              <p>{info.getValue() ?? "كل المجموعات"}</p>
              <Badge tone="outline">{AUDIENCE_LABELS[info.row.original.audience]}</Badge>
            </div>
          ),
        }),
        col.accessor((row) => row.devices.sent, {
          id: "devices",
          header: "وصل الأجهزة",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => <Delivery devices={info.row.original.devices} />,
        }),
        col.accessor("createdAt", {
          header: "أُعلن",
          cell: (info) => (
            <div className="space-y-0.5">
              {cells.dateTime(info.getValue())}
              {info.row.original.createdByNameAr ? (
                <p className="text-xs text-muted-foreground">
                  {info.row.original.createdByNameAr}
                </p>
              ) : null}
            </div>
          ),
        }),
      ]),
    [],
  );

  const add = {
    key: "announce",
    label: "إعلان جديد",
    icon: Megaphone,
    requires: MANAGE,
    disabled: groups.length === 0,
    disabledReason: "كوّن مجموعة أولًا: الإعلان يصل أعضاء المجموعات وقادتها.",
    onSelect: () => setOpen(true),
  };

  return (
    <Section
      title="الإعلانات"
      description="ما يتغيّر قبل اليوم وأثناءه. يظهر في التطبيق لكل من يفتحه، ويصل إشعارًا من فعّل الإشعارات على هاتفه."
      actions={[add]}
    >
      {announcements.data && !announcements.data.pushEnabled ? (
        <Alert variant="info">
          الإشعارات غير مفعّلة على الخادم، فالإعلان يظهر في التطبيق ولا يُرسَل
          إشعارًا. تفعيلها بمفاتيح VAPID في بيئة الخادم.
        </Alert>
      ) : null}

      <DataTable
        caption="إعلانات الميدان"
        columns={columns}
        data={announcements.data?.announcements}
        getRowId={(row) => row.id}
        isLoading={announcements.isPending}
        error={announcements.error}
        onRetry={() => void announcements.refetch()}
        pagination={{ mode: "client", pageSize: 5 }}
        empty={{
          title: "لا إعلانات بعد",
          description:
            "تغيّر موعد أو مكان؟ أعلنه هنا فيقرؤه القادة والمتطوعون في تطبيقهم.",
          action: add,
        }}
        rowActions={(row) => [
          {
            key: "delete",
            label: "حذف الإعلان",
            icon: Trash2,
            destructive: true,
            requires: MANAGE,
            onSelect: () =>
              void confirm({
                title: `حذف «${row.titleAr}»؟`,
                description:
                  "يختفي من التطبيق، ويتوقف ما لم يُرسَل من إشعاراته. ما وصل هاتفًا لا يُستردّ.",
                confirmLabel: "حذف الإعلان",
                destructive: true,
                successMessage: "حُذف الإعلان.",
                onConfirm: async () =>
                  apply(await deleteAnnouncement(initiative.id, row.id)),
              }),
          },
        ]}
      />

      <AnnouncementDialog
        initiativeId={initiative.id}
        groups={groups}
        open={open}
        onOpenChange={setOpen}
        onCreated={apply}
      />
    </Section>
  );
}

const schema = z.object({
  groupId: z.string(),
  audience: z.enum(["ALL", "LEADS", "VOLUNTEERS"]),
  titleAr: z
    .string()
    .trim()
    .min(2, "اكتب عنوان الإعلان.")
    .max(120, "العنوان طويل: يُقرأ في سطر إشعار."),
  bodyAr: z
    .string()
    .trim()
    .min(2, "اكتب نص الإعلان.")
    .max(600, "النص طويل: الإعلان يُقرأ في الميدان."),
});

type Values = z.infer<typeof schema>;

const EMPTY: Values = { groupId: "", audience: "ALL", titleAr: "", bodyAr: "" };

function AnnouncementDialog({
  initiativeId,
  groups,
  open,
  onOpenChange,
  onCreated,
}: {
  initiativeId: string;
  groups: readonly FieldGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (next: FieldAnnouncements) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  return (
    <FormDialog<Values, FieldAnnouncements>
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="إعلان جديد للميدان"
      description="اكتبه كما يُقرأ في إشعار: ما الذي تغيّر، وما المطلوب. لا يُعدَّل بعد إرساله."
      form={form}
      values={EMPTY}
      submitLabel="أعلن"
      onSubmit={(values) =>
        createAnnouncement(initiativeId, {
          ...(values.groupId ? { groupId: values.groupId } : {}),
          audience: values.audience,
          titleAr: values.titleAr,
          bodyAr: values.bodyAr,
        })
      }
      successMessage={(result) => {
        const devices = result.announcements[0]?.devices.targeted ?? 0;

        return devices > 0
          ? `أُعلن، ويُرسَل إشعاره إلى ${countAr(devices, DEVICES)}.`
          : "أُعلن، ويظهر في التطبيق لمن يفتحه.";
      }}
      onSuccess={onCreated}
      fieldForError={(error) => (error.status === 422 ? "groupId" : null)}
    >
      <SelectField
        control={form.control}
        name="groupId"
        label="المجموعة"
        clearable
        placeholder="كل مجموعات المبادرة"
        options={groups.map((group) => ({
          value: group.id,
          label: group.nameAr,
          description: group.siteNameAr,
        }))}
      />
      <SelectField
        control={form.control}
        name="audience"
        label="لمن"
        options={(["ALL", "LEADS", "VOLUNTEERS"] as const).map((value) => ({
          value,
          label: AUDIENCE_LABELS[value],
        }))}
      />
      <TextField
        control={form.control}
        name="titleAr"
        label="العنوان"
        placeholder="تغيّر موعد اللقاء"
      />
      <TextareaField
        control={form.control}
        name="bodyAr"
        label="النص"
        rows={4}
        placeholder="نلتقي عند التاسعة لا الثامنة، عند البوابة الشرقية."
      />
    </FormDialog>
  );
}
