"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { QrImage } from "@/components/field/qr-image";
import {
  type CheckinSettings,
  canComputeCodes,
  checkinCode,
  checkinUrl,
  secondsLeft,
} from "@/lib/field/checkin";

/**
 * رمز الحضور الذاتي على هاتف القائد عند نقطة اللقاء: ستة أرقام تتبدّل كل
 * دقيقة، ومعها رمز مربّع يحملها.
 *
 * يُحسب على الهاتف من سرّ المجموعة ومن الوقت، فيُعرض بلا شبكة. والمتطوع
 * يكتب الأرقام في بطاقته أو يمسح المربّع بكاميرا هاتفه؛ فمن سجّل نفسه ظهر
 * في القائمة «سجّل نفسه»، وللقائد أن يتراجع عن حضور من لا يراه.
 */
export function CheckinCode({
  groupId,
  settings,
}: {
  groupId: string;
  settings: CheckinSettings;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState<{ counter: number; code: string } | null>(
    null,
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  const counter = Math.floor(now / 1000 / settings.periodSeconds);
  const supported = canComputeCodes();

  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    void checkinCode(settings, counter * settings.periodSeconds * 1000).then(
      (code) => {
        if (!cancelled) setShown({ counter, code });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [supported, settings, counter]);

  // رمز الدقيقة السابقة لا يُعرض لحظةً في الدقيقة الجديدة.
  const code = shown?.counter === counter ? shown.code : null;

  if (!supported) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-relaxed text-foreground">
        <ShieldAlert
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden
        />
        هذا المتصفح لا يحسب رمز الحضور على اتصال غير آمن. سجّل الحضور بالنقر
        على الأسماء.
      </p>
    );
  }

  const left = secondsLeft(settings, now);

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm leading-relaxed text-foreground">
        من وصل يكتب هذا الرمز في بطاقته، أو يمسح المربّع بكاميرا هاتفه.
      </p>

      <div
        className="mx-auto aspect-square w-full max-w-64 rounded-2xl border border-border bg-white p-3"
        // الرمز يُمسح بكاميرا: أسود على أبيض أيًّا كان وضع التطبيق.
        aria-hidden
      >
        {code ? (
          <QrImage
            text={checkinUrl(groupId, code)}
            label="رمز مربّع لتسجيل الحضور"
            className="size-full"
          />
        ) : null}
      </div>

      <div>
        <p
          className="numeric text-4xl font-bold tracking-[0.2em] text-accent-ink"
          aria-live="off"
          aria-label={code ? `رمز الحضور ${code.split("").join(" ")}` : undefined}
        >
          {code ? `${code.slice(0, 3)} ${code.slice(3)}` : "… …"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          يتبدّل بعد <span className="numeric">{left}</span> ثانية
        </p>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-strong"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-primary transition-[inline-size] duration-1000 ease-linear"
          style={{
            inlineSize: `${Math.round((left / settings.periodSeconds) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
