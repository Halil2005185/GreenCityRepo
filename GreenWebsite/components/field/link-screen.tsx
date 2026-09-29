"use client";

import { CloudOff, KeyRound, Link2Off, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/field/button";
import { FieldNotice, FieldSkeleton } from "@/components/field/states";
import { FieldApiError, OfflineError } from "@/lib/field/api";
import { FIELD_ROUTES } from "@/lib/field/config";
import { useFieldSession } from "@/lib/field/session";

type Phase =
  | { step: "reading" }
  | { step: "opening" }
  | { step: "missing" }
  | { step: "staff" }
  | { step: "offline" }
  | { step: "refused"; message: string };

/** كما يولّده الخادم. ما لا يطابقه لا يُرسَل: رابط مقصوص أو ملصوق خطأً. */
const TOKEN_PATTERN = /^plk_[A-Za-z0-9_-]{20,100}$/;

/**
 * صفحة الرابط الشخصي: `/app/link#<الرمز>`.
 *
 * الرمز في جزء العنوان لا في مساره، فلا يصل خادم الموقع ولا يُكتب في سجل.
 * ويُمحى من شريط العنوان قبل أي شيء: من يصوّر شاشته أو يعير هاتفه لا يترك
 * رابطه في تاريخ المتصفح.
 */
export function LinkScreen() {
  const router = useRouter();
  const { status, identity, redeem, logout } = useFieldSession();
  const [phase, setPhase] = useState<Phase>({ step: "reading" });

  // الرمز يعيش في الذاكرة بعد محوه من العنوان، لتُعاد المحاولة به بلا رابط.
  const token = useRef<string | null>(null);
  const started = useRef(false);

  const open = useCallback(async () => {
    if (!token.current) return;

    setPhase({ step: "opening" });

    try {
      await redeem(token.current);
      router.replace(FIELD_ROUTES.home);
    } catch (error) {
      if (error instanceof OfflineError) {
        setPhase({ step: "offline" });

        return;
      }

      setPhase({
        step: "refused",
        message:
          error instanceof FieldApiError && error.status !== 401
            ? error.message
            : "هذا الرابط لم يعد صالحًا: انتهت مدته أو استُبدل بغيره. اطلب رابطًا جديدًا من منسّق الحملة.",
      });
    }
  }, [redeem, router]);

  const read = useCallback(async () => {
    const fragment = window.location.hash.replace(/^#/, "");

    if (fragment) {
      window.history.replaceState(null, "", FIELD_ROUTES.link);
    }

    if (!TOKEN_PATTERN.test(fragment)) {
      // بلا رمز ومعه بطاقة محفوظة: فتح الصفحة من جديد يعيده إليها.
      if (!fragment && identity?.kind === "PARTICIPANT") {
        router.replace(FIELD_ROUTES.home);

        return;
      }

      setPhase({ step: "missing" });

      return;
    }

    token.current = fragment;

    /**
     * على الجهاز جلسة عضو فريق: فتح البطاقة يخرجه منها، وفي طابوره ما قد
     * لا يكون أُرسل. يُسأل قبل أن يقع ذلك.
     */
    if (identity?.kind === "STAFF") {
      setPhase({ step: "staff" });

      return;
    }

    await open();
  }, [identity, open, router]);

  useEffect(() => {
    if (status === "loading") return;

    if (!started.current) {
      started.current = true;
      void read();
    }

    /**
     * رابط يُلصق في شريط العنوان والصفحة مفتوحة لا يعيد تحميلها: الجزء وحده
     * يتغيّر. بلا هذا المستمع يبقى من لصق رابطه الصحيح أمام رسالة الخطأ.
     */
    const onHashChange = () => void read();

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, [status, read]);

  if (phase.step === "reading" || phase.step === "opening") {
    return (
      <div role="status" aria-label="نفتح بطاقتك">
        <FieldSkeleton cards={2} />
      </div>
    );
  }

  if (phase.step === "staff") {
    return (
      <FieldNotice
        icon={LogOut}
        tone="warning"
        title="أنت داخل بحساب الفريق على هذا الجهاز"
        description="فتح بطاقة المتطوع يخرجك من حسابك هنا. ما سجّلته ولم يُرسَل يبقى على الهاتف، ويُرسَل حين تعود وتدخل بحسابك."
      >
        <div className="flex w-full flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() =>
              void (async () => {
                await logout().catch(() => undefined);
                await open();
              })()
            }
          >
            اخرج وافتح البطاقة
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full"
            onClick={() => router.replace(FIELD_ROUTES.home)}
          >
            ابقَ في حسابي
          </Button>
        </div>
      </FieldNotice>
    );
  }

  if (phase.step === "offline") {
    return (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="لا اتصال بالشبكة"
        description="فتح الرابط أول مرة يحتاج اتصالًا. بعدها تبقى بطاقتك على هاتفك وتُقرأ بلا شبكة."
      >
        <Button size="lg" className="w-full" onClick={() => void open()}>
          حاول مرة أخرى
        </Button>
      </FieldNotice>
    );
  }

  if (phase.step === "missing") {
    return (
      <FieldNotice
        icon={KeyRound}
        title="الرابط ناقص"
        description="افتح الرابط كما وصلك كاملًا من منسّق الحملة. إن نسخته باليد فانسخه حتى آخر حرف."
      />
    );
  }

  return (
    <FieldNotice
      icon={Link2Off}
      tone="danger"
      title="تعذّر فتح الرابط"
      description={phase.message}
    />
  );
}
