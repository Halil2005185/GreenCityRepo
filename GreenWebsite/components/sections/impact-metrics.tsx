import { EmptyState } from "@/components/ui/empty-state";
import { MetricStat } from "@/components/ui/metric-stat";
import { getImpactSummary } from "@/lib/api/public";

/**
 * المؤشرات كلها من كتالوج القاعدة: لا «عدد الأشجار» مكتوب هنا ولا وحدة
 * قياس مفترضة. مبادرة بمؤشر جديد تظهر أرقامها دون لمس هذا الملف.
 */
export async function ImpactMetrics({ limit }: { limit?: number }) {
  const summary = await getImpactSummary();
  const metrics = summary?.metrics ?? [];
  const shown = limit ? metrics.slice(0, limit) : metrics;

  if (shown.length === 0) {
    return (
      <EmptyState
        title="لا أرقام معلنة بعد"
        description="نعلن الأرقام بعد توثيقها ميدانيًا فقط. ستظهر هنا فور اعتماد أول قيود الأثر."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((metric) => (
        <MetricStat key={metric.metricId} metric={metric} />
      ))}
    </div>
  );
}
