import { CircleAlert } from "lucide-react";

import type { FieldSheet } from "@/lib/field/api";

const WHY_CLOSED: Record<FieldSheet["initiative"]["status"], string> = {
  DRAFT: "المبادرة ما زالت مسودة، فلا يُسجَّل عليها شيء قبل بدء تنفيذها.",
  PLANNING: "المبادرة قيد التخطيط، ويبدأ التسجيل حين يبدأ تنفيذها.",
  ACTIVE: "",
  COMPLETED: "أُغلقت المبادرة، وانتهت مهلة استقبال ما سُجّل في الميدان.",
  CANCELLED: "أُلغيت المبادرة.",
};

/** لماذا لا يُسجَّل على هذه الورقة الآن، أو `null` إن كان التسجيل مفتوحًا. */
export function closedReason(sheet: FieldSheet) {
  if (sheet.site.status === "CANCELLED") {
    return "أُلغي هذا الموقع، فلا يُسجَّل عليه شيء.";
  }

  if (!sheet.initiative.acceptsEntries) {
    return WHY_CLOSED[sheet.initiative.status];
  }

  return null;
}

/**
 * يقول لماذا غابت أزرار التسجيل. يظهر في كل تبويب يُسجَّل منه: من فتح
 * «الحضور» مباشرة لا يعرف ما كُتب في «اليوم».
 */
export function ClosedNotice({ sheet }: { sheet: FieldSheet }) {
  const reason = closedReason(sheet);

  if (!reason) return null;

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-foreground"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      {reason}
    </p>
  );
}
