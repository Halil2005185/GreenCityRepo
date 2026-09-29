"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Undo2 } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import {
  IMPACT_SOURCE_LABELS,
  listUnverifiedImpact,
  reverseImpact,
  verifyImpact,
  type ImpactEntry,
  type InitiativeDetail,
} from "@/lib/api/initiatives";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { CAPABILITIES } from "@/lib/auth/capabilities";

const MANAGE = [CAPABILITIES.impactManage] as const;

export const unverifiedKey = (initiativeId: string) =>
  ["impact-unverified", initiativeId] as const;

const entryCol = columnHelper<ImpactEntry>();

function formatValue(value: number, decimals: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/**
 * قيود الأثر التي تنتظر التحقق — ومنها ما سجّله القادة من الميدان.
 *
 * ما لم يُوثَّق لا يدخل «المتحقق» ولا الأرقام المعلنة، فهذا الجدول هو الباب
 * بين ما كُتب في الموقع وما يُقال للناس. التوثيق بنقرة، والتصحيح بعكسٍ
 * مكتوب السبب لا بحذف.
 */
export function PendingEntriesSection({ initiative }: { initiative: InitiativeDetail }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const entries = useQuery({
    queryKey: unverifiedKey(initiative.id),
    queryFn: () => listUnverifiedImpact(initiative.id),
  });

  /**
   * ما يُتصرَّف فيه وحده: القيد المعكوس وعكسه يتبعان بعضهما في التوثيق ولا
   * يُوثَّق أيٌّ منهما منفردًا، فعرضهما هنا صفوف بلا فعل.
   */
  const pending = useMemo(
    () =>
      entries.data?.filter(
        (entry) => entry.reversalOfId === null && entry.reversedByEntryId === null,
      ),
    [entries.data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: unverifiedKey(initiative.id) });
    // «المتحقق» و«بانتظار التحقق» في جدول الأهداف فوقه.
    void queryClient.invalidateQueries({ queryKey: ["initiative", initiative.id] });
  };

  const verify = useApiMutation({
    mutationFn: (entry: ImpactEntry) => verifyImpact(entry.id),
    successMessage: "وُثّق القيد ودخل المجاميع.",
    onSuccess: refresh,
  });

  const columns = useMemo(
    () =>
      entryCol.columns([
        entryCol.accessor("metricNameAr", {
          header: "المؤشر",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={info.row.original.scopeLabelAr}
            />
          ),
        }),
        entryCol.accessor("value", {
          header: "القيمة",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => (
            <>
              <span className="numeric font-medium">
                {formatValue(info.getValue(), info.row.original.decimals)}
              </span>{" "}
              <span className="text-muted-foreground">{info.row.original.unitAr}</span>
            </>
          ),
        }),
        entryCol.accessor("source", {
          header: "المصدر",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => (
            <Badge tone={info.getValue() === "FIELD_ENTRY" ? "primary" : "neutral"}>
              {IMPACT_SOURCE_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
        entryCol.accessor((entry) => entry.recordedByNameAr ?? undefined, {
          id: "recordedBy",
          header: "سجّله",
          sortUndefined: "last",
          cell: (info) => cells.text(info.getValue()),
        }),
        entryCol.accessor("occurredAt", {
          header: "وقته",
          sortFn: "datetime",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
        entryCol.accessor((entry) => entry.noteAr ?? undefined, {
          id: "note",
          header: "ملاحظة",
          enableSorting: false,
          cell: (info) => cells.text(info.getValue()),
        }),
      ]),
    [],
  );

  return (
    <Section
      title="قيود بانتظار التحقق"
      description="ما سُجّل ولم يُوثَّق بعد — ومنه أرقام القادة من الميدان. لا يدخل المجاميع حتى يُوثَّق."
    >
      <DataTable
        caption="قيود الأثر بانتظار التحقق"
        columns={columns}
        data={pending}
        getRowId={(entry) => entry.id}
        isLoading={entries.isPending}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        pagination={{ mode: "client", pageSize: 10 }}
        initialSorting={[{ id: "occurredAt", desc: true }]}
        empty={{
          title: "لا قيود تنتظر التحقق",
          description: "كل ما سُجّل على المبادرة ومواقعها موثَّق.",
        }}
        rowActions={(entry) => [
          {
            key: "verify",
            label: "توثيق القيد",
            icon: BadgeCheck,
            quick: true,
            requires: MANAGE,
            loading: verify.isPendingFor((pending) => pending.id === entry.id),
            onSelect: () => verify.mutate(entry),
          },
          {
            key: "reverse",
            label: "عكس القيد",
            icon: Undo2,
            destructive: true,
            requires: MANAGE,
            onSelect: () =>
              void confirm({
                title: `عكس قيد «${entry.metricNameAr}»؟`,
                description: `يُسجَّل قيد بقيمة سالبة يلغي ${formatValue(entry.value, entry.decimals)} ${entry.unitAr}، ويبقى الاثنان في الدفتر. لتصحيح رقم خاطئ: اعكسه ثم سجّل الصحيح.`,
                confirmLabel: "عكس القيد",
                destructive: true,
                reason: {
                  label: "سبب العكس",
                  placeholder: "مثال: عُدّت الأشجار مرتين في الصف الشرقي.",
                },
                successMessage: "عُكس القيد.",
                onConfirm: async ({ reason }) => {
                  await reverseImpact(entry.id, reason);
                  refresh();
                },
              }),
          },
        ]}
      />
    </Section>
  );
}
