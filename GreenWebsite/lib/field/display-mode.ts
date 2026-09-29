"use client";

import { useSyncExternalStore } from "react";

export type DisplayMode = "browser" | "standalone";

const QUERY = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);

  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

function readMode(): DisplayMode {
  /**
   * `navigator.standalone` خاصية iOS القديمة، أقدم من الاستعلام هناك. تُقرأ
   * معه لأن التطبيق المثبَّت من Safari يصدق فيه أحدهما على الأقل.
   */
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;

  return window.matchMedia(QUERY).matches || legacy === true
    ? "standalone"
    : "browser";
}

/**
 * هل فُتحت الصفحة من الأيقونة المثبّتة أم في متصفح؟
 *
 * للمنطق وحده — دعوة التثبيت، واختيار ما يُعرض من تعليمات. التصميم لا يمرّ
 * من هنا: يبدّله CSS بالمتغيّر `app:` قبل أول رسم، ولو انتظر هذا الخطاف
 * لومضت الصفحة بتصميم الموقع ثم انقلبت.
 *
 * على الخادم وفي أول رسم يعيد `browser`: الخادم لا يعرف من أين فُتحت.
 */
export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(subscribe, readMode, () => "browser");
}
