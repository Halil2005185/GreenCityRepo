"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  PrimaryCell,
  columnHelper,
} from "@/components/ui/data-table";
import { FormDialog } from "@/components/ui/form-dialog";
import { TextField, TextareaField } from "@/components/ui/form-fields";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { UrlTabs } from "@/components/ui/url-tabs";
import {
  CATALOG_LABELS,
  createCatalogEntry,
  listMediaChannels,
  listRelationshipTypes,
  updateCatalogEntry,
  type CatalogSegment,
  type MediaChannel,
} from "@/lib/api/relations";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { latinize, uniqueKey } from "@/lib/text/slug";

/** المرجعيتان بشكل واحد في العقد، فالنوع الأول يصلح للاثنتين. */
type CatalogEntry = MediaChannel;

const MANAGE = [CAPABILITIES.relationsTaxonomyManage] as const;

// ── اشتقاق المفتاح ──────────────────────────────────────────────────────

/** المفتاح من الاسم بحروف لاتينية تقريبية (`latinize`)، بلا تكرار. */
function suggestSlug(nameAr: string, existing: readonly string[]) {
  return uniqueKey(latinize(nameAr).slice(0, 60) || "item", existing);
}

// ── نافذة الإضافة والتعديل ──────────────────────────────────────────────

const entrySchema = z.object({
  nameAr: z.string().trim().min(2, "الاسم مطلوب.").max(160, "الاسم طويل جدًا."),
  slug: z.union([
    z
      .string()
      .trim()
      .min(2, "المفتاح قصير جدًا.")
      .max(64, "المفتاح طويل جدًا.")
      .regex(/^[a-z0-9-]+$/, "أحرف لاتينية صغيرة وأرقام وشرطات فقط."),
    z.literal(""),
  ]),
  descriptionAr: z.string().trim().max(1000, "الوصف طويل جدًا."),
});

type EntryValues = z.infer<typeof entrySchema>;

const EMPTY_ENTRY: EntryValues = { nameAr: "", slug: "", descriptionAr: "" };

function CatalogEntryDialog({
  segment,
  entry,
  rows,
  open,
  onOpenChange,
}: {
  segment: CatalogSegment;
  /** `null` للإضافة. */
  entry: CatalogEntry | null;
  rows: readonly CatalogEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const labels = CATALOG_LABELS[segment];
  const form = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: EMPTY_ENTRY,
  });
  const nameAr = useWatch({ control: form.control, name: "nameAr" });
  const slugs = rows.map((row) => row.slug);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={entry ? `تعديل «${entry.nameAr}»` : `إضافة ${labels.singular}`}
      description={labels.hint}
      form={form}
      values={
        entry
          ? { nameAr: entry.nameAr, slug: entry.slug, descriptionAr: entry.descriptionAr ?? "" }
          : EMPTY_ENTRY
      }
      submitLabel={entry ? "حفظ التعديل" : `إضافة ${labels.singular}`}
      onSubmit={(values) =>
        entry
          ? updateCatalogEntry(segment, entry.id, {
              nameAr: values.nameAr,
              // الفراغ يُرسل نصًا فارغًا لا `null`: العقد لا يقبل `null` هنا.
              descriptionAr: values.descriptionAr,
            })
          : createCatalogEntry(segment, {
              nameAr: values.nameAr,
              slug: values.slug || suggestSlug(values.nameAr, slugs),
              ...(values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
              // في آخر القائمة؛ الفجوة تترك مكانًا لإدراج بين عنصرين لاحقًا.
              displayOrder: Math.max(0, ...rows.map((row) => row.displayOrder)) + 10,
            })
      }
      successMessage={(saved) => (entry ? "حُفظ التعديل." : `أُضيف «${saved.nameAr}».`)}
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["relations", segment] })}
      fieldForError={(error) => (!entry && error.status === 409 ? "slug" : null)}
    >
      <TextField control={form.control} name="nameAr" label="الاسم بالعربية" maxLength={160} />
      {entry ? (
        <p className="text-xs text-muted-foreground">
          المفتاح <span dir="ltr" className="font-mono">{entry.slug}</span> ثابت لا يتغيّر بعد الحفظ.
        </p>
      ) : (
        <TextField
          control={form.control}
          name="slug"
          label="المفتاح (اختياري)"
          hint="اتركه فارغًا ليُشتق من الاسم. لا يتغيّر بعد الحفظ."
          dir="ltr"
          className="text-start font-mono"
          placeholder={nameAr.trim() ? suggestSlug(nameAr, slugs) : "street-interview"}
        />
      )}
      <TextareaField
        control={form.control}
        name="descriptionAr"
        label="وصف (اختياري)"
        hint="متى يُختار — يظهر لمن يصنّف تحت الاسم."
        rows={3}
      />
    </FormDialog>
  );
}

// ── قسم المرجعية ────────────────────────────────────────────────────────

const col = columnHelper<CatalogEntry>();

