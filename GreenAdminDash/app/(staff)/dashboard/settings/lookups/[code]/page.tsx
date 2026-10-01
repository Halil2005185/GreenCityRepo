"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Power, PowerOff, Settings2, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LookupValueDialog } from "@/components/lookups/lookup-value-dialog";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, PrimaryCell, columnHelper } from "@/components/ui/data-table";
import { FormDialog } from "@/components/ui/form-dialog";
import { TextareaField, TextField } from "@/components/ui/form-fields";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterChips, SearchInput, Toolbar } from "@/components/ui/toolbar";
import {
  type LookupCode,
  type LookupList,
  type LookupValue,
  deleteLookupValue,
  getLookup,
  lookupKeys,
  reorderLookupValues,
  updateLookupList,
  updateLookupValue,
} from "@/lib/api/lookups";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { normalizeArabic } from "@/lib/text/normalize-ar";
import { countAr } from "@/lib/text/plural-ar";

const col = columnHelper<LookupValue>();

const RECORDS = { one: "سجل واحد", two: "سجلّان", few: "سجلات", many: "سجلًا", other: "سجل" };

const STATE_CHIPS = [
  { value: "", label: "الكل" },
  { value: "active", label: "المفعّلة" },
  { value: "inactive", label: "المعطّلة" },
];

// ── اسم التعريف ─────────────────────────────────────────────────────────

const listSchema = z.object({
  nameAr: z.string().trim().min(2, "الاسم قصير جدًا.").max(160, "الاسم طويل جدًا."),
  descriptionAr: z.string().trim().max(1000, "الوصف طويل جدًا."),
});

type ListForm = z.infer<typeof listSchema>;

function ListDialog({
  list,
  open,
  onOpenChange,
}: {
  list: LookupList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ListForm>({
    resolver: zodResolver(listSchema),
    defaultValues: { nameAr: "", descriptionAr: "" },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="تعديل التعريف"
      form={form}
      values={{ nameAr: list.nameAr, descriptionAr: list.descriptionAr ?? "" }}
      submitLabel="حفظ"
      onSubmit={(values) =>
        updateLookupList(list.code, {
          nameAr: values.nameAr,
          descriptionAr: values.descriptionAr || null,
        })
      }
      successMessage="حُفظ التعريف."
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: lookupKeys.all })}
    >
      <TextField control={form.control} name="nameAr" label="الاسم" maxLength={160} />
      <p className="text-xs text-muted-foreground">
        الرمز <span dir="ltr" className="font-mono">{list.code}</span> ثابت: به تقرأ الشاشات
        هذا التعريف.
      </p>
      <TextareaField control={form.control} name="descriptionAr" label="الوصف" rows={3} />
    </FormDialog>
  );
}

// ── الصفحة ──────────────────────────────────────────────────────────────

/**
 * قيم تعريف واحد: إضافة وتعديل وتفعيل وتعطيل وترتيب، وحذف ما لم يُستعمل.
 *
 * الترتيب هنا هو ترتيب القوائم المنسدلة نفسه، فالجدول لا يُفرز بالنقر على
 * رؤوسه: يُعرض كما تُعرض القائمة، ويُحرَّك بالسهمين.
 *
 * القيمة المستعملة لا تُحذف بل تُعطَّل — الخادم يرفض حذفها ويقول أين
 * استُعملت — والمقفلة (يكتبها الكود برمزها) لا تُعطَّل ولا تُحذف.
 */
