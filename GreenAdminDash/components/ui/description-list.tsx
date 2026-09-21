import { cn } from "@/lib/utils";

export type DescriptionItem = {
  label: string;
  value: React.ReactNode;
  /** عنصر طويل (نبذة، ملاحظات) يأخذ عرض الشبكة كله. */
  wide?: boolean;
  hidden?: boolean;
};

/**
 * ملخص «مفتاح: قيمة» في شبكة متساوية الخلايا: حقائق الصفحة في لمحة
 * واحدة بدل عمود جانبي طويل. القيمة الفارغة «—».
 *
 * الأعمدة تتبع عرض الحاوية لا الشاشة (`@container`): الملخص نفسه يأخذ
 * أربعة أعمدة في الصفحة وعمودين داخل لوحة جانبية ضيقة.
 */
export function DescriptionList({
  items,
  className,
}: {
  items: readonly DescriptionItem[];
  className?: string;
}) {
  const shown = items.filter((item) => !item.hidden);

  return (
    <div className="@container">
      <dl
        className={cn(
          "grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border border-border bg-card p-5 text-card-foreground @sm:grid-cols-2 @3xl:grid-cols-4",
          className,
        )}
      >
        {shown.map((item) => (
          <div
            key={item.label}
            className={cn("min-w-0 space-y-1", item.wide && "@sm:col-span-2 @3xl:col-span-4")}
          >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="break-words text-sm font-medium">
            {item.value === null || item.value === undefined || item.value === "" ? (
              <span className="font-normal text-muted-foreground">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
        ))}
      </dl>
    </div>
  );
}
