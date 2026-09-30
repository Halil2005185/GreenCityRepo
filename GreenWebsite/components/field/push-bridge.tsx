"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { syncPush } from "@/lib/field/push";
import { useFieldSession } from "@/lib/field/session";

/** ما يرسله عامل الخدمة حين يُنقر إشعار والتطبيق مفتوح. */
const ANNOUNCEMENT = "gc-field-announcement";

/**
 * يصل الإشعارات بالجلسة.
 *
 * عند كل دخول يُعاد تسجيل اشتراك هذا الجهاز باسم صاحب الجلسة، فالإشعار يتبع
 * من يفتح التطبيق الآن. وحين يُنقر إشعار والتطبيق مفتوح تُقرأ الورقة أو
 * البطاقة من جديد: ما أعلنه الإشعار يظهر في الصفحة التي أعاد إليها.
 */
export function PushBridge() {
  const queryClient = useQueryClient();
  const { status, identity } = useFieldSession();

  const ownerId =
    status === "authenticated" ? (identity?.ownerId ?? null) : null;

  useEffect(() => {
    if (!ownerId) return;

    // فشله لا يُعرض: لم يطلبه أحد، ويُعاد عند الفتح التالي.
    void syncPush().catch(() => undefined);
  }, [ownerId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;

      if (
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        data.type === ANNOUNCEMENT
      ) {
        void queryClient.invalidateQueries({ queryKey: ["field"] });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [queryClient]);

  return null;
}
