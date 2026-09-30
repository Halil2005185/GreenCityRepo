import type { FieldCard, FieldSheet } from "./api";
import { damascusDay } from "./labels";
import {
  type CardItem,
  type OutboxItem,
  type RsvpItem,
  type SelfCheckinItem,
  type SheetItem,
  isCardItem,
  pendingId,
} from "./outbox-types";
import { withReading } from "./targets";

/**
 * هل الورقة المحفوظة بالشكل الذي يعرفه هذا الكود؟
 *
 * رقم نسخة المحفوظ (`FIELD_DATA_VERSION`) هو ما يُسقط القديم، وهذا حزام
 * ثانٍ: ورقة من نسخة أقدم نُسي معها رفع الرقم تُهمَل حتى يصل جديدها، بدل
 * أن تُسقط الصفحة كلها على قائد في الميدان.
 */
export function isCurrentShape(
  sheet: FieldSheet | undefined,
): sheet is FieldSheet {
  return (
    sheet !== undefined &&
    Array.isArray(sheet.announcements) &&
    Array.isArray(sheet.members) &&
    Array.isArray(sheet.photos) &&
    Array.isArray(sheet.targets) &&
    Array.isArray(sheet.tasks) &&
    typeof sheet.day === "string" &&
    typeof sheet.permissions === "object" &&
    typeof sheet.checkin === "object"
  );
}

/**
 * الورقة ليومٍ بعينه. ورقة حُفظت أمس وفُتحت اليوم بلا شبكة تحمل حضور أمس:
 * لو عُرض كما هو لظهر من حضر أمس حاضرًا اليوم، ولما استطاع القائد أن يسجّل
 * حضوره في اليوم الثاني من الحملة. فيُصفَّر الحضور وتبقى القائمة.
 */
export function forDay(sheet: FieldSheet, day: string): FieldSheet {
  if (sheet.day === day) return sheet;

  return {
    ...sheet,
    day,
    members: sheet.members.map((member) => ({ ...member, attendance: null })),
  };
}

/**
 * أثر فعلٍ واحد على ورقة اليوم — دالة خالصة، تعيد ورقة جديدة.
 *
 * بها يُرى ما سُجّل بلا شبكة كأنه وصل: الورقة المعروضة هي ورقة الخادم
 * وعليها ما في الطابور. لا تُكتب النقرة في ذاكرة الاستعلامات عند وقوعها؛
 * الطابور هو مصدر ما لم يُرسَل، وحين يُرسَل الفعل يُثبَّت أثره بهذه الدالة
 * نفسها ثم يُسأل الخادم عن حقيقته.
 */
