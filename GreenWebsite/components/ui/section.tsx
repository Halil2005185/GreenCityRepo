import { Backdrop } from "@/components/ui/backdrop";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

/**
 * عنوان قسم بالشريط العمودي الأخضر — توقيع التصميم الجديد، وهو في الأصل
 * `SectionHeading` المكرَّر في الصفحة المُسلَّمة. هنا مرة واحدة.
 */
export function SectionHeading({
  eyebrow,
  title,
  as: Tag = "h2",
  className,
}: {
  eyebrow?: string;
  title: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <span
        aria-hidden
        className="mt-1 h-10 w-1 shrink-0 rounded-full bg-accent-ink lg:h-12"
      />
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-sm font-medium text-accent-ink">{eyebrow}</p>
        )}
        <Tag className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
          {title}
        </Tag>
      </div>
    </div>
  );
}

type SectionProps = React.ComponentProps<"section"> & {
  /** كلمة تمهيدية فوق العنوان تعطي القسم سياقًا دون إطالة العنوان. */
  eyebrow?: string;
  title?: string;
  description?: string;
  /** رابط «الكل» أو ما شابه، يظهر بمحاذاة العنوان على الشاشات الواسعة. */
  action?: React.ReactNode;
  /** سطح مرتفع قليلًا يفصل قسمًا عمّا قبله دون صورة تُحمَّل. */
  muted?: boolean;
  /** خلفية مرسومة. تُستعمل للأقسام المميَّزة وحدها لا لكل قسم. */
  backdrop?: boolean;
};

export function Section({
  eyebrow,
  title,
  description,
  action,
  muted = false,
  backdrop = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "py-16 sm:py-20",
        muted && "border-y border-border bg-surface/50",
        backdrop && "on-painted relative isolate border-y border-border",
        className,
      )}
      {...props}
    >
      {backdrop && <Backdrop src="/bg/section.webp" />}

      <Container>
        {(title || description || action) && (
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl space-y-4">
              {title && <SectionHeading eyebrow={eyebrow} title={title} />}
              {description && (
                <p
                  className={cn(
                    "text-base leading-loose",
                    /* فوق اللوحة بيجٌ كامل — القاعدة في `Backdrop`. */
                    backdrop ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {description}
                </p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}

/**
 * عنوان الصفحة الداخلية: بديل القسم البطل في ما دون الصفحة الرئيسية.
 *
 * على لوحة مرسومة لا على تدرّج: التصميم الجديد يعرّف الصفحة بصورتها،
 * والصفحات الداخلية كانت الجزء الذي لم يصل إليه التصميم المُسلَّم.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="on-painted relative isolate border-b border-border py-16 sm:py-24">
      <Backdrop src="/bg/section.webp" priority />

      <Container>
        <div className="max-w-3xl space-y-5">
          {eyebrow && (
            <p className="text-sm font-medium text-accent-ink">{eyebrow}</p>
          )}
          <h1 className="text-3xl font-bold leading-[1.25] tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="text-lg leading-loose text-foreground">
              {description}
            </p>
          )}
          {children}
        </div>
      </Container>
    </div>
  );
}
