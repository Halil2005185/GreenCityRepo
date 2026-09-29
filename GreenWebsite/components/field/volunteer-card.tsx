"use client";

import {
  CalendarClock,
  CircleCheck,
  CloudOff,
  ExternalLink,
  ImageOff,
  MapPin,
  MessageSquareText,
  Navigation,
  Phone,
  RefreshCw,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/field/button";
import {
  FieldCard as Card,
  FieldNotice,
  FieldSkeleton,
  PageTitle,
} from "@/components/field/states";
import {
  FieldApiError,
  type FieldCardMembership,
  OfflineError,
} from "@/lib/field/api";
import { formatAge, formatDay, formatTime } from "@/lib/field/labels";
import { mapsUrl, staticMapUrl } from "@/lib/field/map";
import { enqueue, useOutbox } from "@/lib/field/outbox";
import { overlayCard } from "@/lib/field/overlay";
import { useFieldCard } from "@/lib/field/queries";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { dialable } from "@/lib/field/text";
import { attempt } from "@/lib/field/toast";
import { cn, formatNumber } from "@/lib/utils";

/**
 * بطاقة المتطوع: أين ومتى ومع من — ثم ما تحقق بعد اليوم.
 *
 * تُقرأ في عشر ثوانٍ على هاتف لم يرَ الموقع من قبل: الموعد والمكان أولًا
 * وبأكبر خط، وكل ما عداهما تحتهما. وتُحفظ على الهاتف عند أول فتح، فتُقرأ
 * في الطريق بلا شبكة.
 */
export function VolunteerCard() {
  const { identity } = useFieldSession();
  const online = useOnline();
  const query = useFieldCard();
  const { items } = useOutbox();

  const card = useMemo(
    () => (query.data ? overlayCard(query.data, items) : undefined),
    [query.data, items],
  );

  if (!card) {
    if (query.isError) return <CardError error={query.error} />;

    return (
      <>
        <PageTitle
          title="بطاقتي"
          description={identity ? `أهلًا ${identity.fullNameAr}` : undefined}
        />
        <FieldSkeleton cards={2} />
      </>
    );
  }

  const closed =
    card.initiative.status === "CANCELLED"
      ? "أُلغيت هذه الحملة."
      : card.initiative.status === "COMPLETED"
        ? "انتهت هذه الحملة. شكرًا لمن حضر."
        : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title={`أهلًا ${card.participant.fullNameAr}`}
        description={card.initiative.nameAr}
      />

      {closed ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          {closed}
        </p>
      ) : null}

      {card.memberships.length === 0 ? (
        <FieldNotice
          icon={Users}
          title="لم تُضف إلى مجموعة بعد"
          description="حين يضعك المنسّق في مجموعة يظهر هنا موعدك وموقعك وقائدك. عد إلى هذه الصفحة قبل يوم الحملة."
        />
      ) : (
        card.memberships.map((membership) => (
          <Membership
            key={membership.memberId}
            membership={membership}
            today={card.day}
            open={closed === null}
          />
        ))
      )}

      {card.feedback ? (
        <Card title="رأيك يهمّنا">
          <p className="text-sm leading-relaxed text-foreground">
            دقيقتان تخبرنا بهما كيف كان يومك، فيكون اليوم القادم أفضل.
          </p>
          <a
            href={card.feedback.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "mt-3 w-full",
            )}
          >
            <MessageSquareText aria-hidden />
            {card.feedback.nameAr}
            <ExternalLink aria-hidden />
          </a>
        </Card>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {query.isError || !online ? "من المحفوظ على الجهاز · " : ""}
          آخر تحديث {formatAge(card.generatedAt)}
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

function CardError({ error }: { error: Error }) {
  if (error instanceof OfflineError) {
    return (
      <FieldNotice
        icon={CloudOff}
        tone="warning"
        title="لا اتصال، وبطاقتك لم تُحفظ بعد"
        description="افتحها مرة والشبكة موصولة، فتبقى على هاتفك وتُقرأ بلا شبكة بعدها."
      />
    );
  }

  return (
    <FieldNotice
      icon={ShieldAlert}
      tone="danger"
      title="تعذّر فتح بطاقتك"
      description={
        error instanceof FieldApiError && error.status === 401
          ? "رابطك لم يعد صالحًا. اطلب رابطًا جديدًا من منسّق الحملة."
          : error.message
      }
    />
  );
}

function Membership({
  membership,
  today,
  open,
}: {
  membership: FieldCardMembership;
  today: string;
  /** الحملة جارية: يُؤكَّد فيها الحضور. */
  open: boolean;
}) {
  const { group, site } = membership;
  const cancelled = site.status === "CANCELLED";
  const attended = membership.attendedOn.length > 0;
  const hasPlace = site.lat !== null && site.lng !== null;

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs font-medium text-muted-foreground">
          {group.nameAr}
        </p>

        <dl className="mt-3 space-y-4">
          <div className="flex items-start gap-3">
            <CalendarClock
              className="mt-1 size-5 shrink-0 text-accent-ink"
              aria-hidden
            />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">
                موعدك
              </dt>
              <dd className="text-xl font-bold leading-snug text-foreground">
                {group.meetsAt ? (
                  <>
                    {formatDay(group.meetsAt)}
                    <span className="block text-base font-semibold tabular-nums">
                      {formatTime(group.meetsAt)}
                    </span>
                  </>
                ) : (
                  <span className="text-base font-semibold">
                    يُحدَّد قريبًا — عد إلى بطاقتك قبل يوم الحملة
                  </span>
                )}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin
              className="mt-1 size-5 shrink-0 text-accent-ink"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <dt className="text-xs font-medium text-muted-foreground">
                موقعك
              </dt>
              <dd className="text-lg font-bold leading-snug text-foreground">
                {site.nameAr}
                {site.areaNameAr ? (
                  <span className="text-base font-normal">
                    {" "}
                    — {site.areaNameAr}
                  </span>
                ) : null}
              </dd>
              {group.meetingPointAr ? (
                <dd className="mt-0.5 text-sm text-foreground">
                  اللقاء عند: {group.meetingPointAr}
                </dd>
              ) : null}
            </div>
          </div>
        </dl>

        {cancelled ? (
          <p className="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-foreground">
            أُلغي العمل في هذا الموقع. يتواصل معك المنسّق إن نُقلت إلى غيره.
          </p>
        ) : null}

        {hasPlace && !cancelled ? (
          <SiteMap lat={site.lat!} lng={site.lng!} name={site.nameAr} />
        ) : null}

        {group.instructionsAr ? (
          <div className="mt-4 rounded-lg bg-surface px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              ما تحضره وما تنتبه له
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-loose text-foreground">
              {group.instructionsAr}
            </p>
          </div>
        ) : null}
      </Card>

      {group.leadNameAr || group.contactPhone ? (
        <Lead name={group.leadNameAr} phone={group.contactPhone} />
      ) : null}

      {open && !cancelled && !attended ? (
        <Rsvp membership={membership} />
      ) : null}

      {attended ? (
        <Attended days={membership.attendedOn} today={today} />
      ) : null}

      {attended || membership.impact.length > 0 ? (
        <Outcome membership={membership} />
      ) : null}
    </div>
  );
}

/**
 * الصورة من شبكة أخرى قد لا تصل: بلا شبكة، أو برمز لم يُضبط. غيابها لا
 * يترك مكانًا فارغًا — الزر تحتها يكفي ليصل.
 */
function SiteMap({
  lat,
  lng,
  name,
}: {
  lat: number;
  lng: number;
  name: string;
}) {
  const [missing, setMissing] = useState(false);
  const image = staticMapUrl(lat, lng);

  return (
    <div className="mt-4 space-y-3">
      {image && !missing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={`خريطة موقع ${name}`}
          width={640}
          height={320}
          // بطلب CORS تُحفظ الصورة في مخزن عامل الخدمة وتُقرأ بلا شبكة.
          crossOrigin="anonymous"
          decoding="async"
          onError={() => setMissing(true)}
          className="aspect-[2/1] w-full rounded-lg border border-border bg-surface-strong object-cover"
        />
      ) : null}

      <a
        href={mapsUrl(lat, lng)}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ size: "lg" }), "w-full")}
      >
        <Navigation aria-hidden />
        افتح في الخرائط
      </a>
    </div>
  );
}

