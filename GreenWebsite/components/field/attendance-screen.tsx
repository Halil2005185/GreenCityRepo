"use client";

import { Check, Phone, Search, Undo2, UserPlus, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { ClosedNotice } from "@/components/field/closed-notice";
import { Field, INPUT_CLASS } from "@/components/field/form";
import { SheetGate, type SheetView } from "@/components/field/sheet-gate";
import { FieldCard, FieldNotice } from "@/components/field/states";
import { Button } from "@/components/field/button";
import type { FieldSheet } from "@/lib/field/api";
import { formatDay, formatTime } from "@/lib/field/labels";
import { clientIdOf } from "@/lib/field/outbox-types";
import {
  PHONE_PATTERN,
  dialable,
  latinDigits,
  searchKey,
} from "@/lib/field/text";
import { attempt } from "@/lib/field/toast";
import { cn } from "@/lib/utils";

type Member = FieldSheet["members"][number];
type Filter = "all" | "absent" | "present";

/** دون هذا العدد تُرى القائمة كلها بنظرة، والبحث زيادة على الشاشة. */
const SEARCH_FROM = 8;

/**
 * تبويب «الحضور»: القائد يقف عند نقطة اللقاء وينقر من وصل.
 *
 * كل نقرة تُحفظ على الهاتف وتظهر فورًا، وتُرسَل حين توجد الشبكة. القائمة
 * لا تعيد ترتيب نفسها عند النقر: صفٌّ يقفز من تحت الإبهام يجعل النقرة
 * التالية على غير صاحبها.
 */
export function AttendanceScreen() {
  return (
    <SheetGate title="الحضور">
      {(view) => <Attendance {...view} />}
    </SheetGate>
  );
}

function Attendance({ sheet, actions, writable }: SheetView) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  const present = sheet.members.filter((member) => member.attendance).length;
  const total = sheet.members.length;

  const visible = useMemo(() => {
    const key = searchKey(query);

    return sheet.members.filter((member) => {
      if (filter === "present" && !member.attendance) return false;
      if (filter === "absent" && member.attendance) return false;

      return key === "" || searchKey(member.fullNameAr).includes(key);
    });
  }, [sheet.members, query, filter]);

  return (
    <div className="space-y-4">
      <ClosedNotice sheet={sheet} />

      <FieldCard>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              حضور {formatDay(sheet.day)}
            </p>
            <p className="mt-1 text-foreground">
              <span className="numeric text-3xl font-bold text-accent-ink">
                {present}
              </span>{" "}
              <span className="text-sm">
                من <span className="numeric font-semibold">{total}</span>
              </span>
            </p>
          </div>

          {writable ? (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={adding}
              onClick={() => setAdding((open) => !open)}
            >
              <UserPlus aria-hidden />
              حضر بلا تسجيل
            </Button>
          ) : null}
        </div>

        {total > 0 ? (
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={present}
            aria-label="من حضر من أعضاء المجموعة"
          >
            <div
              className="h-full rounded-full bg-primary transition-[inline-size] duration-300"
              style={{ inlineSize: `${Math.round((present / total) * 100)}%` }}
            />
          </div>
        ) : null}

        {adding ? (
          <WalkInForm
            members={sheet.members}
            onCancel={() => setAdding(false)}
            onSubmit={async (person) => {
              const saved = await attempt(
                () => actions.addWalkIn(person),
                `أُضيف ${person.fullNameAr} إلى المجموعة وسُجّل حضوره.`,
              );

              if (saved) setAdding(false);
            }}
          />
        ) : null}
      </FieldCard>

      {total === 0 ? (
        <FieldNotice
          icon={Users}
          title="لا أعضاء في هذه المجموعة بعد"
          description="يضيف المنسّق المتطوعين من لوحة التحكم فتظهر أسماؤهم هنا. ومن حضر بلا تسجيل تضيفه أنت من الزر أعلاه."
        />
      ) : (
        <FieldCard>
          {total >= SEARCH_FROM ? (
            <div className="relative mb-3">
              <Search
                className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                aria-label="ابحث باسم المتطوع"
                placeholder="ابحث بالاسم"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={cn(INPUT_CLASS, "ps-10")}
              />
            </div>
          ) : null}

          <div role="group" aria-label="من يُعرض" className="mb-1 flex gap-2">
            {(
              [
                ["all", "الكل", total],
                ["absent", "لم يحضر", total - present],
                ["present", "حضر", present],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === value
                    ? "border-accent-ink bg-accent-ink text-[var(--brand-warm-beige)]"
                    : "border-border bg-background text-foreground hover:bg-accent",
                )}
              >
                {label} <span className="numeric">{count}</span>
              </button>
            ))}
          </div>

          {visible.length > 0 ? (
            <ul className="divide-y divide-border">
              {visible.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  writable={writable}
                  onCheckIn={() => void attempt(() => actions.checkIn(member))}
                  onUndo={() => void attempt(() => actions.undoCheckIn(member))}
                />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query
                ? "لا أحد في القائمة بهذا الاسم. إن حضر ولم يكن مسجّلًا فأضفه من «حضر بلا تسجيل»."
                : filter === "present"
                  ? "لم يُسجَّل حضور أحد بعد."
                  : "حضر الجميع."}
            </p>
          )}
        </FieldCard>
      )}
    </div>
  );
}

