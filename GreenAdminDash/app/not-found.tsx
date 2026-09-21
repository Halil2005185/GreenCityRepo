import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { buttonVariants } from "@/components/ui/button";

/** صفحة 404 بالعربية بدل صفحة Next الافتراضية بالإنجليزية. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo className="h-14" />
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        الرابط قديم أو فيه خطأ، أو أن الصفحة لم تعد متاحة.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        العودة إلى اللوحة
      </Link>
    </div>
  );
}
