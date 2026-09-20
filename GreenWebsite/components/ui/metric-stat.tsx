import type { PublicMetricProgress } from "@/lib/api/types";
import { formatNumber } from "@/lib/utils";

/**
 * الرقم المعروض هو `actual` وحده — القيود الموثَّقة. غير الموثَّق لا يظهر
 * للعامة إطلاقًا، لأن رقمًا معلنًا ثم مسحوبًا يكلّف من المصداقية أكثر مما
 * يكسبه من الظهور المبكر.
 */
export function MetricStat({ metric }: { metric: PublicMetricProgress }) {
  const hasTarget = metric.target !== null && metric.target > 0;
  const percent =
    hasTarget && metric.percent !== null
      ? Math.min(100, Math.max(0, metric.percent))
      : null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-start">
      <p className="text-sm text-muted-foreground">{metric.metricNameAr}</p>
      <p className="mt-3 flex items-baseline gap-2">
        {/* الرقم هو بطل البطاقة، فهو وحده بالأخضر الحيوي. */}
        <span className="numeric text-4xl font-bold tracking-tight text-accent-ink">
          {formatNumber(metric.actual, metric.decimals)}
        </span>
        <span className="text-sm text-muted-foreground">{metric.unitAr}</span>
      </p>

      {hasTarget && (
        <div className="mt-5 space-y-2">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-strong"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? 0}
            aria-label={`نسبة الإنجاز من هدف ${metric.metricNameAr}`}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ inlineSize: `${percent ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            من هدف{" "}
            <span className="numeric">
              {formatNumber(metric.target ?? 0, metric.decimals)}
            </span>{" "}
            {metric.unitAr}
          </p>
        </div>
      )}
    </div>
  );
}
