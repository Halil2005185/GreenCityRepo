import Link from "next/link";

import { Backdrop } from "@/components/ui/backdrop";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="relative isolate">
      <Backdrop src="/bg/section.webp" />

      <Container>
        {/* النص هنا بيجٌ كامل لا مخفَّف — القاعدة مشروحة في `Backdrop`. */}
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 py-24 text-center">
          <p className="numeric text-6xl font-bold text-primary">404</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            الصفحة غير موجودة
          </h1>
          <p className="max-w-md text-base leading-loose text-foreground">
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
    </div>
  );
}
