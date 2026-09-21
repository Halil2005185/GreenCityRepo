"use client";

import { useEffect, useState } from "react";

/** قيمة تتأخر عن مصدرها حتى يتوقف التغيّر — للبحث الفوري بلا طلب لكل ضغطة. */
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
