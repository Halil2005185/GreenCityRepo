import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * أدوات Tailwind المنطقية وحدها (`ms-*`, `pe-*`, `text-start`) — لا
 * `ml-*` ولا `text-left`. تحت `dir="rtl"` تنعكس المنطقية تلقائيًا،
 * بينما الفيزيائية تبقى مثبتة على اليسار وتكسر التخطيط.
 *
 * المقاسات `icon-sm` و`icon-xs` و`xs` أُضيفت لمكوّنات shadcn (زر إغلاق
 * النافذة، أفعال الصفوف)؛ المظهر الأساسي بقي كما كان.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 gap-1 px-2 text-xs",
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-11 px-6",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    /** يمرّر التنسيق إلى العنصر الابن (رابط مثلًا) بدل رسم `<button>`. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  loading = false,
  asChild = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      // الزر أثناء التنفيذ معطّل فعليًا لا شكلًا، لئلا يُرسل الطلب مرتين.
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