const RSVP_LABELS: Partial<Record<Member["rsvp"], string>> = {
  COMING: "أكّد حضوره",
  NOT_COMING: "اعتذر",
};

function MemberRow({
  member,
  writable,
  onCheckIn,
  onUndo,
}: {
  member: Member;
  writable: boolean;
  onCheckIn: () => void;
  onUndo: () => void;
}) {
  const { attendance } = member;
  const unsent = attendance ? clientIdOf(attendance.id) !== null : false;
  const phone = member.phone ? dialable(member.phone) : null;
  const rsvp = RSVP_LABELS[member.rsvp];

  return (
    <li className="flex items-center gap-3 py-3 last:pb-0">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold leading-snug text-foreground">
          {member.fullNameAr}
        </p>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {member.role === "ASSISTANT" ? <span>مساعد القائد</span> : null}
          {attendance?.method === "WALK_IN" ? <span>بلا تسجيل مسبق</span> : null}
          {!attendance && rsvp ? <span>{rsvp}</span> : null}
          {attendance ? (
            <span>
              {/* `tabular-nums` لا `numeric`: الوقت فيه «ص/م»، وعزله يسارًا يقلب ترتيبه. */}
              حضر{" "}
              <span className="tabular-nums">
                {formatTime(attendance.checkedInAt)}
              </span>
              {unsent ? " · لم يُرسَل بعد" : ""}
            </span>
          ) : null}
          {phone ? (
            // يتصل القائد بمن تأخر بنقرة، دون أن ينسخ رقمًا في الشمس.
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1 rounded font-medium text-accent-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Phone className="size-3.5" aria-hidden />
              <span dir="ltr" className="numeric">
                {member.phone}
              </span>
            </a>
          ) : null}
        </p>
      </div>

      {attendance ? (
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden
          >
            <Check className="size-5" />
          </span>
          {writable ? (
            /**
             * زرٌّ ظاهر لا ضغطة مطوّلة: الضغطة المطوّلة لا يكتشفها أحد، ولا
             * تصل إليها لوحة المفاتيح ولا قارئ الشاشة.
             */
            <Button
              variant="ghost"
              size="sm"
              onClick={onUndo}
              aria-label={`التراجع عن حضور ${member.fullNameAr}`}
              className="px-3"
            >
              <Undo2 aria-hidden />
              تراجع
            </Button>
          ) : null}
        </div>
      ) : writable ? (
        <Button
          onClick={onCheckIn}
          aria-label={`تسجيل حضور ${member.fullNameAr}`}
          className="shrink-0 px-5"
        >
          <Check aria-hidden />
          حضر
        </Button>
      ) : null}
    </li>
  );
}

/**
 * من جاء بلا تسجيل مسبق. لا يُردّ: يُكتب اسمه فيصير عضوًا ويُسجَّل حضوره
 * معًا، والمنسّق يراه في اللوحة.
 */
function WalkInForm({
  members,
  onSubmit,
  onCancel,
}: {
  members: readonly Member[];
  onSubmit: (person: { fullNameAr: string; phone?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const fullNameAr = name.trim().replace(/\s+/g, " ");
  const cleanPhone = latinDigits(phone).trim();
  const phoneInvalid = cleanPhone !== "" && !PHONE_PATTERN.test(cleanPhone);

  const twin =
    fullNameAr.length >= 2
      ? members.find(
          (member) => searchKey(member.fullNameAr) === searchKey(fullNameAr),
        )
      : undefined;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (fullNameAr.length < 2 || phoneInvalid) return;

    setSaving(true);

    try {
      await onSubmit({
        fullNameAr,
        ...(cleanPhone ? { phone: cleanPhone } : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-4 border-t border-border pt-4"
    >
      <Field
        id={`${id}-name`}
        label="الاسم الكامل"
        {...(twin
          ? {
              hint: `في القائمة «${twin.fullNameAr}». إن كان هو فسجّل حضوره منها.`,
            }
          : {})}
      >
        <input
          id={`${id}-name`}
          name="fullNameAr"
          autoComplete="off"
          required
          minLength={2}
          maxLength={160}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        id={`${id}-phone`}
        label="رقم الهاتف"
        optional
        {...(phoneInvalid
          ? { hint: "اكتب الرقم بأرقامه، مثل 0944123456." }
          : {})}
      >
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          dir="ltr"
          maxLength={32}
          aria-invalid={phoneInvalid}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className={cn(INPUT_CLASS, "text-end")}
        />
      </Field>

      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={saving || fullNameAr.length < 2 || phoneInvalid}
        >
          {saving ? "…جارٍ الحفظ" : "أضفه وسجّل حضوره"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
