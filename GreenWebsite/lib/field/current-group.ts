"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * المجموعة التي يعمل عليها القائد الآن.
 *
 * في المخزن لا في العنوان: تبويبات التطبيق («اليوم»، «الحضور»، «الصور»)
 * كلها عن المجموعة نفسها، والعنوان بلا معرّف يبقي كل صفحة ملفًا واحدًا
 * يُحفظ مرة ويُفتح بلا شبكة لأي مجموعة.
 */
const STORAGE_KEY = "gc-field-group";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // تبويب آخر من التطبيق غيّر المجموعة: يتبعه هذا.
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function chooseGroup(groupId: string | null) {
  try {
    if (groupId) window.localStorage.setItem(STORAGE_KEY, groupId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // مخزن محجوب: الاختيار يعيش ما عاشت الصفحة.
  }

  for (const listener of listeners) listener();
}

/**
 * المختارة إن كانت ما زالت من مجموعاته، وإلا أولاها — وهي الأقرب موعدًا
 * كما يرتّبها الخادم. مجموعة أُعفي من قيادتها لا تبقى مختارة.
 */
export function useCurrentGroup<Group extends { id: string }>(
  groups: readonly Group[] | undefined,
) {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const current =
    groups?.find((group) => group.id === stored) ?? groups?.[0] ?? null;

  const select = useCallback((groupId: string) => chooseGroup(groupId), []);

  return { current, select };
}
