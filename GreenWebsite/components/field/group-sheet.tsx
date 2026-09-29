"use client";

import {
  CalendarClock,
  CircleAlert,
  ClipboardList,
  MapPin,
  Navigation,
  RefreshCw,
} from "lucide-react";

import { FieldCard } from "@/components/field/states";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { FieldSheet, FieldTarget, FieldTask } from "@/lib/field/api";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  formatAge,
  formatDay,
  formatTime,
} from "@/lib/field/labels";
import { cn, formatNumber } from "@/lib/utils";

/**
 * رابط يفتح تطبيق الخرائط على الموقع. عنوان عام لا مخطط `geo:`: يعمل على
 * Android وiOS والحاسوب، ويفتح التطبيق المثبَّت حيث وُجد.
 */
function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}

const WHY_CLOSED: Record<FieldSheet["initiative"]["status"], string> = {
  DRAFT: "المبادرة ما زالت مسودة، فلا يُسجَّل عليها شيء قبل بدء تنفيذها.",
  PLANNING: "المبادرة قيد التخطيط، ويبدأ التسجيل حين يبدأ تنفيذها.",
  ACTIVE: "",
  COMPLETED: "أُغلقت المبادرة، وانتهت مهلة استقبال ما سُجّل في الميدان.",
  CANCELLED: "أُلغيت المبادرة.",
};

export function GroupSheet({
  sheet,
  refreshing,
  stale,
  onRefresh,
}: {
  sheet: FieldSheet;
  refreshing: boolean;
  /** ما على الشاشة من المحفوظ، وتعذّر تحديثه الآن. */
  stale: boolean;
  onRefresh: () => void;
}) {
  const { group, site, initiative } = sheet;

  return (
    <div className="space-y-4">
      {!initiative.acceptsEntries ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden
          />
          {WHY_CLOSED[initiative.status]}
        </p>
      ) : null}

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
                    <span className="numeric">{formatTime(group.meetsAt)}</span>
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

      {sheet.targets.length > 0 ? (
        <FieldCard title="أهداف الموقع">
          <ul className="space-y-4">
            {sheet.targets.map((target) => (
              <TargetRow key={target.metricId} target={target} />
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
        {sheet.tasks.length > 0 ? (
          <ul className="divide-y divide-border">
            {sheet.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        ) : (
          // سطران لا بطاقة داخل بطاقة: الفراغ هنا معلومة عابرة لا حالة صفحة.
          <div className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
            <ClipboardList
              className="mt-0.5 size-5 shrink-0 text-accent-ink"
              aria-hidden
            />
            <p>
              لا مهام على هذا الموقع بعد. ما يضيفه المنسّق للموقع، أو يسنده إليك
              من مهام الحملة، يظهر هنا.
            </p>
          </div>
        )}
      </FieldCard>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {stale ? "من المحفوظ على الجهاز · " : ""}
          آخر تحديث {formatAge(sheet.generatedAt)}
        </p>
        <button
          type="button"
          onClick={onRefresh}
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
 * الرقم المعروض ما أُدخل كله — الموثَّق وما ينتظر — لأن القائد يسأل «كم
 * زرعنا؟» لا «كم اعتُمد؟». والتفصيل تحته يبقي الفرق ظاهرًا.
 */
function TargetRow({ target }: { target: FieldTarget }) {
  const entered = target.actual + target.unverified;
  const hasTarget = target.target !== null && target.target > 0;
  const percent = hasTarget
    ? Math.min(100, Math.round((entered / target.target!) * 100))
    : null;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {target.metricNameAr}
        </p>
        <p className="text-sm text-foreground">
          <span className="numeric text-lg font-bold text-accent-ink">
            {formatNumber(entered, target.decimals)}
          </span>
          {hasTarget ? (
            <>
              {" "}
              من{" "}
              <span className="numeric font-semibold">
                {formatNumber(target.target!, target.decimals)}
              </span>
            </>
          ) : null}{" "}
          {target.unitAr}
        </p>
      </div>

      {percent !== null ? (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`ما أُدخل من هدف ${target.metricNameAr}`}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ inlineSize: `${percent}%` }}
          />
        </div>
      ) : null}

      {target.unverified > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          منها{" "}
          <span className="numeric">
            {formatNumber(target.unverified, target.decimals)}
          </span>{" "}
          بانتظار تحقق المنسّق
        </p>
      ) : null}
    </li>
  );
}

function TaskRow({ task }: { task: FieldTask }) {
  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-sm font-semibold leading-relaxed text-foreground",
            task.status === "DONE" && "line-through decoration-muted-foreground",
          )}
        >
          {task.titleAr}
        </p>
        <Badge tone={TASK_STATUS_TONES[task.status]} className="shrink-0">
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      </div>

      {task.descriptionAr ? (
        <p className="text-sm leading-relaxed text-foreground">
          {task.descriptionAr}
        </p>
      ) : null}

      {task.status === "BLOCKED" && task.blockedReasonAr ? (
        <p className="text-sm leading-relaxed text-warning">
          سبب التعثّر: {task.blockedReasonAr}
        </p>
      ) : null}

      {task.dueAt || task.scope === "INITIATIVE" ? (
        <p className="text-xs text-muted-foreground">
          {[
            task.scope === "INITIATIVE" ? "من مهام الحملة" : null,
            task.dueAt
              ? `${task.isOverdue ? "تأخرت عن" : "حتى"} ${formatDay(task.dueAt)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </li>
  );
}
