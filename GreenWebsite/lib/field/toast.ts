"use client";

import { useSyncExternalStore } from "react";

export type Toast = {
  id: number;
  message: string;
  tone: "neutral" | "danger";
};

const NONE: readonly Toast[] = [];

/** ما يُعرض معًا. الرابع يدفع الأول: الشاشة صغيرة، والأحدث أهم. */
const MAX_VISIBLE = 3;

let toasts: readonly Toast[] = NONE;
let sequence = 0;

const listeners = new Set<() => void>();

function publish(next: readonly Toast[]) {
  toasts = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
  };
}

export function dismissToast(id: number) {
  publish(toasts.filter((toast) => toast.id !== id));
}

/**
 * رسالة عابرة أسفل الشاشة. لما لا يُرى أثره في مكانه: ملاحظة أُضيفت، صورة
 * حُفظت، أو تسجيل تعذّر. النقرة التي يتبدّل بها الصف لا تحتاجها.
 */
export function notify(message: string, tone: Toast["tone"] = "neutral") {
  const id = ++sequence;

  publish([...toasts.slice(1 - MAX_VISIBLE), { id, message, tone }]);
  // الخطأ يبقى أطول: يُقرأ ويُفهم، لا يُلمح.
  setTimeout(() => dismissToast(id), tone === "danger" ? 9000 : 4000);
}

export function useToasts() {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => NONE,
  );
}

/**
 * ينفّذ فعلًا ميدانيًا ويقول ما جرى. الفعل نفسه حفظٌ في الطابور، ففشله
 * عطل في الجهاز لا في الشبكة — وهذا ما تقوله الرسالة.
 */
export async function attempt(action: () => Promise<unknown>, done?: string) {
  try {
    await action();

    if (done) notify(done);

    return true;
  } catch (error) {
    console.error("[field] تعذّر تسجيل الفعل:", error);
    notify("تعذّر حفظ ما سجّلته على هذا الجهاز. حاول مرة أخرى.", "danger");

    return false;
  }
}
