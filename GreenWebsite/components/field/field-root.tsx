"use client";

import { FieldChrome } from "@/components/field/field-chrome";
import { OutboxBridge } from "@/components/field/outbox-bridge";
import { PushBridge } from "@/components/field/push-bridge";
import { ServiceWorkerRegistration } from "@/components/field/sw-register";
import { FieldToaster } from "@/components/field/toaster";
import { FieldQueryProvider } from "@/lib/field/query";
import { FieldSessionProvider } from "@/lib/field/session";

/**
 * جذر التطبيق في المتصفح: المحفوظ ثم الجلسة ثم القشرة.
 *
 * الترتيب مقصود: الجلسة تمسح المحفوظ حين يتبدّل صاحبها، فتحتاج عميل
 * الاستعلامات فوقها؛ والقشرة تقرأ الاثنين لتعرف ما تعرضه في رأسها.
 *
 * والطابور يُربط هنا لا في شاشة بعينها: ما سُجّل في «الحضور» يُرسَل ولو
 * انتقل القائد إلى «الصور» قبل أن تعود الشبكة.
 */
export function FieldRoot({ children }: { children: React.ReactNode }) {
  return (
    <FieldQueryProvider>
      <FieldSessionProvider>
        <ServiceWorkerRegistration />
        <OutboxBridge />
        <PushBridge />
        <FieldChrome>{children}</FieldChrome>
        <FieldToaster />
      </FieldSessionProvider>
    </FieldQueryProvider>
  );
}
