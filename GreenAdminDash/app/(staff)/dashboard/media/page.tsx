"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, Plus, Search, Settings2 } from "lucide-react";
import { useState } from "react";

import {
  PRIORITY_STYLES,
  sinceLabel,
  useMediaChannels,
  useRelationshipTypes,
} from "@/components/relations/classification";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import {
  HORIZON_LABELS,
  MEDIA_STAGES,
  MEDIA_STAGE_LABELS,
  PRIORITY_LABELS,
  type MediaContactSummary,
  type MediaStage,
  listFollowUps,
  listMediaContacts,
} from "@/lib/api/media";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDate } from "@/lib/utils";

const STAGE_STYLES: Record<MediaStage, string> = {
  NEW: "bg-muted text-muted-foreground",
  CONTACTED: "bg-accent text-accent-foreground",
  INTERESTED: "bg-warning/15 text-warning",
  COLLABORATING: "bg-success/15 text-success",
  DORMANT: "bg-muted text-muted-foreground",
  DECLINED: "bg-destructive/10 text-destructive",
};

/** «متأخر التواصل» فرز جاهز لا رقم يكتبه المستخدم في كل مرة. */
const STALE_PRESETS = [
  { value: 0, label: "الكل" },
  { value: 30, label: "لم نكلّمه منذ شهر" },
  { value: 90, label: "منذ ٣ أشهر" },
];

function selectClass() {
  return "h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
}

/**
 * المتابعات المستحقة أعلى الشاشة لا في صفحة منفصلة.
 *
 * هي السبب الذي يفتح لأجله مكتب العلاقات هذه الشاشة صباحًا؛ دفنها خلف
 * نقرة يجعلها تُنسى، وهو بالضبط ما يفعله دفتر الورق الذي جاءت لتحلّ محلّه.
 */
