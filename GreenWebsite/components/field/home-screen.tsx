"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { GroupSheet } from "@/components/field/group-sheet";
import { SheetGate } from "@/components/field/sheet-gate";
import { VolunteerCard } from "@/components/field/volunteer-card";
import { chooseGroup } from "@/lib/field/current-group";
import { formatDay } from "@/lib/field/labels";
import { useFieldHome } from "@/lib/field/queries";
import { useSessionKind } from "@/lib/field/session";

/**
 * شاشة «اليوم»: مدخل التطبيق.
 *
 * تعرض ما يناسب من فتحها: دعوة إلى الدخول لمن لا جلسة له، وورقة يوم
 * المجموعة لقائدها، وبطاقة المتطوع لحامل رابط شخصي.
 */
export function HomeScreen() {
  const kind = useSessionKind();

  useRequestedGroup();

  if (kind === "PARTICIPANT") return <VolunteerCard />;

  return (
    <SheetGate
      title="اليوم"
      heading={(group) => ({
        title: group.nameAr,
        description: [
          group.initiativeNameAr,
          group.meetsAt ? formatDay(group.meetsAt) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })}
    >
      {(view) => <GroupSheet {...view} />}
    </SheetGate>
  );
}

/**
 * رابط يحمل `?group=` يختار تلك المجموعة — كأن يرسل المنسّق لقائد رابط
 * مجموعته. يُكتب في المخزن فتتبعه بقية التبويبات.
 */
function useRequestedGroup() {
  const requested = useSearchParams().get("group");
  const groups = useFieldHome().data?.groups;

  useEffect(() => {
    if (requested && groups?.some((group) => group.id === requested)) {
      chooseGroup(requested);
    }
  }, [requested, groups]);
}
