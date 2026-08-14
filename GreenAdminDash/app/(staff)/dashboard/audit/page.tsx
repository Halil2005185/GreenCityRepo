"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import {
  AUDIT_SEVERITY_LABELS,
  type AuditEntry,
  listAuditLogs,
} from "@/lib/api/work";
import { cn, formatDateTime } from "@/lib/utils";

const SEVERITY_STYLES: Record<AuditEntry["severity"], string> = {
  INFO: "bg-muted text-muted-foreground",
  NOTICE: "bg-primary/10 text-primary",
  WARNING: "bg-warning/15 text-warning",
  CRITICAL: "bg-destructive/10 text-destructive",
};

export default function AuditPage() {
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const logs = useQuery({
    queryKey: ["audit", severity, query],
    queryFn: () =>
      listAuditLogs({
        ...(severity ? { severity } : {}),
        ...(query ? { q: query } : {}),
      }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">سجل التدقيق</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إضافي فقط: كل اعتماد وموافقة وتغيير حالة مسجَّل، ولا يُعدَّل ولا يُحذف.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "", label: "الكل" },
          ...Object.entries(AUDIT_SEVERITY_LABELS).map(([value, label]) => ({
            value,
            label,
          })),
        ].map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setSeverity(filter.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              severity === filter.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {filter.label}
          </button>
        ))}

        <form
          className="ms-auto flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث في الوصف…"
            className="h-9 w-56"
            aria-label="بحث في سجل التدقيق"
          />
          <Button type="submit" variant="outline" size="sm">
            بحث
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {logs.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : logs.isError ? (
            <div className="p-6">
              <Alert>تعذّر تحميل السجل.</Alert>
            </div>
          ) : logs.data.data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">لا سجلات مطابقة.</p>
          ) : (
            <ul className="divide-y divide-border">
              {logs.data.data.map((entry) => (
                <li key={entry.id} className="flex flex-wrap gap-3 p-4 text-sm">
                  <span
                    className={cn(
                      "h-fit rounded px-1.5 py-0.5 text-xs",
                      SEVERITY_STYLES[entry.severity],
                    )}
                  >
                    {AUDIT_SEVERITY_LABELS[entry.severity]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p>{entry.summaryAr ?? entry.action}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actorNameAr ?? "النظام"}
                      {entry.entityLabel ? ` · ${entry.entityLabel}` : ""}
                      {" · "}
                      {formatDateTime(entry.createdAt)}
                      <span className="ms-2 opacity-60" dir="ltr">
                        {entry.action}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {logs.data?.nextBefore ? (
        <p className="text-center text-xs text-muted-foreground">
          تُعرض أحدث {logs.data.data.length} سجلًا. صفِّ النتائج لرؤية ما قبلها.
        </p>
      ) : null}
    </div>
  );
}
