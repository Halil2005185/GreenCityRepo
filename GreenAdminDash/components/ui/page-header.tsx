"use client";

import {
  ActionButton,
  ActionMenu,
  type ActionDef,
  type MaybeAction,
  useVisibleActions,
} from "@/components/ui/actions";
import { type Crumb, Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * ترويسة كل صفحة بترتيب واحد: مسار التنقل (للصفحات المتداخلة)، ثم العنوان
 * ووصفه وشاراته في جهة البداية، والأفعال وحدها في جهة النهاية.
 *
 * زر أساسي واحد على الأكثر، ثم أزرار ثانوية بنمط `outline`، وما ندر في
 * قائمة «⋯». ترتيب العناصر في الشجرة («⋯» ثم الثانوية ثم الأساسي) يضع
 * الأساسي في أقصى جهة النهاية تحت أي اتجاه.
 *
 * على الجوال تلتف الأفعال تحت العنوان، وتنتقل الأزرار الثانوية إلى «⋯»
 * فيبقى الأساسي ظاهرًا دون صف أزرار يفيض عن الشاشة.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  badges,
  primaryAction,
  secondaryActions = [],
  menuActions = [],
  loading = false,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: readonly Crumb[];
  badges?: React.ReactNode;
  primaryAction?: MaybeAction;
  secondaryActions?: readonly MaybeAction[];
  menuActions?: readonly MaybeAction[];
  /** صفحة تفاصيل لم تصل بياناتها بعد: هيكل بشكل العنوان. */
  loading?: boolean;
  className?: string;
}) {
  const visible = useVisibleActions();
  const [primary] = visible([primaryAction]);
  const secondary = visible(secondaryActions);
  const menu = visible(menuActions);

  const mobileMenu: ActionDef[] = [...secondary, ...menu];
  const hasActions = Boolean(primary) || mobileMenu.length > 0;

  return (
    <header className={cn("space-y-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72 space-y-1">
          {loading ? (
            <Skeleton className="h-8 w-full max-w-64" />
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-bold leading-tight">{title}</h1>
              {badges}
            </div>
          )}

          {loading ? (
            <Skeleton className="h-4 w-full max-w-96" />
          ) : description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {hasActions && !loading ? (
          // `ms-auto`: حين تلتف الأفعال تحت العنوان تبقى في جهة النهاية.
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {/* الجوال: الثانوية داخل «⋯» */}
            <ActionMenu actions={mobileMenu} className="sm:hidden" />
            {/* الشاشات الأوسع: «⋯» لما ندر فقط، والثانوية ظاهرة */}
            <ActionMenu actions={menu} className="max-sm:hidden" />
            {secondary.map((action) => (
              <ActionButton key={action.key} action={action} className="max-sm:hidden" />
            ))}
            {primary ? <ActionButton action={primary} variant="default" /> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