function FollowUpPanel() {
  const followUps = useQuery({
    queryKey: ["media", "follow-ups"],
    queryFn: () => listFollowUps(),
  });

  const rows = followUps.data ?? [];

  if (rows.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          <h2 className="text-sm font-semibold">
            متابعات مستحقة ({rows.length})
          </h2>
        </div>

        <ul className="divide-y divide-border">
          {rows.slice(0, 6).map((item) => (
            <li key={item.id} className="py-2 text-sm">
              <Link
                href={`/dashboard/media/${item.contactId}`}
                className="flex flex-wrap items-center gap-2 hover:underline"
              >
                <span className="font-medium">{item.contactNameAr}</span>
                <span className="text-muted-foreground">{item.summaryAr}</span>
                <span
                  className={cn(
                    "ms-auto shrink-0 text-xs",
                    item.isOverdue ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {item.isOverdue ? "فات موعدها — " : ""}
                  {formatDate(item.dueAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {rows.length > 6 ? (
          <p className="text-xs text-muted-foreground">
            و{rows.length - 6} متابعة أخرى.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ContactRow({ contact }: { contact: MediaContactSummary }) {
  return (
    <tr className="border-t border-border align-top hover:bg-accent/40">
      <td className="p-3">
        <Link
          href={`/dashboard/media/${contact.id}`}
          className="font-medium hover:underline"
        >
          {contact.fullNameAr}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[contact.jobTitleAr, contact.partnerNameAr ?? contact.outletNameAr]
            .filter(Boolean)
            .join(" — ") || "—"}
        </p>
        {contact.openFollowUps > 0 ? (
          <span className="mt-1 inline-block rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">
            {contact.openFollowUps} متابعة مستحقة
          </span>
        ) : null}
      </td>

      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          {contact.channels.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            contact.channels.map((channel) => (
              <span
                key={channel.id}
                className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground"
              >
                {channel.nameAr}
              </span>
            ))
          )}
        </div>
      </td>

      <td className="p-3 text-xs">
        {contact.relationshipTypeNameAr ?? "—"}
        {contact.horizon ? (
          <span className="block text-muted-foreground">
            {HORIZON_LABELS[contact.horizon]}
          </span>
        ) : null}
      </td>

      <td className="p-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            PRIORITY_STYLES[contact.priority],
          )}
        >
          {PRIORITY_LABELS[contact.priority]}
        </span>
      </td>

      <td className="p-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            STAGE_STYLES[contact.stage],
          )}
        >
          {MEDIA_STAGE_LABELS[contact.stage]}
        </span>
      </td>

      <td className="p-3 text-xs">
        {contact.lastContactAt ? (
          sinceLabel(contact.lastContactAt)
        ) : (
          <span className="text-destructive">لم يُتواصل بعد</span>
        )}
      </td>

      <td className="p-3 text-xs" dir="ltr">
        <div className="flex flex-col items-start gap-0.5">
          {contact.phone ? <span>{contact.phone}</span> : null}
          {contact.email ? (
            <span className="text-muted-foreground">{contact.email}</span>
          ) : null}
          {!contact.phone && !contact.email ? "—" : null}
        </div>
      </td>
    </tr>
  );
}

export default function MediaNetworkPage() {
  const { can } = useAuth();
  const channels = useMediaChannels();
  const relationshipTypes = useRelationshipTypes();

  const [stage, setStage] = useState("");
  const [priority, setPriority] = useState("");
  const [channelId, setChannelId] = useState("");
  const [relationshipTypeId, setRelationshipTypeId] = useState("");
  const [staleDays, setStaleDays] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const contacts = useQuery({
    queryKey: [
      "media",
      "contacts",
      { stage, priority, channelId, relationshipTypeId, staleDays, query },
    ],
    queryFn: () =>
      listMediaContacts({
        ...(stage ? { stage } : {}),
        ...(priority ? { priority } : {}),
        ...(channelId ? { channelId } : {}),
        ...(relationshipTypeId ? { relationshipTypeId } : {}),
        ...(staleDays ? { staleDays } : {}),
        ...(query ? { q: query } : {}),
      }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الشبكة الإعلامية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            صنّاع المحتوى والإعلاميون — سجل أشخاص مستقل عن سجل الشركاء، مصنّف
            بشكل العمل وأولوية التواصل.
          </p>
        </div>

        <div className="flex gap-2">
          {can(CAPABILITIES.relationsTaxonomyManage) ? (
            <Link
              href="/dashboard/media/taxonomy"
              className={buttonVariants({ variant: "outline", className: "gap-2" })}
            >
              <Settings2 className="size-4" />
              المرجعيات
            </Link>
          ) : null}

          {can(CAPABILITIES.mediaManage) ? (
            <Link
              href="/dashboard/media/new"
              className={buttonVariants({ className: "gap-2" })}
            >
              <Plus className="size-4" />
              إضافة شخص
            </Link>
          ) : null}
        </div>
      </header>

      <FollowUpPanel />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          className={selectClass()}
          aria-label="المرحلة"
        >
          <option value="">كل المراحل</option>
          {MEDIA_STAGES.map((value) => (
            <option key={value} value={value}>
              {MEDIA_STAGE_LABELS[value]}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className={selectClass()}
          aria-label="الأولوية"
        >
          <option value="">كل الأولويات</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={channelId}
          onChange={(event) => setChannelId(event.target.value)}
          className={selectClass()}
          aria-label="شكل العمل الإعلامي"
        >
          <option value="">كل أشكال العمل</option>
          {(channels.data ?? []).map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.nameAr}
            </option>
          ))}
        </select>

        <select
          value={relationshipTypeId}
          onChange={(event) => setRelationshipTypeId(event.target.value)}
          className={selectClass()}
          aria-label="نوع العلاقة"
        >
          <option value="">كل أنواع العلاقة</option>
          {(relationshipTypes.data ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {type.nameAr}
            </option>
          ))}
        </select>

        <select
          value={staleDays}
          onChange={(event) => setStaleDays(Number(event.target.value))}
          className={selectClass()}
          aria-label="آخر تواصل"
        >
          {STALE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
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
            placeholder="اسم، جهة، هاتف…"
            className="h-9 w-56"
            aria-label="بحث"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search className="size-4" />
            بحث
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {contacts.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : contacts.isError ? (
            <div className="p-6">
              <Alert>تعذّر تحميل الشبكة الإعلامية.</Alert>
            </div>
          ) : (contacts.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              لا نتائج مطابقة.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">الاسم</th>
                    <th className="p-3 text-start font-medium">شكل العمل</th>
                    <th className="p-3 text-start font-medium">نوع العلاقة</th>
                    <th className="p-3 text-start font-medium">الأولوية</th>
                    <th className="p-3 text-start font-medium">المرحلة</th>
                    <th className="p-3 text-start font-medium">آخر تواصل</th>
                    <th className="p-3 text-start font-medium">التواصل</th>
                  </tr>
                </thead>
                <tbody>
                  {(contacts.data ?? []).map((contact) => (
                    <ContactRow key={contact.id} contact={contact} />
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
