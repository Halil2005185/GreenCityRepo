import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FieldNotice, PageTitle } from "@/components/field/states";
import { buttonVariants } from "@/components/ui/button";
import { FIELD_ROUTES } from "@/lib/field/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "بلا اتصال" };

/**
 * ما يعرضه عامل الخدمة حين تُطلب صفحة لم تُحفظ والشبكة مقطوعة. لا يصلها
 * أحد برابط؛ هي بديل الخطأ الذي كان المتصفح سيعرضه بلغته وشكله.
 */
export default function FieldOfflinePage() {
  return (
    <>
      <PageTitle title="بلا اتصال" />
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="هذه الصفحة ليست على جهازك"
        description="لا اتصال بالشبكة الآن، وهذه الصفحة لم تُفتح من قبل لتُحفظ. ورقة يومك محفوظة وتعمل بلا شبكة."
      >
        <Link
          href={FIELD_ROUTES.home}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          إلى ورقة اليوم
        </Link>
      </FieldNotice>
    </>
  );
}
