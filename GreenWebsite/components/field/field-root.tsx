"use client";

import { FieldChrome } from "@/components/field/field-chrome";
import { ServiceWorkerRegistration } from "@/components/field/sw-register";
import { FieldQueryProvider } from "@/lib/field/query";
import { FieldSessionProvider } from "@/lib/field/session";

/**
 * جذر التطبيق في المتصفح: المحفوظ ثم الجلسة ثم القشرة.
 *
 * الترتيب مقصود: الجلسة تمسح المحفوظ حين يتبدّل صاحبها، فتحتاج عميل
 * الاستعلامات فوقها؛ والقشرة تقرأ الاثنين لتعرف ما تعرضه في رأسها.
 */
export function FieldRoot({ children }: { children: React.ReactNode }) {
  return (
    <FieldQueryProvider>
      <FieldSessionProvider>
        <ServiceWorkerRegistration />
        <FieldChrome>{children}</FieldChrome>
      </FieldSessionProvider>
    </FieldQueryProvider>
  );
}
