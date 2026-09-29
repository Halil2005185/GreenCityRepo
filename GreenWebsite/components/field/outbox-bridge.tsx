"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { attachOutbox, detachOutbox, flush, useOutbox } from "@/lib/field/outbox";
import { useFieldSession } from "@/lib/field/session";

/** ما دام في الطابور ما ينتظر، يُجرَّب إرساله بهذه الوتيرة والتطبيق ظاهر. */
const POLL_MS = 30_000;

/**
 * يصل الطابور بالجلسة، ويفرّغه كلما سنحت فرصة.
 *
 * المزامنة هنا لا في عامل الخدمة: واجهة Background Sync غير متاحة على iOS،
 * ولا نبني على ما يعمل في نصف الأجهزة. فالطابور يُرسَل والتطبيق مفتوح —
 * عند الفتح، وعند عودة الشبكة، وعند العودة إلى التطبيق، وبعد كل تسجيل.
 */
export function OutboxBridge() {
  const queryClient = useQueryClient();
  const { status, identity } = useFieldSession();
  const { items } = useOutbox();

  // الهوية تكفي بلا شبكة: ما سُجّل أمس يُقرأ اليوم ولو لم يُتحقَّق من الجلسة بعد.
  const ownerId =
    status === "authenticated" || status === "offline"
      ? (identity?.userId ?? null)
      : null;

  useEffect(() => {
    if (!ownerId) return;

    void attachOutbox(ownerId, queryClient).then(() => flush());

    return detachOutbox;
  }, [ownerId, queryClient]);

  // الجلسة تحققت بعد انقطاع: ما توقف عند «انتهت الجلسة» يمضي الآن.
  useEffect(() => {
    if (status === "authenticated") void flush();
  }, [status]);

  const waiting = items.some((item) => item.status === "pending");

  useEffect(() => {
    if (!ownerId) return;

    const attempt = () => {
      if (document.visibilityState === "visible") void flush();
    };

    window.addEventListener("online", attempt);
    document.addEventListener("visibilitychange", attempt);

    const timer = waiting ? setInterval(attempt, POLL_MS) : null;

    return () => {
      window.removeEventListener("online", attempt);
      document.removeEventListener("visibilitychange", attempt);

      if (timer) clearInterval(timer);
    };
  }, [ownerId, waiting]);

  return null;
}
