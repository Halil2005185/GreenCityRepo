"use client";

import { useEffect } from "react";

import { FIELD_SCOPE } from "@/lib/field/config";

/**
 * يسجّل عامل الخدمة في نطاق التطبيق.
 *
 * في بناء الإنتاج وحده: في التطوير يتغيّر كل ملف مع كل حفظ، وعامل خدمة
 * يحفظ الصفحات يعرض نسخة الأمس ويخفي ما كُتب للتو. السلوك بلا شبكة يُجرَّب
 * على `next build && next start`.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(`${FIELD_SCOPE}sw.js`, {
        scope: FIELD_SCOPE,
        // الملف نفسه لا يُقرأ من ذاكرة HTTP عند فحص التحديث.
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        // بلا عامل خدمة يعمل التطبيق والشبكة موصولة؛ ما يُفقد الفتح بلا شبكة.
        console.warn("[field] تعذّر تسجيل عامل الخدمة:", error);
      });
  }, []);

  return null;
}