export default function LookupValuesPage() {
  const params = useParams<{ code: string }>();
  const code = params.code as LookupCode;
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useUrlState({ q: "", state: "" });
  const [editing, setEditing] = useState<LookupValue | null>(null);
  const [valueOpen, setValueOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const list = useQuery({
    queryKey: lookupKeys.manage(code),
    queryFn: () => getLookup(code, { includeInactive: true, includeUsage: true }),
  });

  const values = useMemo(() => list.data?.values ?? [], [list.data]);
  const canEdit = list.data?.canEdit ?? false;

  const invalidate = [lookupKeys.all];

  const activate = useApiMutation({
    mutationFn: (value: LookupValue) => updateLookupValue(code, value.id, { isActive: true }),
    successMessage: (_, value) => `فُعّلت «${value.nameAr}».`,
    errorFallback: "تعذّر التفعيل.",
    invalidate,
  });

  const move = useApiMutation({
    mutationFn: ({ value, by }: { value: LookupValue; by: -1 | 1 }) => {
      const ids = values.map((item) => item.id);
      const from = ids.indexOf(value.id);
      const to = from + by;

      [ids[from], ids[to]] = [ids[to]!, ids[from]!];

      return reorderLookupValues(code, ids);
    },
    errorFallback: "تعذّر تغيير الترتيب.",
    invalidate,
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.display({
          id: "order",
          header: "الترتيب",
          cell: (info) => <span className="numeric text-muted-foreground">{info.row.index + 1}</span>,
        }),
        col.accessor("nameAr", {
          header: "القيمة",
          enableSorting: false,
          cell: (info) => (
            <PrimaryCell label={info.getValue()} description={info.row.original.descriptionAr} />
          ),
        }),
        col.accessor("code", {
          header: "الرمز",
          enableSorting: false,
          cell: (info) => (
            <span dir="ltr" className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {info.getValue()}
            </span>
          ),
        }),
        col.accessor("usageCount", {
          header: "الاستعمال",
          enableSorting: false,
          cell: (info) => {
            const count = info.getValue() ?? 0;

            return count > 0 ? (
              <span className="whitespace-nowrap">{countAr(count, RECORDS)}</span>
            ) : (
              <span className="text-muted-foreground">غير مستعملة</span>
            );
          },
        }),
        col.accessor((value) => (value.isActive ? ("ACTIVE" as const) : ("INACTIVE" as const)), {
          id: "state",
          header: "الحالة",
          enableSorting: false,
          cell: (info) => (
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="catalogState" value={info.getValue()} />
              {info.row.original.isSystem ? (
                <Badge tone="accent">يكتبها النظام</Badge>
              ) : info.row.original.isLocked ? (
                <Badge tone="accent">مقفلة</Badge>
              ) : null}
            </span>
          ),
        }),
      ]),
    [],
  );

  function openValue(value: LookupValue | null) {
    setEditing(value);
    setValueOpen(true);
  }

  const add = {
    key: "add",
    label: "إضافة قيمة",
    icon: Plus,
    hidden: !canEdit,
    onSelect: () => openValue(null),
  };

  const rename = {
    key: "rename",
    label: "تعديل التعريف",
    icon: Settings2,
    requires: [CAPABILITIES.lookupsManage],
    hidden: !list.data,
    onSelect: () => setListOpen(true),
  };

  const needle = normalizeArabic(filters.q.trim());
  const rows = values.filter(
    (value) =>
      (!needle ||
        normalizeArabic(value.nameAr).includes(needle) ||
        value.code.toLowerCase().includes(filters.q.trim().toLowerCase())) &&
      (filters.state === "" || value.isActive === (filters.state === "active")),
  );
  const hasFilters = Boolean(filters.q) || Boolean(filters.state);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "الإعدادات" },
          { label: "تعريفات النظام", href: "/dashboard/settings/lookups" },
          { label: list.data?.nameAr ?? "…" },
        ]}
        loading={list.isPending}
        title={list.data?.nameAr ?? ""}
        description={
          list.data ? (
            <>
              {list.data.descriptionAr ? `${list.data.descriptionAr} ` : null}
              الرمز <span dir="ltr" className="font-mono">{list.data.code}</span>
              {canEdit ? null : " — للاطلاع: تحرير قيمه لمن يعدّل السجلات التي تستعمله."}
            </>
          ) : null
        }
        primaryAction={add}
        secondaryActions={[rename]}
      />

      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="بالاسم أو الرمز…"
              label="البحث في القيم"
            />
          }
          mobile="inline"
          hasActiveFilters={hasFilters}
          onReset={() => setFilters({ q: "", state: "" })}
        >
          <FilterChips
            label="الحالة"
            options={STATE_CHIPS}
            value={filters.state}
            onChange={(state) => setFilters({ state })}
          />
        </Toolbar>

        <DataTable
          caption={list.data ? `قيم «${list.data.nameAr}»` : "القيم"}
          columns={columns}
          data={list.isPending ? undefined : rows}
          getRowId={(value) => value.id}
          isLoading={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          pagination={false}
          filtered={hasFilters}
          onClearFilters={() => setFilters({ q: "", state: "" })}
          rowClassName={(value) => (value.isActive ? undefined : "text-muted-foreground")}
          empty={{
            title: "لا قيم بعد",
            description: "ما يُضاف هنا يظهر في كل قائمة منسدلة تستعمل هذا التعريف.",
            ...(canEdit ? { action: add } : {}),
          }}
          rowActions={(value) => {
            const position = values.findIndex((item) => item.id === value.id);

            return [
              {
                key: "edit",
                label: "تعديل",
                icon: Pencil,
                quick: true,
                hidden: !canEdit,
                onSelect: () => openValue(value),
              },
              {
                key: "up",
                label: "تقديم في الترتيب",
                icon: ArrowUp,
                hidden: !canEdit || hasFilters,
                disabled: position <= 0 || move.isPending,
                onSelect: () => move.mutate({ value, by: -1 }),
              },
              {
                key: "down",
                label: "تأخير في الترتيب",
                icon: ArrowDown,
                hidden: !canEdit || hasFilters,
                disabled: position === values.length - 1 || move.isPending,
                onSelect: () => move.mutate({ value, by: 1 }),
              },
              value.isActive
                ? {
                    key: "deactivate",
                    label: "تعطيل",
                    icon: PowerOff,
                    destructive: true,
                    hidden: !canEdit,
                    disabled: value.isLocked,
                    disabledReason: "يعتمد عليها النظام، فلا تُعطَّل. يمكن تغيير اسمها.",
                    onSelect: () =>
                      void confirm({
                        title: `تعطيل «${value.nameAr}»؟`,
                        description:
                          "تختفي من القوائم المنسدلة، وتبقى على ما صُنّف بها من قبل. يمكن تفعيلها لاحقًا.",
                        confirmLabel: "تعطيل",
                        destructive: true,
                        successMessage: `عُطّلت «${value.nameAr}».`,
                        onConfirm: async () => {
                          await updateLookupValue(code, value.id, { isActive: false });
                          await queryClient.invalidateQueries({ queryKey: lookupKeys.all });
                        },
                      }),
                  }
                : {
                    key: "activate",
                    label: "تفعيل",
                    icon: Power,
                    hidden: !canEdit,
                    loading: activate.isPendingFor((variables) => variables.id === value.id),
                    onSelect: () => activate.mutate(value),
                  },
              {
                key: "delete",
                label: "حذف",
                icon: Trash2,
                destructive: true,
                hidden: !canEdit || value.isLocked,
                disabled: (value.usageCount ?? 0) > 0,
                disabledReason: "مستعملة في سجلات — عطّلها بدل حذفها.",
                onSelect: () =>
                  void confirm({
                    title: `حذف «${value.nameAr}»؟`,
                    description: "لم يُصنَّف بها أي سجل. الحذف نهائي، والتعطيل يكفي إن احتجتها لاحقًا.",
                    confirmLabel: "حذف",
                    destructive: true,
                    successMessage: `حُذفت «${value.nameAr}».`,
                    onConfirm: async () => {
                      await deleteLookupValue(code, value.id);
                      await queryClient.invalidateQueries({ queryKey: lookupKeys.all });
                    },
                  }),
              },
            ];
          }}
        />
      </div>

      {list.data ? (
        <>
          <LookupValueDialog
            code={code}
            listName={list.data.nameAr}
            value={editing}
            detailed
            takenCodes={values.map((value) => value.code)}
            open={valueOpen}
            onOpenChange={setValueOpen}
          />
          <ListDialog list={list.data} open={listOpen} onOpenChange={setListOpen} />
        </>
      ) : null}
    </div>
  );
}
