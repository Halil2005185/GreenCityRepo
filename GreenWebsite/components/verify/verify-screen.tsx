"use client";

import { BadgeCheck, CircleAlert, Hourglass, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  formatCertificateCode,
  readCertificateCode,
  type Verification,
  type VerifiedCertificate,
  verifyCertificate,
  verifyPath,
} from "@/lib/certificates";
import { formatDate } from "@/lib/field/labels";
import { siteConfig } from "@/lib/site";
import { cn, formatNumber } from "@/lib/utils";

const FIELD_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-semibold tracking-widest text-foreground placeholder:text-muted-foreground placeholder:font-normal placeholder:tracking-normal shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive";

const MALFORMED =
  "الرمز عشرة محارف من حروف إنجليزية وأرقام، ولا يرد فيه الصفر ولا الواحد ولا الحرفان O وI.";

/**
 * التحقق من شهادة مشاركة: يُكتب رمزها أو يُمسح الرمز المربّع على ورقتها،
 * فيُعرض ما في السجل عنها ليُقابَل بما في الورقة.
 *
 * الرمز في استعلام العنوان (`?code=`): الصفحة ملف ثابت واحد لكل الرموز، وما
 * يتغير يُقرأ في المتصفح.
 */
export function VerifyScreen() {
  const typed = useSearchParams().get("code");
  const code = typed ? readCertificateCode(typed) : null;

  if (code) return <VerifyResult code={code} />;

  return (
    <VerifyForm
      initial={typed ?? ""}
      problem={typed ? MALFORMED : null}
    />
  );
}

function VerifyForm({
  initial,
  problem,
}: {
  initial: string;
  problem: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(problem);

  return (
    <form
      // بلا JavaScript يرسل المتصفح `?code=` إلى الصفحة نفسها.
      method="get"
      action="/verify"
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();

        const code = readCertificateCode(value);

        if (!code) {
          setError(
            value.trim() === "" ? "اكتب رمز الشهادة أولًا." : MALFORMED,
          );
          return;
        }

        router.push(verifyPath(code));
      }}
    >
      <p className="leading-loose text-muted-foreground">
        اكتب رمز الشهادة كما هو مطبوع عليها، أو امسح الرمز المربّع في أسفلها.
      </p>

      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-semibold">
          رمز الشهادة
        </label>
        <input
          id={id}
          name="code"
          dir="ltr"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          placeholder="ABCDE-23456"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={FIELD_CLASS}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm leading-relaxed text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full">
        تحقّق
      </Button>

      <noscript>
        <p className="text-sm leading-relaxed text-muted-foreground">
          التحقق يسأل السجل من متصفحك، فيلزمه تشغيل JavaScript.
        </p>
      </noscript>
    </form>
  );
}

