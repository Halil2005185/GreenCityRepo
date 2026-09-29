"use client";

import {
  CalendarClock,
  Camera,
  ChevronLeft,
  MapPin,
  Navigation,
  RefreshCw,
  Users,
} from "lucide-react";
import Link from "next/link";

import { ClosedNotice } from "@/components/field/closed-notice";
import { TargetRow } from "@/components/field/count-stepper";
import type { SheetView } from "@/components/field/sheet-gate";
import { FieldCard } from "@/components/field/states";
import { TaskChecklist } from "@/components/field/task-checklist";
import { Button, buttonVariants } from "@/components/ui/button";
import type { FieldSheet } from "@/lib/field/api";
import { FIELD_ROUTES } from "@/lib/field/config";
import {
  SITE_STATUS_LABELS,
  formatAge,
  formatDay,
  formatTime,
} from "@/lib/field/labels";
import { attempt } from "@/lib/field/toast";
import { cn, formatNumber } from "@/lib/utils";

/**
 * رابط يفتح تطبيق الخرائط على الموقع. عنوان عام لا مخطط `geo:`: يعمل على
 * Android وiOS والحاسوب، ويفتح التطبيق المثبَّت حيث وُجد.
 */
function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}

/**
 * ورقة اليوم: أين ومتى، ثم ما يُسجَّل — حال الموقع وأعداده ومهامه. الحضور
 * والصور تبويبان لهما، وهنا خلاصتهما ورابط إليهما.
 */
export function GroupSheet({
  sheet,
  actions,
  writable,
  refreshing,
  stale,
  refresh,
}: SheetView) {
  const { group, site } = sheet;
  const present = sheet.members.filter((member) => member.attendance).length;

  return (
    <div className="space-y-4">
      <ClosedNotice sheet={sheet} />

      <FieldCard>
        <dl className="space-y-4">
          <div className="flex items-start gap-3">
            <CalendarClock
              className="mt-0.5 size-5 shrink-0 text-accent-ink"
              aria-hidden
            />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">
                الموعد
              </dt>
              <dd className="text-base font-semibold text-foreground">
                {group.meetsAt ? (
                  <>
                    {formatDay(group.meetsAt)}،{" "}
                    {/* `tabular-nums` لا `numeric`: الوقت فيه «ص/م»، وعزله يسارًا يقلب ترتيبه. */}
                    <span className="tabular-nums">
                      {formatTime(group.meetsAt)}
                    </span>
                  </>
                ) : (
                  "لم يُحدَّد بعد"
                )}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin
              className="mt-0.5 size-5 shrink-0 text-accent-ink"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <dt className="text-xs font-medium text-muted-foreground">
                الموقع ونقطة اللقاء
              </dt>
              <dd className="text-base font-semibold text-foreground">
                {site.nameAr}
                {site.areaNameAr ? (
                  <span className="font-normal"> — {site.areaNameAr}</span>
                ) : null}
              </dd>
              {group.meetingPointAr ? (
                <dd className="mt-0.5 text-sm text-foreground">
                  اللقاء عند: {group.meetingPointAr}
                </dd>
              ) : null}
            </div>
          </div>
        </dl>

        {site.lat !== null && site.lng !== null ? (
          <a
            href={mapsUrl(site.lat, site.lng)}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "mt-4 w-full",
            )}
          >
            <Navigation aria-hidden />
            افتح في الخرائط
          </a>
        ) : null}

        {group.instructionsAr ? (
          <div className="mt-4 rounded-lg bg-surface px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              تعليمات المنسّق
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-loose text-foreground">
              {group.instructionsAr}
            </p>
          </div>
        ) : null}
      </FieldCard>

      <SiteStatus
        status={site.status}
        writable={writable}
        onChange={(status) => void attempt(() => actions.setSiteStatus(status))}
      />

      <div className="grid grid-cols-2 gap-3">
        <SummaryLink
          href={FIELD_ROUTES.attendance}
          icon={Users}
          label="الحضور"
          // «0 من 0» رقمٌ بلا معنى؛ المجموعة الفارغة تُقال بالكلمات.
          value={
            sheet.members.length > 0 ? (
              <>
                <span className="numeric">{present}</span> من{" "}
                <span className="numeric">{sheet.members.length}</span>
              </>
            ) : (
              "لا أعضاء بعد"
            )
          }
        />
        <SummaryLink
          href={FIELD_ROUTES.photos}
          icon={Camera}
          label="الصور"
          value={
            <span className="numeric">{formatNumber(sheet.photoCount)}</span>
          }
        />
      </div>

      {sheet.targets.length > 0 ? (
        <FieldCard title="أعداد الموقع">
          <ul className="divide-y divide-border">
            {sheet.targets.map((target) => (
              <TargetRow
                key={target.metricId}
                target={target}
                writable={writable}
                onRecord={(value, noteAr) =>
                  attempt(
                    () => actions.recordCount(target, value, noteAr),
                    `سُجّل ${formatNumber(value, target.decimals)} ${target.unitAr} — ${target.metricNameAr}.`,
                  )
                }
              />
            ))}
          </ul>
        </FieldCard>
      ) : null}

      <FieldCard
        title="المهام"
        aside={
          sheet.tasks.length > 0 ? (
            <span className="text-xs font-medium text-muted-foreground">
              <span className="numeric">
                {sheet.tasks.filter((task) => task.status === "DONE").length}/
                {sheet.tasks.length}
              </span>{" "}
              منجزة
            </span>
          ) : null
        }
      >
        <TaskChecklist
          tasks={sheet.tasks}
          canApprove={sheet.permissions.canApproveTasks}
          writable={writable}
          actions={{
            move: (task, status, reason) =>
              attempt(() => actions.moveTask(task, status, reason)),
            note: (task, bodyAr) =>
              attempt(
                () => actions.noteTask(task, bodyAr),
                "أُضيفت الملاحظة، ويراها المنسّق في اللوحة.",
              ),
          }}
        />
      </FieldCard>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {stale ? "من المحفوظ على الجهاز · " : ""}
          آخر تحديث {formatAge(sheet.generatedAt)}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <RefreshCw
            className={cn(refreshing && "motion-safe:animate-spin")}
            aria-hidden
          />
          تحديث
        </button>
      </div>
    </div>
  );
}

