"use client";

import {
  Award,
  CalendarDays,
  ChevronLeft,
  CloudOff,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Sprout,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { buttonVariants } from "@/components/field/button";
import {
  FieldCard,
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import { verifyPath } from "@/lib/certificates";
import { type FieldRecord, OfflineError } from "@/lib/field/api";
import { FIELD_ROUTES } from "@/lib/field/config";
import { formatAge, formatDate } from "@/lib/field/labels";
import { useFieldRecord } from "@/lib/field/queries";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { cn, formatNumber } from "@/lib/utils";

type Participation = FieldRecord["participations"][number];

/** «3 أيام» بصيغة العدد العربية: واحد ومثنى وجمع وما فوق العشرة. */
function days(count: number) {
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومان";

  return `${formatNumber(count)} ${count <= 10 ? "أيام" : "يومًا"}`;
}

function hours(value: number) {
  if (value === 1) return "ساعة واحدة";
  if (value === 2) return "ساعتان";

  const whole = Number.isInteger(value);

  return `${formatNumber(value, whole ? 0 : 1)} ${
    whole && value <= 10 ? "ساعات" : "ساعة"
  }`;
}

function range(first: string | null, last: string | null) {
  if (!first || !last) return null;

  return first === last
    ? formatDate(first)
    : `${formatDate(first)} — ${formatDate(last)}`;
}

/**
 * تبويب «سجلّي»: ما حضره المتطوع عبر الحملات، بأيامه وساعاته، وشهادته.
 *
 * الحضور هو المشاركة: دعوة لم يحضرها صاحبها ليست هنا. والأرقام مما سجّله
 * القادة في الميدان، فمن حضر ولم يُسجَّل يراجع قائد مجموعته.
 */
export function RecordScreen() {
  const router = useRouter();
  const { status, identity } = useFieldSession();
  const online = useOnline();
  const query = useFieldRecord();

  // السجل للمتطوع برابطه. عضو الفريق ومن لا جلسة له يعودان إلى «اليوم».
  const misplaced =
    status === "anonymous" ||
    (identity?.kind === "STAFF" && status !== "loading");

  useEffect(() => {
    if (misplaced) router.replace(FIELD_ROUTES.home);
  }, [misplaced, router]);

  if (status === "loading" || misplaced) return <FieldSkeleton cards={2} />;

  const record = query.data;

  if (!record) {
    if (query.isError) return <RecordError error={query.error} />;

    return (
      <>
        <PageTitle title="سجلّي" />
        <FieldSkeleton cards={2} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="سجلّي"
        description="ما شاركت فيه من حملات المدن الخضراء."
      />

      {record.participations.length === 0 ? (
        <FieldNotice
          icon={Sprout}
          title="لا مشاركة مسجَّلة بعد"
          description="حين يُسجَّل حضورك في حملة يظهر هنا يومها وساعاتها، ومنه تصدر شهادتك."
        />
      ) : (
        <>
          <Totals totals={record.totals} />

          {record.participations.map((participation) => (
            <ParticipationCard
              key={participation.initiativeId}
              participation={participation}
            />
          ))}
        </>
      )}

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {query.isError || !online ? "من المحفوظ على الجهاز · " : ""}
          آخر تحديث {formatAge(record.generatedAt)}
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <RefreshCw
            className={cn(query.isFetching && "motion-safe:animate-spin")}
            aria-hidden
          />
          تحديث
        </button>
      </div>
    </div>
  );
}

function RecordError({ error }: { error: Error }) {
  if (error instanceof OfflineError) {
    return (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="لا اتصال، وسجلّك لم يُحفظ بعد"
        description="افتحه مرة والشبكة موصولة، فيبقى على هاتفك ويُقرأ بلا شبكة بعدها."
      />
    );
  }

  return (
    <FieldNotice
      icon={ShieldAlert}
      tone="danger"
      title="تعذّر تحميل سجلّك"
      description={error.message}
    />
  );
}

function Totals({ totals }: { totals: FieldRecord["totals"] }) {
  const items = [
    { value: totals.initiatives, label: totals.initiatives === 1 ? "حملة" : "حملات" },
    { value: totals.days, label: totals.days === 1 ? "يوم" : "أيام" },
    ...(totals.hours === null
      ? []
      : [{ value: totals.hours, label: "ساعة تطوّع" }]),
  ];

  return (
    <FieldCard>
      <ul
        className={cn(
          "grid gap-3 text-center",
          items.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {items.map((item) => (
          <li key={item.label} className="rounded-lg bg-surface px-2 py-3">
            <p className="numeric text-2xl font-bold text-accent-ink">
              {formatNumber(item.value, Number.isInteger(item.value) ? 0 : 1)}
            </p>
            <p className="mt-0.5 text-xs text-foreground">{item.label}</p>
          </li>
        ))}
      </ul>
    </FieldCard>
  );
}

function ParticipationCard({ participation }: { participation: Participation }) {
  const { certificate } = participation;
  const when = range(participation.firstDay, participation.lastDay);

  return (
    <FieldCard>
      <p className="text-xs font-medium text-muted-foreground">
        {participation.programNameAr}
      </p>
      <h2 className="mt-1 text-lg font-bold leading-snug text-foreground">
        {participation.initiativeNameAr}
      </h2>

      <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-foreground">
        <CalendarDays
          className="mt-0.5 size-4 shrink-0 text-accent-ink"
          aria-hidden
        />
        <span>
          {days(participation.days)}
          {participation.hours === null
            ? ""
            : ` · ${hours(participation.hours)}`}
          {when ? (
            <span className="block text-muted-foreground">{when}</span>
          ) : null}
          {participation.sites.length > 0 ? (
            <span className="block text-muted-foreground">
              {participation.sites.join("، ")}
            </span>
          ) : null}
        </span>
      </p>

      {certificate.canIssue ? (
        <Link
          href={FIELD_ROUTES.certificate}
          className={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}
        >
          <Award aria-hidden />
          {certificate.code ? "شهادتي" : "أصدر شهادتي"}
          <ChevronLeft aria-hidden />
        </Link>
      ) : certificate.code ? (
        // شهادة حملة أخرى: تُفتح من رابط تلك الحملة؛ وهنا صفحة التحقق منها.
        <a
          href={verifyPath(certificate.code)}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "mt-4 w-full",
          )}
        >
          <Award aria-hidden />
          شهادة هذه الحملة
          <ExternalLink aria-hidden />
        </a>
      ) : null}
    </FieldCard>
  );
}
