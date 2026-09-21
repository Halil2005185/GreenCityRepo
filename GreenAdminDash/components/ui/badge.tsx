import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * شارة بشكل واحد في كل اللوحة. الألوان من رموز `globals.css` وحدها.
 *
 * نص الأصفر والأخضر ممزوج بلون النص الأساسي: الأصفر الصافي على خلفيته
 * الفاتحة يقارب تباينه 2:1 فلا يُقرأ، والمزج يُبقي اللون ويرفع التباين.
 */
export const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        accent: "bg-accent text-accent-foreground",
        primary: "bg-primary/10 text-primary",
        success:
          "bg-success/15 text-[color-mix(in_oklch,var(--success)_70%,var(--foreground))]",
        warning:
          "bg-warning/20 text-[color-mix(in_oklch,var(--warning)_45%,var(--foreground))]",
        danger: "bg-destructive/10 text-destructive",
        info: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}
