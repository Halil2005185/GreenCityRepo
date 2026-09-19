import Link from "next/link";

import { Backdrop } from "@/components/ui/backdrop";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

/**
 * شريط الدعوة في ذيل كل صفحة: لوحة مرسومة، عنوان ودعوتان.
 *
 * النص فوق اللوحة بيجٌ كامل — القاعدة مشروحة عند `.on-painted` في globals.css.
 */
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
    <section className="on-painted relative isolate overflow-hidden border-y border-border">
      <Backdrop src="/bg/section.webp" />

      <Container>
        <div className="flex flex-col items-start gap-8 py-16 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-bold leading-[1.5] tracking-tight text-foreground lg:text-3xl">
              {title}
            </h2>
            <p className="text-base leading-loose text-foreground">
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