function useCatalog(segment: CatalogSegment) {
  return useQuery({
    queryKey: ["relations", segment, "all"],
    queryFn: () =>
      segment === "media-channels" ? listMediaChannels(true) : listRelationshipTypes(true),
  });
}

function CatalogSection({
  segment,
  entries,
}: {
  segment: CatalogSegment;
  entries: ReturnType<typeof useCatalog>;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const labels = CATALOG_LABELS[segment];
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [open, setOpen] = useState(false);

  const activate = useApiMutation({
    mutationFn: (entry: CatalogEntry) => updateCatalogEntry(segment, entry.id, { isActive: true }),
    successMessage: (_, entry) => `فُعّل «${entry.nameAr}».`,
    errorFallback: "تعذّر التفعيل.",
    invalidate: [["relations", segment]],
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("nameAr", {
          header: "الاسم",
          cell: (info) => (
            <PrimaryCell label={info.getValue()} description={info.row.original.descriptionAr} />
          ),
        }),
        col.accessor("slug", {
          header: "المفتاح",
          enableSorting: false,
          cell: (info) => (
            <span dir="ltr" className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {info.getValue()}
            </span>
          ),
        }),
        col.accessor((entry) => (entry.isActive ? ("ACTIVE" as const) : ("INACTIVE" as const)), {
          id: "state",
          header: "الحالة",
          cell: (info) => <StatusBadge kind="catalogState" value={info.getValue()} />,
        }),
      ]),
    [],
  );

  function openDialog(entry: CatalogEntry | null) {
    setEditing(entry);
    setOpen(true);
  }

  const add = {
    key: "add",
    label: `إضافة ${labels.singular}`,
    icon: Plus,
    requires: MANAGE,
    onSelect: () => openDialog(null),
  };

  return (
    <Section title={labels.title} description={labels.hint} actions={[add]}>
      <DataTable
        caption={labels.title}
        columns={columns}
        data={entries.data}
        getRowId={(entry) => entry.id}
        isLoading={entries.isPending}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        // ترتيب العرض من الخادم هو ترتيب قوائم الاختيار نفسه.
        pagination={false}
        empty={{
          title: `لا ${labels.title} بعد`,
          description: "ما يُضاف هنا يظهر في قوائم التصنيف في سجل الشركاء والشبكة الإعلامية.",
          action: add,
        }}
        rowActions={(entry) => [
          {
            key: "edit",
            label: "تعديل",
            icon: Pencil,
            quick: true,
            requires: MANAGE,
            onSelect: () => openDialog(entry),
          },
          entry.isActive
            ? {
                key: "deactivate",
                label: "تعطيل",
                icon: PowerOff,
                destructive: true,
                requires: MANAGE,
                onSelect: () =>
                  void confirm({
                    title: `تعطيل «${entry.nameAr}»؟`,
                    description:
                      "يختفي من قوائم الاختيار، ويبقى على من صُنّف به من قبل. يمكن تفعيله لاحقًا.",
                    confirmLabel: "تعطيل",
                    destructive: true,
                    successMessage: `عُطّل «${entry.nameAr}».`,
                    onConfirm: async () => {
                      await updateCatalogEntry(segment, entry.id, { isActive: false });
                      await queryClient.invalidateQueries({ queryKey: ["relations", segment] });
                    },
                  }),
              }
            : {
                key: "activate",
                label: "تفعيل",
                icon: Power,
                requires: MANAGE,
                loading: activate.isPendingFor((variables) => variables.id === entry.id),
                onSelect: () => activate.mutate(entry),
              },
        ]}
      />

      <CatalogEntryDialog
        segment={segment}
        entry={editing}
        rows={entries.data ?? []}
        open={open}
        onOpenChange={setOpen}
      />
    </Section>
  );
}

/**
 * مرجعيتان في تبويبين بعمود واحد، بدل لوحتين متجاورتين كان في كل منهما
 * نموذج إضافة يُفتح في مكانه.
 */
export default function RelationsTaxonomyPage() {
  // الجلب هنا لا في التبويب: العدد على التبويبين يُظهر ما في الآخر دون فتحه.
  const channels = useCatalog("media-channels");
  const types = useCatalog("relationship-types");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "الشبكة الإعلامية", href: "/dashboard/media" },
          { label: "المرجعيات" },
        ]}
        title="مرجعيات العلاقات"
        description="المفردات التي يُصنَّف بها الأشخاص والجهات. تُحرَّر من هنا دون تدخّل تقني، والتعطيل يخفيها من الاختيار ولا يمحو من صُنّف بها."
      />

      <UrlTabs
        label="المرجعيات"
        tabs={[
          {
            value: "channels",
            label: CATALOG_LABELS["media-channels"].title,
            count: channels.data?.length,
            content: <CatalogSection segment="media-channels" entries={channels} />,
          },
          {
            value: "relationship-types",
            label: CATALOG_LABELS["relationship-types"].title,
            count: types.data?.length,
            content: <CatalogSection segment="relationship-types" entries={types} />,
          },
        ]}
      />
    </div>
  );
}
