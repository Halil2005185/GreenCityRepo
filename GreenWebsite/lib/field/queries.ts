"use client";

import { type QueryClient, useQuery } from "@tanstack/react-query";

import {
  getFieldCard,
  getFieldHome,
  getFieldRecord,
  getFieldSheet,
  issueFieldCertificate,
} from "./api";
import { useSessionKind } from "./session";

export const fieldKeys = {
  home: ["field", "home"] as const,
  card: ["field", "card"] as const,
  record: ["field", "record"] as const,
  certificate: ["field", "certificate"] as const,
  sheet: (groupId: string) => ["field", "sheet", groupId] as const,
};

/**
 * القراءة مفتوحة بلا شبكة أيضًا: الحالة `offline` تعني هوية معروفة ومحفوظًا
 * قد يكون على الجهاز، فيُعرض هو ويفشل الجلب خلفه بصمت.
 *
 * وكل قراءة لصاحبها: ورقة القائد لا تُطلب برابط متطوع، ولا العكس.
 */
function useCanRead() {
  return useSessionKind() === "STAFF";
}

export function useFieldHome() {
  return useQuery({
    queryKey: fieldKeys.home,
    queryFn: ({ signal }) => getFieldHome(signal),
    enabled: useCanRead(),
  });
}

/** بطاقة المتطوع: أين ومتى ومع من، ثم ما تحقق بعد اليوم. */
export function useFieldCard() {
  return useQuery({
    queryKey: fieldKeys.card,
    queryFn: ({ signal }) => getFieldCard(signal),
    enabled: useSessionKind() === "PARTICIPANT",
  });
}

/**
 * حضور المتطوع تغيّر من هذا الجهاز: سجلّه وشهادته يُحسبان منه، فيُطلبان من
 * جديد عند فتحهما بدل أن يُعرض ما حُفظ قبله.
 */
export function attendanceChanged(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: fieldKeys.record });
  void queryClient.invalidateQueries({ queryKey: fieldKeys.certificate });
}

/** سجل المتطوع عبر الحملات: ما حضره بأيامه وساعاته. */
export function useFieldRecord() {
  return useQuery({
    queryKey: fieldKeys.record,
    queryFn: ({ signal }) => getFieldRecord(signal),
    enabled: useSessionKind() === "PARTICIPANT",
  });
}

/**
 * شهادة المتطوع. تُطلب حين تُفتح صفحتها وشرطاها قائمان، وتُحفظ على الجهاز
 * كبقية ما يُقرأ: من فتحها مرة يطبعها بلا شبكة.
 */
export function useFieldCertificate(wanted: boolean) {
  const kind = useSessionKind();

  return useQuery({
    queryKey: fieldKeys.certificate,
    queryFn: ({ signal }) => issueFieldCertificate(signal),
    enabled: kind === "PARTICIPANT" && wanted,
  });
}

/**
 * ورقة المجموعة لقائدها ولمساعده. المساعد حامل رابط، ومجموعاته تأتي من
 * بطاقته؛ والخادم يردّ من ليس مساعدًا فيها.
 */
export function useFieldSheet(groupId: string | null) {
  const kind = useSessionKind();

  return useQuery({
    queryKey: fieldKeys.sheet(groupId ?? "none"),
    queryFn: ({ signal }) => getFieldSheet(groupId!, signal),
    enabled: kind !== null && groupId !== null,
  });
}
