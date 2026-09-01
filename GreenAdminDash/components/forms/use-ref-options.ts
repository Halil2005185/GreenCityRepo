"use client";

import { useQuery } from "@tanstack/react-query";

import { listAreas, listPrograms } from "@/lib/api/initiatives";
import { listOffices } from "@/lib/api/invitations";

export type RefOption = { value: string; labelAr: string };

/**
 * خيارات المراجع تأتي من كتالوجات النظام لا من السؤال.
 *
 * هذا ما يجعل «أي محافظة تسكن؟» بيانات قابلة للفرز بدل نص حر — وما يعني
 * أن إضافة محافظة إلى `areas` تظهر في كل استمارة دون لمس أي سؤال.
 *
 * ويقرؤها موضعان: معاينة الاستمارة، ومرشّحات شاشة الطلبات. ومصدر واحد
 * لهما يمنع أن تُعرض قيمة في المعاينة ولا تُقابلها قيمة في المرشّح.
 */
export function useRefOptions(enabled: boolean) {
  const areas = useQuery({
    queryKey: ["areas", "GOVERNORATE"],
    queryFn: () => listAreas("GOVERNORATE"),
    enabled,
  });
  const offices = useQuery({
    queryKey: ["offices"],
    queryFn: listOffices,
    enabled,
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: listPrograms,
    enabled,
  });

  return {
    AREA_REF: areas.data?.map((a) => ({ value: a.id, labelAr: a.nameAr })) ?? [],
    OFFICE_REF:
      offices.data?.map((o) => ({ value: o.id, labelAr: o.nameAr })) ?? [],
    PROGRAM_REF:
      programs.data?.map((p) => ({ value: p.id, labelAr: p.nameAr })) ?? [],
  } satisfies Record<string, RefOption[]>;
}