/**
 * حال الموقع بيد قائده: يبدأ العمل ويغلقه ويعيد فتحه. الإلغاء ليس هنا —
 * قرار المنسّق من اللوحة.
 */
function SiteStatus({
  status,
  writable,
  onChange,
}: {
  status: FieldSheet["site"]["status"];
  writable: boolean;
  onChange: (status: "IN_PROGRESS" | "COMPLETED") => void;
}) {
  const next =
    status === "PLANNED"
      ? { to: "IN_PROGRESS" as const, label: "ابدأ العمل", primary: true }
      : status === "IN_PROGRESS"
        ? { to: "COMPLETED" as const, label: "أغلق الموقع", primary: false }
        : status === "COMPLETED"
          ? { to: "IN_PROGRESS" as const, label: "أعد فتحه", primary: false }
          : null;

  return (
    <FieldCard>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">حال الموقع</p>
          <p className="text-base font-semibold text-foreground">
            {SITE_STATUS_LABELS[status]}
          </p>
        </div>

        {writable && next ? (
          <Button
            variant={next.primary ? "default" : "secondary"}
            onClick={() => onChange(next.to)}
            className="shrink-0"
          >
            {next.label}
          </Button>
        ) : null}
      </div>
    </FieldCard>
  );
}

function SummaryLink({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="block text-base font-bold text-foreground">
          {value}
        </span>
      </span>
      {/* السهم يشير إلى اليسار: اتجاه «التالي» في صفحة تُقرأ من اليمين. */}
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