function VerifyResult({ code }: { code: string }) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{
    key: string;
    verification: Verification;
  } | null>(null);

  // محاولة برقمها: إعادة السؤال عن الرمز نفسه سؤالٌ جديد لا جوابٌ محفوظ.
  const key = `${code}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();

    void verifyCertificate(code, controller.signal).then((verification) => {
      if (!controller.signal.aborted) setAnswer({ key, verification });
    });

    return () => controller.abort();
  }, [code, key]);

  const verification = answer?.key === key ? answer.verification : null;

  const another = (
    <Link
      href="/verify"
      className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
    >
      تحقّق من رمز آخر
    </Link>
  );

  if (!verification) {
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-muted-foreground">نسأل السجل عن الرمز…</p>
        <div className="h-24 animate-pulse rounded-lg bg-surface-strong motion-reduce:animate-none" />
      </div>
    );
  }

  if (verification.kind === "valid") {
    return (
      <div className="space-y-5">
        <ValidCertificate certificate={verification.certificate} />
        {another}
      </div>
    );
  }

  if (verification.kind === "missing") {
    return (
      <div className="space-y-5">
        <Verdict
          icon={CircleAlert}
          tone="danger"
          title="لا شهادة بهذا الرمز"
          description={`لا شهادة في سجل ${siteConfig.name} بالرمز ${formatCertificateCode(code)}. قابل الرمز بما في الورقة محرفًا محرفًا؛ فإن طابقه فالورقة ليست شهادة قائمة.`}
        />
        {another}
      </div>
    );
  }

  const busy = verification.kind === "busy";

  return (
    <div className="space-y-5">
      <Verdict
        icon={busy ? Hourglass : WifiOff}
        tone="warning"
        title={busy ? "أسئلة كثيرة من شبكتك" : "تعذّر سؤال السجل"}
        description={
          busy
            ? "للتحقق حدٌّ من الأسئلة لكل شبكة في ربع ساعة. جرّب بعد قليل؛ وهذا لا يقول شيئًا عن الشهادة."
            : "لم يصل السؤال إلى السجل أو لم يعد جوابه. هذا لا يقول شيئًا عن الشهادة: تحقّق من اتصالك وحاول مرة أخرى."
        }
      />
      <Button
        size="lg"
        className="w-full"
        onClick={() => setAttempt((count) => count + 1)}
      >
        حاول مرة أخرى
      </Button>
      {another}
    </div>
  );
}

const VERDICT_TONES = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

function Verdict({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: typeof BadgeCheck;
  tone: keyof typeof VERDICT_TONES;
  title: string;
  description: string;
}) {
  return (
    <div
      role="status"
      className={cn("flex gap-3 rounded-lg border p-4", VERDICT_TONES[tone])}
    >
      <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
      <div className="space-y-1">
        <p className="text-base font-bold">{title}</p>
        <p className="text-sm leading-relaxed text-foreground">{description}</p>
      </div>
    </div>
  );
}

function ValidCertificate({
  certificate,
}: {
  certificate: VerifiedCertificate;
}) {
  const { firstDay, lastDay, hours, signer } = certificate;

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    { label: "الاسم", value: certificate.fullNameAr },
    { label: "الحملة", value: certificate.initiativeNameAr },
    { label: "البرنامج", value: certificate.programNameAr },
    {
      label: "أيام الحضور",
      value: <span className="numeric">{formatNumber(certificate.days)}</span>,
    },
  ];

  if (hours !== null) {
    facts.push({
      label: "ساعات التطوع",
      value: (
        <span className="numeric">
          {formatNumber(hours, Number.isInteger(hours) ? 0 : 1)}
        </span>
      ),
    });
  }

  if (firstDay && lastDay) {
    facts.push({
      label: firstDay === lastDay ? "يوم المشاركة" : "مدة المشاركة",
      value:
        firstDay === lastDay
          ? formatDate(firstDay)
          : `من ${formatDate(firstDay)} إلى ${formatDate(lastDay)}`,
    });
  }

  if (certificate.sites.length > 0) {
    facts.push({
      // «موقع التنفيذ» لا «الموقع»: يليه «التوقيع»، والكلمتان بلا شكل واحدة.
      label: certificate.sites.length === 1 ? "موقع التنفيذ" : "مواقع التنفيذ",
      value: certificate.sites.join("، "),
    });
  }

  if (signer) {
    facts.push({
      label: "التوقيع",
      value: signer.titleAr
        ? `${signer.nameAr}، ${signer.titleAr}`
        : signer.nameAr,
    });
  }

  facts.push(
    { label: "صدرت في", value: formatDate(certificate.issuedAt) },
    {
      label: "رمز الشهادة",
      value: (
        <span className="numeric font-semibold tracking-widest">
          {formatCertificateCode(certificate.code)}
        </span>
      ),
    },
  );

  return (
    <div className="space-y-4">
      <Verdict
        icon={BadgeCheck}
        tone="success"
        title="شهادة صحيحة"
        description={`صادرة عن ${siteConfig.name}، وهذا ما في سجلّها. قابله بما في الورقة.`}
      />

      <dl className="divide-y divide-border rounded-lg border border-border">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"
          >
            <dt className="text-sm text-muted-foreground">{fact.label}</dt>
            <dd className="font-semibold leading-relaxed">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs leading-relaxed text-muted-foreground">
        الأيام والساعات مما في سجل الحضور ساعة فتح هذه الصفحة. إن زادت عمّا في
        الورقة فقد طُبعت الورقة قبل آخر حضور سُجّل، وإن نقصت فقد صُحّح حضورٌ
        بعد طباعتها.
      </p>
    </div>
  );
}
