"use client";

import { useMemo, useSyncExternalStore } from "react";

import type {
  FieldCard,
  FieldGroupCard,
  FieldSheet,
  FieldTarget,
  FieldTask,
} from "./api";
import { useCurrentGroup } from "./current-group";
import { damascusDay } from "./labels";
import { discard, enqueue, useOutbox } from "./outbox";
import { clientIdOf } from "./outbox-types";
import { isCurrentShape, overlay } from "./overlay";
import { type PhotoLocation, PHOTO_CONTENT_TYPE } from "./photos";
import { useFieldCard, useFieldHome, useFieldSheet } from "./queries";
import { useSessionKind } from "./session";

type Member = FieldSheet["members"][number];

function subscribeDay(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);

  // هاتف نام في الجيب لا تدقّ مؤقتاته؛ العودة إلى التطبيق تسأل من جديد.
  document.addEventListener("visibilitychange", onChange);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * يوم دمشق الآن، ويتبدّل عند منتصف الليل والتطبيق مفتوح. قيمة نصية، فلا
 * يُعاد الرسم إلا حين يتغيّر اليوم فعلًا.
 */
export function useToday() {
  return useSyncExternalStore(
    subscribeDay,
    () => damascusDay(Date.now()),
    () => "",
  );
}

/**
 * المجموعات التي يساعد المتطوع قائدها، بشكل مجموعات القائد: التبويب نفسه
 * يعرضها، ولا يعرف من أين جاءت. أعدادها أصفار — البطاقة لا تحملها، والورقة
 * تأتي بها.
 */
function assistedGroups(card: FieldCard | undefined) {
  return card?.memberships
    .filter(
      (membership) =>
        membership.role === "ASSISTANT" &&
        membership.site.status !== "CANCELLED",
    )
    .map(
      (membership): FieldGroupCard => ({
        id: membership.group.id,
        nameAr: membership.group.nameAr,
        meetsAt: membership.group.meetsAt,
        meetingPointAr: membership.group.meetingPointAr,
        initiativeId: card.initiative.id,
        initiativeNameAr: card.initiative.nameAr,
        initiativeStatus: card.initiative.status,
        siteId: membership.site.id,
        siteNameAr: membership.site.nameAr,
        siteStatus: membership.site.status,
        areaNameAr: membership.site.areaNameAr,
        taskCount: 0,
        openTaskCount: 0,
        memberCount: 0,
        presentToday: 0,
      }),
    );
}

/**
 * مجموعات صاحب الجلسة: ما يقوده عضو الفريق، أو ما يساعد فيه المتطوع.
 * `source` الاستعلام الذي جاءت منه — حاله حال القائمة.
 */
export function useMyGroups() {
  const kind = useSessionKind();
  const home = useFieldHome();
  const card = useFieldCard();
  const assisted = useMemo(() => assistedGroups(card.data), [card.data]);

  return kind === "PARTICIPANT"
    ? { kind, source: card, groups: assisted }
    : { kind, source: home, groups: home.data?.groups };
}

/**
 * ورقة المجموعة الحالية كما تُعرض: ورقة الخادم وعليها ما ينتظر الإرسال.
 *
 * تبويبات التطبيق كلها تقرأ من هنا، فالحضور الذي سُجّل بلا شبكة يظهر في
 * «الحضور» وفي عدّاد «اليوم» معًا، من مصدر واحد.
 */
export function useGroupSheet() {
  const home = useFieldHome();
  const mine = useMyGroups();
  const { current, select } = useCurrentGroup(mine.groups);
  const query = useFieldSheet(current?.id ?? null);
  const outbox = useOutbox();
  const today = useToday();

  const sheet = useMemo(
    () =>
      isCurrentShape(query.data)
        ? overlay(query.data, outbox.items, today)
        : undefined,
    [query.data, outbox.items, today],
  );

  return {
    home,
    source: mine.source,
    groups: mine.groups,
    group: current,
    select,
    query,
    sheet,
    outbox,
  };
}

