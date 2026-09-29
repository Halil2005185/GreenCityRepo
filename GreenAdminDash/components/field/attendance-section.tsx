"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/components/ui/card";
import { DataTable, PrimaryCell, cells, columnHelper } from "@/components/ui/data-table";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import {
  getAttendanceSummary,
  recordAttendanceImpact,
  type FieldAttendanceDay,
  type FieldAttendanceImpact,
} from "@/lib/api/field";
import { listMetrics, type InitiativeDetail } from "@/lib/api/initiatives";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

export const attendanceKey = (initiativeId: string) =>
  ["field-attendance", initiativeId] as const;

const dayCol = columnHelper<FieldAttendanceDay>();

const SITES = {
  one: "موقع واحد",
  two: "موقعين",
  few: "مواقع",
  many: "موقعًا",
  other: "موقع",
};

/**
 * حضور المبادرة بالأيام والمواقع، كما سجّله القادة من التطبيق.
 *
 * العدد أشخاص لا نقرات: من حضر في مجموعتين بالموقع نفسه يُعدّ مرة. ومنه
 * يُسجَّل قيد الأثر — «متطوعون مشاركون» — بنقرة، بدل أن يُعدّ باليد ويُكتب.
 */
export function AttendanceSection({ initiative }: { initiative: InitiativeDetail }) {
  const { can } = useAuth();
  const [dialog, setDialog] = useState<{ day: string | null; open: boolean }>({
    day: null,
    open: false,
  });

  const attendance = useQuery({
    queryKey: attendanceKey(initiative.id),
    queryFn: () => getAttendanceSummary(initiative.id),
  });

  const columns = useMemo(
    () =>
      dayCol.columns([
        dayCol.accessor("day", {
          header: "اليوم",
          cell: (info) => (
            <PrimaryCell
              label={formatDate(info.getValue())}
              description={info.row.original.siteNameAr}
            />
          ),
        }),
        dayCol.accessor("present", {
          header: "الحاضرون",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        dayCol.accessor((row) => row.groups.length, {
          id: "groups",
          header: "المجموعات",
          enableSorting: false,
          cell: (info) => (
            <ul className="space-y-0.5 text-sm">
              {info.row.original.groups.map((group) => (
                <li key={group.groupId}>
                  {group.nameAr}{" "}
                  <span className="numeric text-muted-foreground">{group.present}</span>
                </li>
              ))}
            </ul>
          ),
        }),
      ]),
    [],
  );

  // القيد يلزمه إدارة الأثر مع إدارة الميدان، فالزر يُخفى عمّن ينقصه أحدهما.
  const canRecord = can(CAPABILITIES.fieldManage) && can(CAPABILITIES.impactManage);
  const days = useMemo(
    () => [...new Set((attendance.data ?? []).map((row) => row.day))],
    [attendance.data],
  );

  const record = (day: string | null) => ({
    key: "record-attendance",
    label: "تسجيل الحضور قيدَ أثر",
    icon: ClipboardPlus,
    hidden: !canRecord,
    disabled: days.length === 0,
    disabledReason: "لا حضور مسجَّلًا بعد.",
    onSelect: () => setDialog({ day, open: true }),
  });

  return (
    <Section
      title="الحضور"
      description="من سجّل القادة حضورهم، بالأيام والمواقع. الشخص يُعدّ مرة في موقعه ولو حضر في مجموعتين."
      actions={[record(null)]}
    >
      <DataTable
        caption="الحضور بالأيام والمواقع"
        columns={columns}
        data={attendance.data}
        getRowId={(row) => `${row.day}:${row.siteId}`}
        isLoading={attendance.isPending}
        error={attendance.error}
        onRetry={() => void attendance.refetch()}
        pagination={{ mode: "client", pageSize: 10 }}
        empty={{
          title: "لا حضور مسجَّلًا بعد",
          description:
            "حين يسجّل قائد حضور متطوعيه من التطبيق الميداني يظهر هنا يومًا بيوم.",
        }}
        rowActions={(row) => [{ ...record(row.day), quick: true, label: "سجّل هذا اليوم قيدَ أثر" }]}
      />

      <AttendanceImpactDialog
        initiativeId={initiative.id}
        days={days}
        rows={attendance.data ?? []}
        day={dialog.day}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Section>
  );
}

const schema = z.object({
  day: z.string().min(1, "اختر اليوم."),
  metricId: z.string().min(1, "اختر المؤشر."),
});

type Values = z.infer<typeof schema>;

function AttendanceImpactDialog({
  initiativeId,
  days,
  rows,
  day,
  open,
  onOpenChange,
}: {
  initiativeId: string;
  days: readonly string[];
  rows: readonly FieldAttendanceDay[];
  day: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { day: "", metricId: "" },
  });

  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: listMetrics,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const present = (value: string) =>
    rows.filter((row) => row.day === value).reduce((sum, row) => sum + row.present, 0);

  return (
    <FormDialog<Values, FieldAttendanceImpact>
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="تسجيل الحضور قيدَ أثر"
      description="قيد لكل موقع بعدد من حضروا فيه ذلك اليوم. يبقى بانتظار التحقق حتى يُوثَّق من تبويب «الأهداف والتقدم»."
      form={form}
      values={{ day: day ?? days[0] ?? "", metricId: "" }}
      submitLabel="تسجيل القيد"
      onSubmit={(values) => recordAttendanceImpact(initiativeId, values)}
      onSuccess={() => {
        void queryClient.invalidateQueries({ queryKey: ["initiative", initiativeId] });
        void queryClient.invalidateQueries({ queryKey: ["impact-unverified", initiativeId] });
      }}
      successMessage={(result) =>
        result.recorded.length > 0
          ? `سُجّل حضور ${countAr(result.recorded.length, SITES)} قيدًا بانتظار التحقق.`
          : "حضور هذا اليوم مسجَّل سلفًا بالعدد نفسه."
      }
      // 409 عن يوم سُجّل بعدد آخر، و422 عن مؤشر معطّل أو يوم بلا حضور.
      fieldForError={(error) =>
        error.status === 409 ? "day" : error.status === 422 ? "metricId" : null
      }
    >
      <SelectField
        control={form.control}
        name="day"
        label="اليوم"
        placeholder="اختر يوم الحضور"
        options={days.map((value) => ({
          value,
          label: formatDate(value),
          description: `الحاضرون: ${present(value)}`,
        }))}
      />
      <SelectField
        control={form.control}
        name="metricId"
        label="المؤشر"
        placeholder="اختر مؤشر المتطوعين"
        hint="المؤشر الذي يُعدّ به المتطوعون المشاركون في الحملة."
        loading={metrics.isPending && open}
        options={(metrics.data ?? [])
          .filter((metric) => metric.isActive)
          .map((metric) => ({
            value: metric.id,
            label: metric.nameAr,
            description: metric.unitAr,
          }))}
      />
      <Alert variant="info">
        يوم سُجّل حضوره لا يُسجَّل مرتين. إن تغيّر العدد بعد التسجيل فاعكس قيده الأول ثم
        سجّله من جديد.
      </Alert>
    </FormDialog>
  );
}