export function applyItem(sheet: FieldSheet, item: SheetItem): FieldSheet {
  switch (item.kind) {
    case "attendance":
      // حضور يومٍ آخر لم يُرسَل بعد: يُرسَل ليومه، ولا يُعرض حضورًا لهذا اليوم.
      if (damascusDay(item.payload.checkedInAt) !== sheet.day) return sheet;

      return {
        ...sheet,
        members: sheet.members.map((member) =>
          member.participantId === item.payload.participantId &&
          !member.attendance
            ? {
                ...member,
                attendance: {
                  id: pendingId(item.clientId),
                  checkedInAt: item.payload.checkedInAt,
                  method: "LEAD_TAP" as const,
                },
              }
            : member,
        ),
      };

    case "walk-in": {
      const id = pendingId(item.clientId);

      // الخادم عرفه بعد الإرسال وعاد في الورقة: لا يُضاف ثانية.
      if (sheet.members.some((member) => member.id === id)) return sheet;

      return {
        ...sheet,
        members: [
          ...sheet.members,
          {
            id,
            participantId: id,
            fullNameAr: item.payload.fullNameAr,
            phone: item.payload.phone ?? null,
            role: "MEMBER" as const,
            rsvp: "UNKNOWN" as const,
            // صار عضوًا منذ جاء؛ وحضوره ليومه الذي جاء فيه وحده.
            attendance:
              damascusDay(item.payload.checkedInAt) === sheet.day
                ? {
                    id,
                    checkedInAt: item.payload.checkedInAt,
                    method: "WALK_IN" as const,
                  }
                : null,
          },
        ],
      };
    }

    case "attendance-undo":
      return {
        ...sheet,
        members: sheet.members.map((member) =>
          member.participantId === item.payload.participantId
            ? { ...member, attendance: null }
            : member,
        ),
      };

    case "impact":
      return {
        ...sheet,
        targets: sheet.targets.map((target) =>
          target.metricId === item.payload.metricId
            ? withReading(target, item.payload.value)
            : target,
        ),
      };

    case "task-status":
      return {
        ...sheet,
        tasks: sheet.tasks.map((task) =>
          task.id === item.payload.taskId
            ? {
                ...task,
                // كما يقرر الخادم: «أُنجزت» مراجعةٌ عند من لا يعتمد الإنجاز.
                status:
                  item.payload.status === "DONE" &&
                  !sheet.permissions.canApproveTasks
                    ? ("IN_REVIEW" as const)
                    : item.payload.status,
                blockedReasonAr:
                  item.payload.status === "BLOCKED"
                    ? (item.payload.blockedReasonAr ?? null)
                    : null,
              }
            : task,
        ),
      };

    case "task-comment":
      return {
        ...sheet,
        tasks: sheet.tasks.map((task) =>
          task.id === item.payload.taskId
            ? { ...task, commentCount: task.commentCount + 1 }
            : task,
        ),
      };

    case "site-status":
      return { ...sheet, site: { ...sheet.site, status: item.payload.status } };

    case "photo":
      // الصورة نفسها تعرضها شاشة الصور من مخزنها؛ هنا عددها وحده.
      return { ...sheet, photoCount: sheet.photoCount + 1 };
  }
}

/**
 * ورقة الخادم وعليها ما ينتظر الإرسال من هذه المجموعة، بترتيب تسجيله.
 *
 * ما رفضه الخادم لا يُطبَّق: لم يقع، ومكانه قائمة «تعذّر إرساله» حتى يقرر
 * صاحبه.
 */
export function overlay(
  sheet: FieldSheet,
  items: readonly OutboxItem[],
  today: string,
): FieldSheet {
  return items
    .filter(
      (item): item is SheetItem =>
        !isCardItem(item) &&
        item.groupId === sheet.group.id &&
        item.status === "pending",
    )
    .reduce(applyItem, forDay(sheet, today));
}

/** أثر تأكيد حضورٍ لم يُرسَل بعد على بطاقة المتطوع. */
export function applyRsvp(card: FieldCard, item: RsvpItem): FieldCard {
  return {
    ...card,
    memberships: card.memberships.map((membership) =>
      membership.memberId === item.payload.memberId
        ? {
            ...membership,
            rsvp: item.payload.coming
              ? ("COMING" as const)
              : ("NOT_COMING" as const),
          }
        : membership,
    ),
  };
}

/**
 * أثر تسجيلٍ ذاتي لم يُرسَل بعد: حضورٌ في يوم كتابة الرمز. الخادم قد يرفض
 * الرمز حين يصله؛ حتى ذلك الحين البطاقة تقول ما سجّله صاحبها.
 */
export function applySelfCheckin(
  card: FieldCard,
  item: SelfCheckinItem,
): FieldCard {
  const day = damascusDay(item.payload.scannedAt);

  return {
    ...card,
    memberships: card.memberships.map((membership) =>
      membership.group.id === item.groupId &&
      !membership.attendedOn.includes(day)
        ? { ...membership, attendedOn: [...membership.attendedOn, day].sort() }
        : membership,
    ),
  };
}

export function applyCardItem(card: FieldCard, item: CardItem): FieldCard {
  return item.kind === "rsvp"
    ? applyRsvp(card, item)
    : applySelfCheckin(card, item);
}

/** البطاقة وعليها ما ينتظر الإرسال؛ آخر تأكيد يغلب ما قبله. */
export function overlayCard(
  card: FieldCard,
  items: readonly OutboxItem[],
): FieldCard {
  return items
    .filter(
      (item): item is CardItem => isCardItem(item) && item.status === "pending",
    )
    .reduce(applyCardItem, card);
}
