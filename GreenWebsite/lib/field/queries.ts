"use client";

import { useQuery } from "@tanstack/react-query";

import { getFieldHome, getFieldSheet } from "./api";
import { useFieldSession } from "./session";

export const fieldKeys = {
  home: ["field", "home"] as const,
  sheet: (groupId: string) => ["field", "sheet", groupId] as const,
};

/**
 * القراءة مفتوحة بلا شبكة أيضًا: الحالة `offline` تعني هوية معروفة ومحفوظًا
 * قد يكون على الجهاز، فيُعرض هو ويفشل الجلب خلفه بصمت.
 */
function useCanRead() {
  const { status } = useFieldSession();

  return status === "authenticated" || status === "offline";
}

export function useFieldHome() {
  return useQuery({
    queryKey: fieldKeys.home,
    queryFn: ({ signal }) => getFieldHome(signal),
    enabled: useCanRead(),
  });
}

export function useFieldSheet(groupId: string | null) {
  const canRead = useCanRead();

  return useQuery({
    queryKey: fieldKeys.sheet(groupId ?? "none"),
    queryFn: ({ signal }) => getFieldSheet(groupId!, signal),
    enabled: canRead && groupId !== null,
  });
}
