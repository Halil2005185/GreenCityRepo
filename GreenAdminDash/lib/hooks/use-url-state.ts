"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

function write(pathname: string, params: URLSearchParams) {
  const query = params.toString();

  window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
}

/**
 * حالة الصفحة في عنوانها: البحث والمرشحات والتبويب ورقم الصفحة.
 *
 * هكذا يعيد الرجوع من صفحة التفاصيل القائمة كما تُركت، ويصلح الرابط
 * للمشاركة. الكتابة بـ`history.replaceState` لا `router.replace`: Next
 * يدمجها مع `useSearchParams` دون طلب للخادم، ولا تملأ سجل المتصفح بكل
 * ضغطة في البحث.
 *
 * القيمة المساوية للافتراضي تُحذف من العنوان فيبقى نظيفًا. وتغيير أي
 * مرشح يعيد ترقيم الجدول إلى الصفحة الأولى (`page`)، لأن الصفحة الخامسة
 * من نتائج قديمة لا معنى لها في نتائج جديدة.
 */
export function useUrlState<const T extends Record<string, string>>(defaults: T) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // الافتراضيات تُمرَّر عادة كائنًا حرفيًا جديدًا مع كل تصيير؛ مفتاحها
  // النصي يُبقي القيم والدوال المشتقة منها ثابتة ما لم تتغير فعلًا.
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = useMemo(() => JSON.parse(defaultsKey) as T, [defaultsKey]);

  const state = useMemo(() => {
    const result = {} as { [K in keyof T]: string };

    for (const key of Object.keys(stableDefaults) as Array<keyof T & string>) {
      result[key] = searchParams.get(key) ?? stableDefaults[key];
    }

    return result;
  }, [searchParams, stableDefaults]);

  const setState = useCallback(
    (patch: Partial<Record<keyof T & string, string | null | undefined>>) => {
      const params = new URLSearchParams(window.location.search);
      let touchesFilters = false;

      for (const [key, value] of Object.entries(patch) as Array<
        [string, string | null | undefined]
      >) {
        if (value == null || value === "" || value === stableDefaults[key]) {
          params.delete(key);
        } else {
          params.set(key, value);
        }

        if (key !== "page") touchesFilters = true;
      }

      if (touchesFilters && !("page" in patch)) params.delete("page");

      write(pathname, params);
    },
    [pathname, stableDefaults],
  );

  const reset = useCallback(() => {
    const params = new URLSearchParams(window.location.search);

    for (const key of Object.keys(stableDefaults)) params.delete(key);
    params.delete("page");

    write(pathname, params);
  }, [pathname, stableDefaults]);

  return [state, setState, reset] as const;
}
