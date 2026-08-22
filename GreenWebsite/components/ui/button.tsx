import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * أدوات Tailwind المنطقية وحدها (`ms-*`, `pe-*`, `text-start`) — لا
 * `ml-*` ولا `text-left`. تحت `dir="rtl"` تنعكس المنطقية تلقائيًا،
 * بينما الفيزيائية تبقى مثبتة على اليسار وتكسر التخطيط.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-5",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

/**
 * الروابط في هذا الموقع أكثر من الأزرار: كل دعوة إلى إجراء تنقل إلى
 * صفحة. لذلك تُصدَّر الأصناف ليأخذها `<Link>` مباشرة بدل تغليفه بزر —
 * زر داخل رابط عنصر غير صالح ويكسر الوصولية ولوحة المفاتيح.
 */
export { buttonVariants };
