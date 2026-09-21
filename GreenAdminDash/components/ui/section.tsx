"use client";

import {
  ActionButton,
  ActionMenu,
  type MaybeAction,
  useVisibleActions,
} from "@/components/ui/actions";
import { cn } from "@/lib/utils";

/**
 * قسم داخل صفحة يكرر قاعدتها: العنوان في البداية، وزر الإضافة في النهاية
 * فوق جدوله مباشرة.
 *
 * بلا إطار: المحتوى (جدول، قائمة وصف) يحمل إطاره، فلا تتداخل بطاقتان.
 * `variant="card"` للمحتوى الحر الذي يحتاج إطارًا.
 */
export function Section({
  title,
  description,
  actions = [],
  menuActions = [],
  variant = "plain",
  id,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: readonly MaybeAction[];
  menuActions?: readonly MaybeAction[];
  variant?: "plain" | "card";
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const visible = useVisibleActions();
  const shown = visible(actions);
  const menu = visible(menuActions);
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section id={id} aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <h2 id={headingId} className="text-base font-semibold leading-tight">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {shown.length > 0 || menu.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <ActionMenu actions={menu} size="icon-sm" />
            {shown.map((action) => (
              <ActionButton key={action.key} action={action} size="sm" />
            ))}
          </div>
        ) : null}
      </div>

      {variant === "card" ? (
        <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
