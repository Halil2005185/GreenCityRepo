"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpenText, FilePlus2, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import {
  CharterTextSheet,
  CharterVersionDialog,
  PublishCharterDialog,
  charterState,
} from "@/components/charter/charter-dialogs";
import {
  DataTable,
  PrimaryCell,
  cells,
  columnHelper,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listCharterVersions, type CharterVersion } from "@/lib/api/partners";
import { CAPABILITIES } from "@/lib/auth/capabilities";

const col = columnHelper<CharterVersion>();

type Target = { version: CharterVersion | null; open: boolean };
const CLOSED: Target = { version: null, open: false };

export default function CharterPage() {
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<Target>(CLOSED);
  const [reading, setReading] = useState<Target>(CLOSED);

  const versions = useQuery({ queryKey: ["charter-versions"], queryFn: listCharterVersions });
  // الإصدار الجديد يبدأ من أحدث نص، منشورًا كان أو مسوّدة.
  const latest = useMemo(
    () => [...(versions.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [versions.data],
  );

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("titleAr", {
          header: "الإصدار",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              onClick={() => setReading({ version: info.row.original, open: true })}
              description={`الإصدار ${info.row.original.version}`}
            />
          ),
        }),
        col.accessor((version) => charterState(version), {
          id: "state",
          header: "الحالة",
          enableSorting: false,
          cell: (info) => <StatusBadge kind="charterState" value={info.getValue()} />,
        }),
        col.accessor((version) => version.principlesAr.length, {
          id: "principles",
          header: "المبادئ",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor((version) => version.commitmentsAr.length, {
          id: "commitments",
          header: "الالتزامات",
          meta: { numeric: true },
          cell: (info) => cells.number(info.getValue()),
        }),
        col.accessor((version) => version.publishedAt ?? undefined, {
          id: "publishedAt",
          header: "نُشر",
          sortUndefined: "last",
          cell: (info) => cells.date(info.getValue()),
        }),
        col.accessor((version) => version.effectiveFrom ?? undefined, {
          id: "effectiveFrom",
          header: "يسري من",
          sortUndefined: "last",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const create = {
    key: "create",
    label: "إصدار جديد",
    icon: FilePlus2,
    requires: [CAPABILITIES.charterManage],
    onSelect: () => setCreating(true),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الميثاق"
        description="الإقرارات تشير إلى إصدار محدد. المنشور لا يُعدَّل — التغيير يكون بإصدار جديد يحل محله دون أن يمحوه."
        primaryAction={create}
      />

      <DataTable
        caption="إصدارات الميثاق"
        columns={columns}
        data={versions.data}
        getRowId={(version) => version.id}
        isLoading={versions.isPending}
        error={versions.error}
        onRetry={() => void versions.refetch()}
        pagination={false}
        empty={{
          title: "لا إصدارات بعد",
          description: "أنشئ الإصدار الأول وانشره لتتمكن من تسجيل إقرارات الشركاء.",
          action: create,
        }}
        onRowClick={(version) => setReading({ version, open: true })}
        rowActions={(version) => [
          {
            key: "read",
            label: "عرض النص",
            icon: BookOpenText,
            quick: Boolean(version.publishedAt),
            onSelect: () => setReading({ version, open: true }),
          },
          {
            key: "publish",
            label: "نشر الإصدار",
            icon: Upload,
            quick: true,
            requires: [CAPABILITIES.charterManage],
            hidden: Boolean(version.publishedAt),
            onSelect: () => setPublishing({ version, open: true }),
          },
        ]}
      />

      <CharterVersionDialog base={latest} open={creating} onOpenChange={setCreating} />
      <PublishCharterDialog
        version={publishing.version}
        open={publishing.open}
        onOpenChange={(open) => setPublishing((current) => ({ ...current, open }))}
      />
      <CharterTextSheet
        version={reading.version}
        open={reading.open}
        onOpenChange={(open) => setReading((current) => ({ ...current, open }))}
      />
    </div>
  );
}
