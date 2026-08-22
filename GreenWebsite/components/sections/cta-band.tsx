import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

export function CtaBand({
  title = "لكل جهة دور في إعادة الحياة للمدن",
  description = "الشراكة معنا ليست تبرعًا بل مشاركة: دعم ميداني أو خبرة فنية أو تغطية إعلامية أو مساحة تُستثمر خضرة.",
  primary = { href: "/join", label: "انضم إلينا" },
  secondary = { href: "/partners", label: "أنواع الشراكة" },
}: {
  title?: string;
  description?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <section className="border-y border-border bg-primary/5">
      <Container>
        <div className="flex flex-col items-start gap-6 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
              {primary.label}
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                )}
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