const now = () => new Date().toISOString();

/**
 * أفعال القائد على ورقته. كل فعل يُحفظ في الطابور ويعود فورًا: النقرة لا
 * تنتظر الشبكة، والإرسال يجري خلفها.
 */
export function fieldActions(sheet: FieldSheet) {
  const groupId = sheet.group.id;

  return {
    checkIn(member: Member) {
      return enqueue({
        kind: "attendance",
        groupId,
        label: `حضور ${member.fullNameAr}`,
        payload: { participantId: member.participantId, checkedInAt: now() },
      });
    },

    /**
     * التراجع عن حضور. ما لم يخرج من الهاتف بعد يُسحب من الطابور ولا يُرسَل
     * شيء؛ وما خرج أو كان قديمًا يُلغى بفعلٍ ثانٍ.
     */
    async undoCheckIn(member: Member) {
      if (!member.attendance) return;

      const pending = clientIdOf(member.attendance.id);

      if (pending && (await discard(pending))) return;

      await enqueue({
        kind: "attendance-undo",
        groupId,
        label: `التراجع عن حضور ${member.fullNameAr}`,
        payload: {
          participantId: member.participantId,
          ...(pending
            ? { attendanceClientId: pending }
            : { attendanceId: member.attendance.id }),
        },
      });
    },

    addWalkIn(person: { fullNameAr: string; phone?: string }) {
      return enqueue({
        kind: "walk-in",
        groupId,
        label: `حضور ${person.fullNameAr} بلا تسجيل`,
        payload: { ...person, checkedInAt: now() },
      });
    },

    recordCount(target: FieldTarget, value: number, noteAr?: string) {
      return enqueue({
        kind: "impact",
        groupId,
        label: `${value} ${target.unitAr} — ${target.metricNameAr}`,
        payload: {
          metricId: target.metricId,
          value,
          occurredAt: now(),
          ...(noteAr ? { noteAr } : {}),
        },
      });
    },

    moveTask(
      task: FieldTask,
      status: "IN_PROGRESS" | "BLOCKED" | "DONE",
      blockedReasonAr?: string,
    ) {
      const verb =
        status === "DONE" ? "إنجاز" : status === "BLOCKED" ? "عائق في" : "بدء";

      return enqueue({
        kind: "task-status",
        groupId,
        label: `${verb} «${task.titleAr}»`,
        payload: {
          taskId: task.id,
          status,
          ...(blockedReasonAr ? { blockedReasonAr } : {}),
        },
      });
    },

    noteTask(task: FieldTask, bodyAr: string) {
      return enqueue({
        kind: "task-comment",
        groupId,
        label: `ملاحظة على «${task.titleAr}»`,
        payload: { taskId: task.id, bodyAr },
      });
    },

    setSiteStatus(status: "IN_PROGRESS" | "COMPLETED") {
      return enqueue({
        kind: "site-status",
        groupId,
        label:
          status === "COMPLETED"
            ? `إغلاق موقع ${sheet.site.nameAr}`
            : `بدء العمل في ${sheet.site.nameAr}`,
        payload: { status },
      });
    },

    addPhoto(
      blob: Blob,
      details: {
        captionAr?: string;
        taskId?: string;
        location: PhotoLocation | null;
        hasPeople: boolean;
        peopleConsent: boolean;
      },
    ) {
      const { location, ...rest } = details;

      return enqueue(
        {
          kind: "photo",
          groupId,
          label: details.captionAr
            ? `صورة: ${details.captionAr}`
            : `صورة من ${sheet.site.nameAr}`,
          payload: {
            ...rest,
            contentType: PHOTO_CONTENT_TYPE,
            sizeBytes: blob.size,
            takenAt: now(),
            ...(location ? { location } : {}),
          },
        },
        blob,
      );
    },
  };
}
