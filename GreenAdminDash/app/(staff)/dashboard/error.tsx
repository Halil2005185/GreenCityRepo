"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/states";

/**
 * خطأ غير متوقع أثناء رسم صفحة من اللوحة: يبقى الشريط الجانبي والتنقل،
 * ويظهر مكان المحتوى وحده سطر وزر لإعادة المحاولة بدل صفحة بيضاء.
 * أخطاء الـAPI المعتادة تعالجها الصفحات نفسها ولا تصل إلى هنا.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <ErrorState title="تعذّر عرض هذه الصفحة." onRetry={retry} />
    </div>
  );
}
