import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="numeric text-5xl font-bold text-primary">404</p>
        <h1 className="text-2xl font-bold tracking-tight">
          الصفحة غير موجودة
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          ربما تغيّر الرابط أو أن المحتوى لم يعد منشورًا.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonVariants()}>
            الصفحة الرئيسية
          </Link>
          <Link
            href="/initiatives"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            المبادرات
          </Link>
        </div>
      </div>
    </Container>
  );
}
