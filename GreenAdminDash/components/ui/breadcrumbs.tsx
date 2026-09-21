import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * مسار التنقل في الصفحات المتداخلة، فوق العنوان في جهة البداية. يحلّ محل
 * الأسهم النصية «←» التي كانت تعني «رجوع» في صفحة و«اذهب» في أخرى.
 *
 * الفاصل سهم «يمين» مقلوب تحت RTL، فيشير دائمًا نحو المستوى الأعمق.
 * العنصر الأخير هو الصفحة الحالية ولا يكون رابطًا.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: readonly Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="مسار التنقل" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="inline-flex min-w-0 items-center">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="truncate rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn("truncate", isLast && "text-foreground")}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {isLast ? null : (
                <li role="presentation" aria-hidden className="text-muted-foreground/70">
                  <ChevronRightIcon className="size-3.5 rtl:rotate-180" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
