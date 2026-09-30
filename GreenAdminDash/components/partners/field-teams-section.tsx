"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  DataTable,
  EmptyCell,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InitiativeStatus } from "@/lib/api/initiatives";
import { getMyFieldTeams, type PartnerFieldTeam } from "@/lib/api/partners";
import { formatDate } from "@/lib/utils";

const col = columnHelper<PartnerFieldTeam>();

/**
 * فرق الجهة في الميدان: المجموعات التي نسبها المنسّق إليها، بأعداد حضورها.
 *
 * أعداد لا أسماء: المتطوع أعطى بياناته للمشروع ليُنظَّم يومه، لا للجهة التي
 * جاء معها. والقسم يغيب عن جهة لا فرق لها — شراكتها بغير الميدان، وجدول
 * فارغ يسألها عمّا لم تَعِد به.
 */
export function FieldTeamsSection() {
  const teams = useQuery({ queryKey: ["my-field-teams"], queryFn: getMyFieldTeams });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("groupNameAr", {
          header: "الفريق",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              description={[info.row.original.siteNameAr, info.row.original.areaNameAr]
                .filter(Boolean)
                .join(" — ")}
            />
          ),
        }),
        col.accessor("initiativeNameAr", {
          header: "المبادرة",
          cell: (info) => (
            // عرض أدنى: اسم المبادرة لا يُكسر كلمةً كلمةً في جدول يُمرَّر أفقيًا.
            <div className="min-w-40 space-y-1">
              <p>{info.getValue()}</p>
              <StatusBadge
                kind="initiativeStatus"
                value={info.row.original.initiativeStatus as InitiativeStatus}
              />
            </div>
          ),
        }),
        col.accessor((row) => row.meetsAt ?? undefined, {
          id: "meetsAt",
          header: "الموعد",
          sortUndefined: "last",
          cell: (info) => cells.dateTime(info.getValue()),
        }),
        col.accessor("memberCount", {
          header: "الأعضاء",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor("comingCount", {
          header: "أكّدوا",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor("attendedCount", {
          header: "حضروا",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const { attendanceDays, lastAttendedOn } = info.row.original;

            if (info.getValue() === 0) return <EmptyCell />;

            return (
              <div className="space-y-0.5">
                {/* `numeric` على الرقم لا على السطر: السطر يبقى في جهة البداية. */}
                <p>
                  <span className="numeric">
                    {info.getValue().toLocaleString("en-US")}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {/* شخص حضر يومين يُعدّ يومين: هذا ما قدّمه الفريق من أيام. */}
                  أيام الحضور: <span className="numeric">{attendanceDays}</span>
                  {lastAttendedOn ? ` · آخرها ${formatDate(lastAttendedOn)}` : ""}
                </p>
              </div>
            );
          },
        }),
      ]),
    [],
  );

  if (!teams.isPending && !teams.isError && teams.data.length === 0) return null;

  return (
    <Section
      title="فرقنا في الميدان"
      description="المجموعات التي شاركت بها جهتكم في الحملات، بأعداد حضورها. الأسماء عند فريق المشروع."
    >
      <DataTable
        caption="فرق الجهة في الميدان"
        columns={columns}
        data={teams.data}
        getRowId={(row) => row.groupId}
        isLoading={teams.isPending}
        error={teams.error}
        onRetry={() => void teams.refetch()}
        pagination={{ mode: "client", pageSize: 10 }}
        empty={{ title: "لا فرق ميدانية" }}
      />
    </Section>
  );
}
