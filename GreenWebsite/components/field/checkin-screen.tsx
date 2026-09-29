"use client";

import {
  CircleCheck,
  ClipboardCheck,
  CloudOff,
  KeyRound,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/field/button";
import { FieldNotice, FieldSkeleton } from "@/components/field/states";
import { readCheckinFragment } from "@/lib/field/checkin";
import { FIELD_ROUTES } from "@/lib/field/config";
import { useOutbox } from "@/lib/field/outbox";
import { fieldKeys, useFieldCard } from "@/lib/field/queries";
import {
  type SelfCheckinOutcome,
  submitSelfCheckin,
} from "@/lib/field/self-checkin";
import { useFieldSession } from "@/lib/field/session";
import { cn } from "@/lib/utils";

type Scanned = { groupId: string; code: string };

/**
 * ما يفتحه الرمز المربّع عند نقطة اللقاء: `/app/checkin#<المجموعة>.<الرمز>`.
 *
 * كاميرا الهاتف تفتح العنوان في المتصفح، فيُسجَّل الحضور من البطاقة المحفوظة
 * فيه. ومن فتح بطاقته في مكان آخر — التطبيق المثبَّت على iPhone مخزنه غير
 * مخزن Safari — يُقال له أن يكتب الأرقام في بطاقته، وهي تحت المربّع نفسه.
 */
export function CheckinScreen() {
  const queryClient = useQueryClient();
  const { status, identity } = useFieldSession();
  const { loaded } = useOutbox();
  const card = useFieldCard();

  /** `undefined` قبل أن يُقرأ العنوان؛ `null` حين لا رمز فيه يُقرأ. */
  const [scanned, setScanned] = useState<Scanned | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<SelfCheckinOutcome | null>(null);
  /** المسح الذي أُرسل. مسحٌ جديد كائنٌ جديد، فيُرسَل هو أيضًا. */
  const sent = useRef<Scanned | null>(null);

  // الرمز يُقرأ ويُمحى من العنوان: صفحة يُعاد تحميلها لا تسجّل مرتين.
  useEffect(() => {
    const read = async () => {
      // صفحة مُحي رمزها وبقيت مفتوحة: لا مسح جديد يُقرأ.
      if (!window.location.hash && sent.current) return;

      const found = readCheckinFragment(window.location.hash);

      if (window.location.hash) {
        window.history.replaceState(null, "", FIELD_ROUTES.checkin);
      }

      setOutcome(null);
      setScanned(found);
    };

    void read();

    /**
     * مسحٌ ثانٍ والصفحة مفتوحة لا يعيد تحميلها: الجزء وحده يتغيّر. بلا هذا
     * المستمع يبقى من مسح رمز اليوم أمام جواب رمز الأمس.
     */
    const onHashChange = () => void read();

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const volunteer =
    identity?.kind === "PARTICIPANT" &&
    (status === "authenticated" || status === "offline");

  const groupNameAr =
    card.data?.memberships.find(
      (membership) => membership.group.id === scanned?.groupId,
    )?.group.nameAr ?? null;

  useEffect(() => {
    // الطابور يُربط بعد أن تُعرف الهوية؛ قبلها لا يُسجَّل فيه شيء.
    if (!volunteer || !loaded || !scanned || sent.current === scanned) return;

    sent.current = scanned;

    void submitSelfCheckin({ ...scanned, groupNameAr })
      .then((result) => {
        if (result.state === "recorded") {
          queryClient.setQueryData(fieldKeys.card, result.card);
        }

        setOutcome(result);
      })
      .catch((error: unknown) => {
        console.error("[field] تعذّر تسجيل الحضور:", error);
        setOutcome({
          state: "refused",
          message: "تعذّر حفظ الرمز على هذا الجهاز. اكتب أرقامه في بطاقتك.",
        });
      });
  }, [volunteer, loaded, scanned, groupNameAr, queryClient]);

  const toCard = (
    <Link
      href={FIELD_ROUTES.home}
      className={cn(buttonVariants({ size: "lg" }), "w-full")}
    >
      إلى بطاقتي
    </Link>
  );

  if (scanned === null) {
    return (
      <FieldNotice
        icon={ScanLine}
        title="الرمز لم يُقرأ كاملًا"
        description="امسح المربّع من جديد، أو اكتب أرقامه الستة في بطاقتك: «وصلتُ — أسجّل حضوري»."
      >
        {toCard}
      </FieldNotice>
    );
  }

  if (status === "loading" || scanned === undefined) {
    return <FieldSkeleton cards={1} />;
  }

  if (identity?.kind === "STAFF" && status !== "anonymous") {
    return (
      <FieldNotice
        icon={ClipboardCheck}
        title="هذا رمز حضور المتطوعين"
        description="أنت داخل بحساب الفريق على هذا الجهاز. حضور مجموعتك تسجّله من تبويب «الحضور»."
      >
        <Link
          href={FIELD_ROUTES.attendance}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          إلى الحضور
        </Link>
      </FieldNotice>
    );
  }

  if (!volunteer) {
    return (
      <FieldNotice
        icon={KeyRound}
        tone="warning"
        title="افتح بطاقتك أولًا"
        description="الحضور يُسجَّل من بطاقتك. افتح على هذا الهاتف رابطك الشخصي الذي وصلك من المنسّق، ثم امسح المربّع من جديد — أو اكتب أرقامه الستة في بطاقتك حيث فتحتها."
      />
    );
  }

  if (outcome?.state === "recorded") {
    return (
      <FieldNotice
        icon={CircleCheck}
        title="سُجّل حضورك"
        description={
          groupNameAr
            ? `أهلًا بك في ${groupNameAr}. يراك قائدك حاضرًا في قائمته.`
            : "أهلًا بك. يراك قائدك حاضرًا في قائمته."
        }
      >
        {toCard}
      </FieldNotice>
    );
  }

  if (outcome?.state === "queued") {
    return (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="حُفظ رمزك، ولم يُرسَل بعد"
        description="لا اتصال الآن. الرمز محفوظ على هاتفك بوقت مسحه، ويُرسَل حين تعود الشبكة. أخبر قائدك إن أردت أن يسجّلك بيده."
      >
        {toCard}
      </FieldNotice>
    );
  }

  if (outcome?.state === "refused") {
    return (
      <FieldNotice
        icon={ShieldAlert}
        tone="danger"
        title="لم يُسجَّل حضورك"
        description={outcome.message}
      >
        {toCard}
      </FieldNotice>
    );
  }

  return (
    <div role="status" aria-label="نسجّل حضورك">
      <FieldSkeleton cards={1} />
    </div>
  );
}
