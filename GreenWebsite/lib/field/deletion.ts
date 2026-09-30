"use client";

import { useSyncExternalStore } from "react";

/**
 * علامة على الجهاز: حُذفت بيانات صاحبه، وقاله الخادم. بها تبقى الرسالة على
 * شاشة المدخل حتى يقرأها، بدل إشعار عابر يزول في ثوانٍ عن أمرٍ لا يعود.
 */
const KEY = "gc-field-deletion-done";

const listeners = new Set<() => void>();

function read() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // مخزن محجوب (تصفّح خاص): الإشعار العابر وحده يقولها.
    return false;
  }
}

export function markDeletionDone(done: boolean) {
  try {
    if (done) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // كما في `read`.
  }

  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
  };
}

export function useDeletionDone() {
  return useSyncExternalStore(subscribe, read, () => false);
}
