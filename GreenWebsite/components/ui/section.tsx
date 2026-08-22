import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

type SectionProps = React.ComponentProps<"section"> & {
  /** كلمة تمهيدية فوق العنوان تعطي القسم سياقًا دون إطالة العنوان. */
  eyebrow?: string;
  title?: string;
  description?: string;
  /** رابط «الكل» أو ما شابه، يظهر بمحاذاة العنوان على الشاشات الواسعة. */
  action?: React.ReactNode;
  muted?: boolean;
};

export function Section({
  eyebrow,
  title,
  description,
  action,
  muted = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "py-16 sm:py-20",
        muted && "bg-muted/40 border-y border-border",
        className,
      )}
      {...props}
    >
      <Container>
        {(title || description || action) && (
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl space-y-3">
              {eyebrow && (
                <p className="text-sm font-medium text-primary">{eyebrow}</p>
              )}
              {title && (
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-base leading-relaxed text-muted-foreground">
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

/** عنوان الصفحة الداخلية: بديل القسم البطل في ما دون الصفحة الرئيسية. */
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="hero-surface border-b border-border py-14 sm:py-20">
      <Container>
        <div className="max-w-3xl space-y-4">
          {eyebrow && (
            <p className="text-sm font-medium text-primary">{eyebrow}</p>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="text-lg leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </Container>
    </div>
  );
}