function Lead({ name, phone }: { name: string | null; phone: string | null }) {
  const number = phone ? dialable(phone) : null;

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
          <UserRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            قائد مجموعتك
          </p>
          <p className="truncate text-base font-bold text-foreground">
            {name ?? "يُسمّى قريبًا"}
          </p>
        </div>

        {number ? (
          <a
            href={`tel:${number}`}
            aria-label={`اتصل بـ${name ?? "قائد المجموعة"}`}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "shrink-0 px-4",
            )}
          >
            <Phone aria-hidden />
            <span dir="ltr" className="numeric">
              {phone}
            </span>
          </a>
        ) : null}
      </div>
    </Card>
  );
}

const RSVP_TEXT = {
  UNKNOWN: "هل ستحضر؟",
  COMING: "أكّدتَ حضورك",
  NOT_COMING: "اعتذرتَ عن الحضور",
} as const;

/**
 * تأكيد الحضور. يُحفظ على الهاتف ويُرسَل حين توجد الشبكة، كبقية ما يُسجَّل
 * في التطبيق — من فتح بطاقته في الحافلة بلا شبكة يؤكّد ويمضي.
 */
function Rsvp({ membership }: { membership: FieldCardMembership }) {
  const answered = membership.rsvp !== "UNKNOWN";
  const [changing, setChanging] = useState(false);

  function answer(coming: boolean) {
    setChanging(false);

    void attempt(
      () =>
        enqueue({
          kind: "rsvp",
          groupId: membership.group.id,
          label: coming
            ? `تأكيد الحضور — ${membership.group.nameAr}`
            : `الاعتذار عن الحضور — ${membership.group.nameAr}`,
          payload: { memberId: membership.memberId, coming },
        }),
      coming ? "سُجّل تأكيدك. ننتظرك." : "سُجّل اعتذارك. شكرًا لإخبارنا.",
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        {membership.rsvp === "COMING" ? (
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
        ) : null}
        <p className="text-base font-bold text-foreground">
          {RSVP_TEXT[membership.rsvp]}
        </p>
      </div>

      {answered && !changing ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 -ms-3"
          onClick={() => setChanging(true)}
        >
          غيّر جوابي
        </Button>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            جوابك يعرّف القائد كم شتلة وكم أداة يحضّر.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => answer(true)}>
              سأحضر
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => answer(false)}
            >
              لن أحضر
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Attended({ days, today }: { days: readonly string[]; today: string }) {
  const here = days.includes(today);

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm leading-relaxed text-foreground"
    >
      <CircleCheck
        className="mt-0.5 size-4 shrink-0 text-success"
        aria-hidden
      />
      {here
        ? "سُجّل حضورك اليوم. شكرًا لوجودك."
        : `سُجّل حضورك: ${days.map((day) => formatDay(day)).join("، ")}.`}
    </p>
  );
}

/**
 * ما تحقق في الموقع — الموثَّق وحده، وصوره التي سُمح بنشرها. يظهر بعد أن
 * يحضر: قبلها أرقام غيره، وبعدها أثره.
 */
function Outcome({ membership }: { membership: FieldCardMembership }) {
  const { impact, photos, site } = membership;

  if (impact.length === 0 && photos.length === 0) {
    return (
      <Card title="ما تحقق في موقعك">
        <p className="text-sm leading-relaxed text-foreground">
          تُنشر الأرقام والصور هنا بعد أن يتحقق منها المنسّق. عد إلى بطاقتك بعد
          أيام.
        </p>
      </Card>
    );
  }

  return (
    <Card title={`ما تحقق في ${site.nameAr}`}>
      {impact.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {impact.map((metric) => (
            <li
              key={metric.metricId}
              className="rounded-lg bg-surface px-3 py-3 text-center"
            >
              <p className="numeric text-2xl font-bold text-accent-ink">
                {formatNumber(metric.value, metric.decimals)}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-foreground">
                {metric.unitAr} · {metric.metricNameAr}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {photos.length > 0 ? (
        <ul className={cn("grid grid-cols-3 gap-2", impact.length > 0 && "mt-4")}>
          {photos.map((photo) => (
            <Photo key={photo.id} url={photo.url} caption={photo.captionAr} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Photo({ url, caption }: { url: string; caption: string | null }) {
  const [missing, setMissing] = useState(false);

  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={caption ?? "صورة من الموقع"}
        className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-strong text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {missing ? (
          <ImageOff className="size-5" aria-hidden />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={caption ?? "صورة من الموقع"}
            loading="lazy"
            decoding="async"
            onError={() => setMissing(true)}
            className="size-full object-cover"
          />
        )}
      </a>
    </li>
  );
}
