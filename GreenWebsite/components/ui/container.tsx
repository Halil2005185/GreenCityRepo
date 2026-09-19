import { cn } from "@/lib/utils";

/**
 * عرض قراءة واحد لكل الصفحات، فلا تتفاوت الحواف بين قسم وآخر.
 *
 * `max-w-7xl` كما في التصميم المُسلَّم — أوسع من السابق، وهو ما تحتاجه
 * الأقسام ذات العمودين وخلفياتها المرسومة. والحاشية 16px على الهاتف حدًّا
 * أدنى فلا يلتصق نص بحافة الشاشة.
 */
export function Container({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
