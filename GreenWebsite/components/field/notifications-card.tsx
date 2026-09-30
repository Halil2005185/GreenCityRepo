"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/field/button";
import { FieldCard } from "@/components/field/states";
import {
  type PushState,
  disablePush,
  enablePush,
  readPushState,
} from "@/lib/field/push";
import { useOnline } from "@/lib/field/session";
import { notify } from "@/lib/field/toast";

/** ما يُقال حين لا يستطيع صاحب الجهاز أن يفعّل شيئًا من هنا. */
const EXPLAIN: Partial<Record<PushState, string>> = {
  denied:
    "منعتَ الإشعارات لهذا الموقع. اسمح بها من إعدادات المتصفح ثم عد إلى هذه الصفحة.",
  "needs-install":
    "على iPhone تعمل الإشعارات بعد تثبيت التطبيق على الشاشة الرئيسية وفتحه من أيقونته.",
  unsupported:
    "هذا المتصفح لا يستقبل الإشعارات. إعلانات المنسّق تظهر في التطبيق حين تفتحه.",
};

/**
 * إشعارات المنسّق على هذا الجهاز. اختيار صاحبه لا افتراض التطبيق: لا يُطلب
 * الإذن عند الفتح، بل حين ينقر هو — طلبٌ يظهر قبل أن يُعرف سببه يُرفض، ولا
 * يُعاد بعد الرفض.
 */
export function NotificationsCard() {
  const online = useOnline();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    readPushState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });

    return () => {
      cancelled = true;
    };
  }, [online]);

  // الخادم بلا مفاتيح: لا شيء يُفعَّل ولا شيء يُشرح لمن لا يملك تغييره.
  if (state === null || state === "disabled") return null;

  async function change(turnOn: boolean) {
    setBusy(true);

    try {
      if (turnOn) {
        const next = await enablePush();

        setState(next);

        if (next === "on") notify("فُعّلت الإشعارات على هذا الجهاز.");
      } else {
        await disablePush();
        setState("off");
        notify("أُوقفت الإشعارات على هذا الجهاز.");
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "تعذّر تغيير الإشعارات. حاول مرة أخرى.",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  }

  const explanation = EXPLAIN[state];
  const Icon = state === "on" ? BellRing : explanation ? BellOff : Bell;

  return (
    <FieldCard title="الإشعارات">
      <p className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
        <Icon className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
        {explanation ??
          (state === "on"
            ? "مفعّلة: يصلك إعلان المنسّق — تغيّر موعد أو مكان — ولو كان التطبيق مغلقًا."
            : "فعّلها ليصلك إعلان المنسّق — تغيّر موعد أو مكان — ولو كان التطبيق مغلقًا.")}
      </p>

      {explanation ? null : (
        <>
          <Button
            variant={state === "on" ? "outline" : "default"}
            className="mt-3 w-full"
            disabled={busy || !online}
            onClick={() => void change(state !== "on")}
          >
            {busy
              ? "…لحظة"
              : state === "on"
                ? "أوقف الإشعارات"
                : "فعّل الإشعارات"}
          </Button>
          {online ? null : (
            <p className="mt-2 text-xs text-muted-foreground">
              يلزم اتصال بالشبكة لتغيير الإشعارات.
            </p>
          )}
        </>
      )}
    </FieldCard>
  );
}
