"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import {
  INITIATIVE_STATUS_LABELS,
  ROLLUP_SHORT,
  type InitiativeStatus,
  listInitiatives,
  listPrograms,
} from "@/lib/api/initiatives";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_STYLES: Record<InitiativeStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PLANNING: "bg-accent text-accent-foreground",
  ACTIVE: "bg-success/15 text-success",
  COMPLETED: "bg-primary/10 text-primary",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default function InitiativesPage() {
  const { can } = useAuth();
  const [programId, setProgramId] = useState("");

  const programs = useQuery({ queryKey: ["programs"], queryFn: listPrograms });

  const initiatives = useQuery({
    queryKey: ["initiatives", programId],
    queryFn: () => listInitiatives(programId ? { programId } : {}),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المبادرات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كل مبادرة تحت برنامج، وتعمل في منطقة أو أكثر، بعدد مواقع مفتوح.
          </p>
        </div>

        {can(CAPABILITIES.initiativesManage) ? (
          <Link
            href="/dashboard/initiatives/new"
            className={buttonVariants({ className: "gap-2" })}
          >
            <Plus className="size-4" />
            مبادرة جديدة
          </Link>
        ) : null}
      </header>

      {/* الفلاتر تُبنى من البرامج القادمة من الـAPI لا من قائمة مكتوبة. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setProgramId("")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            programId === ""
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          كل البرامج
        </button>

        {programs.data?.map((program) => (
          <button
            key={program.id}
            type="button"
            onClick={() => setProgramId(program.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              programId === program.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {program.nameAr}
            <span className="ms-1 opacity-60">{program.initiativeCount}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {initiatives.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : initiatives.isError ? (
            <div className="p-6">
              <Alert>تعذّر تحميل المبادرات.</Alert>
            </div>
          ) : initiatives.data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              لا توجد مبادرات بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">المبادرة</th>
                    <th className="p-3 text-start font-medium">البرنامج</th>
                    <th className="p-3 text-start font-medium">الحالة</th>
                    <th className="p-3 text-start font-medium">المواقع</th>
                    <th className="p-3 text-start font-medium">المطابقة</th>
                    <th className="p-3 text-start font-medium">الموسم</th>
                  </tr>
                </thead>

                <tbody>
                  {initiatives.data.map((initiative) => (
                    <tr
                      key={initiative.id}
                      className="border-b border-border/60 hover:bg-accent/40"
                    >
                      <td className="p-3">
                        <Link
                          href={`/dashboard/initiatives/${initiative.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {initiative.nameAr}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {initiative.programNameAr}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs",
                            STATUS_STYLES[initiative.status],
                          )}
                        >
                          {INITIATIVE_STATUS_LABELS[initiative.status]}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {initiative.siteCount}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {ROLLUP_SHORT[initiative.targetRollup]}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {initiative.season ??
                          (initiative.startsAt
                            ? formatDateTime(initiative.startsAt)
                            : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
