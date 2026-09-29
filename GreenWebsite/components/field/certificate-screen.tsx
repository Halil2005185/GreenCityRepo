"use client";

import {
  Award,
  CloudOff,
  ExternalLink,
  Printer,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/field/button";
import { CertificateSheet } from "@/components/field/certificate-sheet";
import {
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import { FieldApiError, OfflineError } from "@/lib/field/api";
import { FIELD_ROUTES } from "@/lib/field/config";
import { useFieldCard, useFieldCertificate } from "@/lib/field/queries";
import { useFieldSession } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * صفحة «شهادتي»: شهادة المتطوع في حملة رابطه، تُطبع أو تُحفظ PDF.
 *
 * «حفظ PDF» هو طباعة المتصفح نفسها: على الهاتف تُفتح نافذة الطباعة وفيها
 * «حفظ كملف PDF». لا ملف يُولَّد على الخادم، فالشهادة تُطبع بخط الموقع
 * وبما في السجل ساعة طباعتها.
 */
export function CertificateScreen() {
  const router = useRouter();
  const { status, identity } = useFieldSession();
  const card = useFieldCard();

  const misplaced =
    status === "anonymous" ||
    (identity?.kind === "STAFF" && status !== "loading");

  useEffect(() => {
    if (misplaced) router.replace(FIELD_ROUTES.home);
  }, [misplaced, router]);

  const attended =
    card.data?.memberships.some(
      (membership) => membership.attendedOn.length > 0,
    ) ?? false;
  const enabled = card.data?.certificate.enabled ?? false;

  // تُطلب حين يقوم شرطاها: طلبٌ يُعرف سلفًا أنه يُرفض لا يُرسَل.
  const query = useFieldCertificate(enabled && attended);

  if (status === "loading" || misplaced) return <FieldSkeleton cards={1} />;

  const toRecord = (
    <Link
      href={FIELD_ROUTES.record}
      className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
    >
      إلى سجلّي
    </Link>
  );

  /**
   * البطاقة تُسأل قبل الشهادة المحفوظة: حملة أوقف منسّقها شهاداتها، أو حضور
   * تُراجع عنه، لا تبقى شهادته تُفتح من نسخة على الجهاز.
   */
  if (!card.data && card.isError) {
    return (
      <FieldNotice
        icon={card.error instanceof OfflineError ? CloudOff : ShieldAlert}
        tone="warning"
        title="تعذّر فتح بطاقتك"
        description="الشهادة تُقرأ من بطاقتك. افتحها مرة والشبكة موصولة."
      />
    );
  }

  if (card.data && !enabled) {
    return (
      <FieldNotice
        icon={Award}
        title="لا شهادات لهذه الحملة"
        description="لم يفعّل المنسّق شهادات المشاركة لهذه الحملة. مشاركتك محفوظة في سجلّك."
      >
        {toRecord}
      </FieldNotice>
    );
  }

  if (card.data && !attended) {
    return (
      <FieldNotice
        icon={Award}
        title="تصدر شهادتك بعد حضورك"
        description="الشهادة تشهد بما سُجّل في الميدان. إن حضرت ولم يُسجَّل حضورك فراجع قائد مجموعتك."
      >
        {toRecord}
      </FieldNotice>
    );
  }

  if (query.data) {
    return (
      <div className="space-y-4">
        <div className="print:hidden">
          <PageTitle
            title="شهادتي"
            description={query.data.initiativeNameAr}
          />
        </div>

        <CertificateSheet
          certificate={query.data}
          verifyUrl={query.data.verifyUrl}
        />

        <div className="space-y-3 print:hidden">
          <Button size="lg" className="w-full" onClick={() => window.print()}>
            <Printer aria-hidden />
            اطبع أو احفظ PDF
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            في نافذة الطباعة اختر «حفظ كملف PDF» لتحتفظ بها على هاتفك، واختر
            الورقة عرضيةً إن طبعتها. الأيام والساعات مما سُجّل في الميدان حتى
            الآن.
          </p>
          <a
            href={query.data.verifyUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "link" }), "w-full")}
          >
            صفحة التحقق من الشهادة
            <ExternalLink aria-hidden />
          </a>
        </div>
      </div>
    );
  }

  if (query.isError) {
    const { error } = query;

    return (
      <FieldNotice
        icon={error instanceof OfflineError ? CloudOff : ShieldAlert}
        tone={error instanceof OfflineError ? "warning" : "danger"}
        title={
          error instanceof OfflineError
            ? "لا اتصال، وشهادتك لم تُحفظ بعد"
            : "تعذّر إصدار الشهادة"
        }
        description={
          error instanceof OfflineError
            ? "افتحها مرة والشبكة موصولة، فتبقى على هاتفك وتُطبع بلا شبكة."
            : error instanceof FieldApiError
              ? error.message
              : "حاول مرة أخرى بعد قليل."
        }
      >
        {toRecord}
      </FieldNotice>
    );
  }

  return (
    <div role="status" aria-label="نحضّر شهادتك">
      <FieldSkeleton cards={1} />
    </div>
  );
}
