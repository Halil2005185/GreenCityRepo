"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  ClassificationFields,
  ClassificationSummary,
  type ClassificationValue,
} from "@/components/relations/classification";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  INTERACTION_KIND_LABELS,
  LOGGABLE_KINDS,
  MEDIA_STAGES,
  MEDIA_STAGE_LABELS,
  type InteractionKind,
  type MediaContactDetail,
  type MediaStage,
  changeMediaStage,
  getMediaContact,
  recordMediaInteraction,
  setFollowUpCompletion,
  updateMediaContact,
} from "@/lib/api/media";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * نموذج تسجيل التواصل مع موعد المتابعة التالية في المكان نفسه.
 *
 * فصلهما إلى خطوتين يعني أن الموعد لا يُسجَّل: من أنهى مكالمة يكتب سطرًا
 * ويغادر، ولا يعود لفتح شاشة ثانية ليقول «راجعه بعد أسبوع».
 */
function LogInteraction({
  contactId,
  onDone,
  onError,
}: {
  contactId: string;
  onDone: (detail: MediaContactDetail) => void;
  onError: (message: string) => void;
}) {
  const [kind, setKind] = useState<InteractionKind>("CALL");
  const [summaryAr, setSummaryAr] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [dueAt, setDueAt] = useState("");

  const record = useMutation({
    mutationFn: () =>
      recordMediaInteraction(contactId, {
        kind,
        summaryAr: summaryAr.trim(),
        ...(bodyAr.trim() ? { bodyAr: bodyAr.trim() } : {}),
        // حقل التاريخ يعطي يومًا بلا وقت؛ منتصف اليوم يجعله يقع في اليوم
        // نفسه بأي منطقة زمنية بدل أن ينزلق ليلًا إلى اليوم السابق.
        ...(dueAt ? { dueAt: new Date(`${dueAt}T12:00:00`).toISOString() } : {}),
      }),
    onSuccess: (detail) => {
      setSummaryAr("");
      setBodyAr("");
      setDueAt("");
      onDone(detail);
    },
    onError: (error) =>
      onError(
        error instanceof ApiError ? error.message : "تعذّر تسجيل التواصل.",
      ),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (summaryAr.trim().length < 2) return;

        record.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="kind">النوع</Label>
          <select
            id="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as InteractionKind)}
            className={inputClass}
          >
            {LOGGABLE_KINDS.map((value) => (
              <option key={value} value={value}>
                {INTERACTION_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="summaryAr">الخلاصة</Label>
          <Input
            id="summaryAr"
            value={summaryAr}
            onChange={(event) => setSummaryAr(event.target.value)}
            placeholder="ماذا جرى في سطر واحد"
            maxLength={300}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bodyAr">تفاصيل</Label>
        <textarea
          id="bodyAr"
          value={bodyAr}
          onChange={(event) => setBodyAr(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dueAt">تذكير بالمتابعة</Label>
          <Input
            id="dueAt"
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="w-44"
          />
        </div>

        <Button
          type="submit"
          loading={record.isPending}
          disabled={summaryAr.trim().length < 2}
        >
          تسجيل
        </Button>
      </div>
    </form>
  );
}

export default function MediaContactPage() {
  const params = useParams<{ id: string }>();
  const contactId = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClassificationValue | null>(null);

  const contact = useQuery({
    queryKey: ["media", "contact", contactId],
    queryFn: () => getMediaContact(contactId),
  });

  /** كل الطفرات تعيد الملف الكامل، فتحديث المخزن يكفي دون إعادة جلب. */
  const apply = (detail: MediaContactDetail) => {
    queryClient.setQueryData(["media", "contact", contactId], detail);
    queryClient.invalidateQueries({ queryKey: ["media", "contacts"] });
    queryClient.invalidateQueries({ queryKey: ["media", "follow-ups"] });
    setError(null);
  };

  const fail = (fallback: string) => (caught: unknown) =>
    setError(caught instanceof ApiError ? caught.message : fallback);

  const stage = useMutation({
    mutationFn: (next: MediaStage) => changeMediaStage(contactId, next),
    onSuccess: apply,
    onError: fail("تعذّر نقل المرحلة."),
  });

  const saveClassification = useMutation({
    mutationFn: (value: ClassificationValue) =>
      updateMediaContact(contactId, {
        priority: value.priority,
        horizon: value.horizon || null,
        relationshipTypeId: value.relationshipTypeId || null,
        channelIds: value.channelIds,
      }),
    onSuccess: (detail) => {
      apply(detail);
      setEditing(false);
    },
    onError: fail("تعذّر حفظ التصنيف."),
  });

  const followUp = useMutation({
    mutationFn: ({
      interactionId,
      completed,
    }: {
      interactionId: string;
      completed: boolean;
    }) => setFollowUpCompletion(contactId, interactionId, completed),
    onSuccess: apply,
    onError: fail("تعذّر تحديث المتابعة."),
  });

  if (contact.isPending) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (contact.isError || !contact.data) {
    return <Alert>تعذّر تحميل الملف.</Alert>;
  }

  const person = contact.data;
  const canManage = can(CAPABILITIES.mediaManage);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{person.fullNameAr}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              person.jobTitleAr,
              person.partnerNameAr ?? person.outletNameAr,
            ]
              .filter(Boolean)
              .join(" — ") || "بلا مسمى مسجَّل"}
          </p>
        </div>

        <Link
          href="/dashboard/media"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← الشبكة الإعلامية
        </Link>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            title="سجل التواصل"
            description="كل مكالمة ورسالة واجتماع، ومواعيد المتابعة المستحقة."
          >
            {canManage ? (
              <>
                <LogInteraction
                  contactId={contactId}
                  onDone={apply}
                  onError={setError}
                />
                <hr className="border-border" />
              </>
            ) : null}

            {person.interactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا سجل بعد.
              </p>
            ) : (
              <ul className="space-y-3">
                {person.interactions.map((item) => {
                  // التأخر يأتي محسوبًا من الخادم: ساعة المتصفح ليست مرجعًا.
                  const isOverdue = item.isOverdue;

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-md border p-3 text-sm",
                        isOverdue
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                          {INTERACTION_KIND_LABELS[item.kind]}
                        </span>
                        <span className="font-medium">{item.summaryAr}</span>
                        <span className="ms-auto text-xs text-muted-foreground">
                          {formatDateTime(item.occurredAt)}
                        </span>
                      </div>

                      {item.bodyAr ? (
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {item.bodyAr}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {item.recordedByNameAr ? (
                          <span>سجّلها {item.recordedByNameAr}</span>
                        ) : null}

                        {item.dueAt ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5",
                              item.completedAt
                                ? "bg-success/15 text-success"
                                : isOverdue
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-warning/15 text-warning",
                            )}
                          >
                            {item.completedAt
                              ? `أُنجزت ${formatDate(item.completedAt)}`
                              : `متابعة ${formatDate(item.dueAt)}`}
                          </span>
                        ) : null}

                        {item.dueAt && canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs"
                            loading={
                              followUp.isPending &&
                              followUp.variables?.interactionId === item.id
                            }
                            onClick={() =>
                              followUp.mutate({
                                interactionId: item.id,
                                completed: item.completedAt === null,
                              })
                            }
                          >
                            {item.completedAt ? (
                              <>
                                <RotateCcw className="size-3" />
                                إعادة فتح
                              </>
                            ) : (
                              <>
                                <Check className="size-3" />
                                تمّت
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {person.internalNotesAr !== null ? (
            <Section
              title="ملاحظات داخلية"
              description="لا تظهر لمن لا يملك صلاحية الاطلاع عليها."
            >
              <p className="whitespace-pre-wrap text-sm">
                {person.internalNotesAr || "لا ملاحظات."}
              </p>
            </Section>
          ) : null}
        </div>

        <div className="space-y-6">
          <Section title="مرحلة التواصل">
            <div className="flex flex-wrap gap-2">
              {MEDIA_STAGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canManage || stage.isPending}
                  onClick={() => stage.mutate(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    person.stage === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                    !canManage && "cursor-default",
                  )}
                >
                  {MEDIA_STAGE_LABELS[value]}
                </button>
              ))}
            </div>
          </Section>

          <Section title="التصنيف">
            {editing && draft ? (
              <div className="space-y-4">
                <ClassificationFields
                  value={draft}
                  onChange={setDraft}
                  idPrefix="edit"
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={saveClassification.isPending}
                    onClick={() => saveClassification.mutate(draft)}
                  >
                    حفظ
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ClassificationSummary
                  priority={person.priority}
                  horizon={person.horizon}
                  relationshipTypeNameAr={person.relationshipTypeNameAr}
                  channels={person.channels}
                  lastContactAt={person.lastContactAt}
                />

                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft({
                        priority: person.priority,
                        horizon: person.horizon ?? "",
                        relationshipTypeId: person.relationshipTypeId ?? "",
                        channelIds: person.channels.map((item) => item.id),
                      });
                      setEditing(true);
                    }}
                  >
                    تعديل التصنيف
                  </Button>
                ) : null}
              </>
            )}
          </Section>

          <Section title="بيانات التواصل">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">الهاتف</dt>
                <dd dir="ltr">
                  {person.phone ? (
                    <a href={`tel:${person.phone}`} className="hover:underline">
                      {person.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">البريد</dt>
                <dd dir="ltr" className="truncate">
                  {person.email ? (
                    <a
                      href={`mailto:${person.email}`}
                      className="hover:underline"
                    >
                      {person.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">الحساب</dt>
                <dd>
                  {person.profileUrl ? (
                    <a
                      href={person.profileUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      فتح
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">مسؤول العلاقة</dt>
                <dd>{person.accountManagerNameAr ?? "—"}</dd>
              </div>

              {person.partnerId ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">الجهة الشريكة</dt>
                  <dd>
                    <Link
                      href={`/dashboard/partners/${person.partnerId}`}
                      className="hover:underline"
                    >
                      {person.partnerNameAr}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
