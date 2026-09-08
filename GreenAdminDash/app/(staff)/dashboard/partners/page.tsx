"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useState } from "react";

import {
  PRIORITY_STYLES,
  sinceLabel,
} from "@/components/relations/classification";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { PRIORITY_LABELS } from "@/lib/api/media";
import {
  PARTNERSHIP_TYPE_LABELS,
  PIPELINE_STAGES,
  STAGE_LABELS,
  type PartnerStage,
  listPartners,
} from "@/lib/api/partners";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

const STAGE_STYLES: Record<PartnerStage, string> = {
  NEW: "bg-muted text-muted-foreground",
  CONTACTED: "bg-muted text-muted-foreground",
  QUALIFIED: "bg-accent text-accent-foreground",
  NEGOTIATION: "bg-warning/15 text-warning",
  PENDING_APPROVAL: "bg-warning/20 text-warning",
  ACTIVE: "bg-success/15 text-success",
  ON_HOLD: "bg-muted text-muted-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
  ENDED: "bg-muted text-muted-foreground",
};

const FILTERS = [
  { value: "", label: "الكل" },
  ...PIPELINE_STAGES.map((stage) => ({
    value: stage,
    label: STAGE_LABELS[stage],
  })),
  { value: "ACTIVE", label: STAGE_LABELS.ACTIVE },
  { value: "REJECTED", label: STAGE_LABELS.REJECTED },
];

export default function PartnersPage() {
  const { can } = useAuth();
  const [stage, setStage] = useState("");
  const [priority, setPriority] = useState("");
  const [staleDays, setStaleDays] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const partners = useQuery({
    queryKey: ["partners", stage, priority, staleDays, query],
    queryFn: () =>
      listPartners({
        ...(stage ? { stage } : {}),
        ...(priority ? { priority } : {}),
        ...(staleDays ? { staleDays } : {}),
        ...(query ? { q: query } : {}),
      }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">سجل الشركاء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            من جهة محتملة إلى شراكة معتمدة. الاعتماد النهائي للمدير العام.
          </p>
        </div>

        {/* رابط لا زر: التنقل يجب أن يبقى قابلًا للفتح في تبويب جديد. */}
        {can(CAPABILITIES.partnersManage) ? (
          <Link
            href="/dashboard/partners/new"
            className={buttonVariants({ className: "gap-2" })}
          >
            <Plus className="size-4" />
            تسجيل جهة
          </Link>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStage(filter.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              stage === filter.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {filter.label}
          </button>
        ))}

        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="أولوية التواصل"
        >
          <option value="">كل الأولويات</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={staleDays}
          onChange={(event) => setStaleDays(Number(event.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="آخر تواصل"
        >
          <option value={0}>أي تاريخ تواصل</option>
          <option value={30}>لم نتواصل منذ شهر</option>
          <option value={90}>منذ ٣ أشهر</option>
        </select>

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
            placeholder="ابحث بالاسم…"
            className="h-9 w-56"
            aria-label="بحث بالاسم"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search className="size-4" />
            بحث
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {partners.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : partners.isError ? (
            <div className="p-6">
              <Alert>تعذّر تحميل سجل الشركاء.</Alert>
            </div>
          ) : partners.data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              لا توجد جهات مطابقة.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">الجهة</th>
                    <th className="p-3 text-start font-medium">المرحلة</th>
                    <th className="p-3 text-start font-medium">أنواع الشراكة</th>
                    <th className="p-3 text-start font-medium">جهة الاتصال</th>
                    <th className="p-3 text-start font-medium">الأولوية</th>
                    <th className="p-3 text-start font-medium">آخر تواصل</th>
                    <th className="p-3 text-start font-medium">مسؤول العلاقة</th>
                    <th className="p-3 text-start font-medium">الإظهار</th>
                  </tr>
                </thead>

                <tbody>
                  {partners.data.map((partner) => (
                    <tr
                      key={partner.id}
                      className="border-b border-border/60 hover:bg-accent/40"
                    >
                      <td className="p-3">
                        <Link
                          href={`/dashboard/partners/${partner.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {partner.displayNameAr}
                        </Link>
                        {partner.isSuspended ? (
                          <span className="ms-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                            معلّقة
                          </span>
                        ) : null}
                      </td>

                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs",
                            STAGE_STYLES[partner.stage],
                          )}
                        >
                          {STAGE_LABELS[partner.stage]}
                        </span>
                      </td>

                      <td className="p-3">
                        {partner.partnershipTypes.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {partner.partnershipTypes.map((type) => (
                              <span
                                key={type}
                                className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                              >
                                {PARTNERSHIP_TYPE_LABELS[type]}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {partner.primaryContactNameAr ?? "—"}
                      </td>

                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            PRIORITY_STYLES[partner.contactPriority],
                          )}
                        >
                          {PRIORITY_LABELS[partner.contactPriority]}
                        </span>
                        {partner.relationshipTypeNameAr ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {partner.relationshipTypeNameAr}
                          </span>
                        ) : null}
                      </td>

                      <td className="p-3 text-xs">
                        {partner.lastContactAt ? (
                          sinceLabel(partner.lastContactAt)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {partner.accountManagerNameAr ?? "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {partner.publicNameConsent ? "الاسم" : ""}
                        {partner.publicNameConsent && partner.publicLogoConsent
                          ? " · "
                          : ""}
                        {partner.publicLogoConsent ? "الشعار" : ""}
                        {!partner.publicNameConsent && !partner.publicLogoConsent
                          ? "—"
                          : ""}
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
