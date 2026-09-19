import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * أدوات Tailwind المنطقية وحدها (`ms-*`, `pe-*`, `text-start`) — لا
 * `ml-*` ولا `text-left`. تحت `dir="rtl"` تنعكس المنطقية تلقائيًا،
 * بينما الفيزيائية تبقى مثبتة على اليسار وتكسر التخطيط.
 *
 * الحواف دائرية كاملة في كل الأنواع: هذه مفردة التصميم الأساسية في
 * الهوية الجديدة — الأزرار والشارات وحبّات التنقل كلها حبّات.
 *
 * الارتفاع الطفيف عند التمرير تحت `motion-safe` وحده: هو زينة، ومن طلب
 * تقليل الحركة طلبها في الزينة قبل غيرها.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** الأخضر الحيوي على الأخضر العميق: 8.97:1. */
        default:
          "bg-primary text-primary-foreground motion-safe:hover:-translate-y-0.5 hover:bg-foreground hover:text-background",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent motion-safe:hover:-translate-y-0.5",
        /** سطحٌ شفيف بحدّ: يقرأ زرًا ثانويًا دون منافسة الأخضر الحيوي. */
        outline:
          "border border-border bg-foreground/10 text-foreground backdrop-blur-sm hover:bg-foreground hover:text-background motion-safe:hover:-translate-y-0.5",
        ghost: "text-foreground hover:bg-primary/10",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-xs",
        default: "h-11 px-6",
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
