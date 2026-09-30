"use client";

import {
  Camera,
  CloudUpload,
  ImageOff,
  ImagePlus,
  Images,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ClosedNotice } from "@/components/field/closed-notice";
import { CheckRow, Field, INPUT_CLASS } from "@/components/field/form";
import { SheetGate, type SheetView } from "@/components/field/sheet-gate";
import { FieldCard, FieldNotice } from "@/components/field/states";
import { Button, buttonVariants } from "@/components/field/button";
import type { FieldSheet } from "@/lib/field/api";
import { formatAge } from "@/lib/field/labels";
import { discard, readBlob, retry, useOutbox } from "@/lib/field/outbox";
import type { PhotoItem } from "@/lib/field/outbox-types";
import { compressPhoto, locatePhoto } from "@/lib/field/photos";
import { notify } from "@/lib/field/toast";
import { cn, formatNumber } from "@/lib/utils";

type Photo = FieldSheet["photos"][number];

/**
 * تبويب «الصور»: دليل ما أُنجز، يُلتقط في مكانه.
 *
 * الصورة تُصغَّر على الهاتف وتُحفظ فيه، ثم تُرفع حين توجد الشبكة. وهي
 * داخلية حتى يسمح المنسّق بنشرها — ومن فيها أشخاص لا تُحفظ بلا موافقتهم.
 */
export function PhotosScreen() {
  return (
    <SheetGate title="الصور">{(view) => <Photos {...view} />}</SheetGate>
  );
}

function Photos({ sheet, actions, writable }: SheetView) {
  const { items } = useOutbox();

  const waiting = items.filter(
    (item): item is PhotoItem =>
      item.kind === "photo" && item.groupId === sheet.group.id,
  );

  return (
    <div className="space-y-4">
      <ClosedNotice sheet={sheet} />

      {writable ? <Capture sheet={sheet} actions={actions} /> : null}

      {waiting.length > 0 ? (
        <FieldCard title="لم تُرفع بعد">
          <ul className="divide-y divide-border">
            {waiting.map((item) => (
              <WaitingPhoto key={item.clientId} item={item} />
            ))}
          </ul>
        </FieldCard>
      ) : null}

      {sheet.photos.length > 0 ? (
        <FieldCard
          title="صور المجموعة"
          aside={
            <span className="numeric text-xs font-medium text-muted-foreground">
              {formatNumber(sheet.photoCount)}
            </span>
          }
        >
          <ul className="grid grid-cols-3 gap-2">
            {sheet.photos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} />
            ))}
          </ul>

          {sheet.photoCount > sheet.photos.length + waiting.length ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              هذه أحدث الصور. المعرض كاملًا عند المنسّق في لوحة التحكم.
            </p>
          ) : null}
        </FieldCard>
      ) : waiting.length === 0 ? (
        <FieldNotice
          icon={Images}
          title="لا صور بعد"
          description="صوّر الموقع قبل العمل وبعده، وما يعيق مهمة أو يثبت إنجازها. الصور تبقى داخلية حتى يسمح المنسّق بنشرها."
        />
      ) : null}
    </div>
  );
}

const LOCATION_KEY = "gc-field-photo-location";

function prefersLocation() {
  try {
    return window.localStorage.getItem(LOCATION_KEY) !== "0";
  } catch {
    return true;
  }
}

function rememberLocation(value: boolean) {
  try {
    window.localStorage.setItem(LOCATION_KEY, value ? "1" : "0");
  } catch {
    // مخزن محجوب: الخيار يعيش ما عاشت الصفحة.
  }
}

type Draft = { file: File; previewUrl: string };

function Capture({
  sheet,
  actions,
}: Pick<SheetView, "sheet" | "actions">) {
  const id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState("");
  const [taskId, setTaskId] = useState("");
  const [hasPeople, setHasPeople] = useState(false);
  const [consent, setConsent] = useState(false);
  const [withLocation, setWithLocation] = useState(true);
  const [saving, setSaving] = useState(false);

  // العنوان المؤقت يُحرَّر حين تُستبدل الصورة أو تُغلق الشاشة، لا قبل ذلك.
  const preview = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );

  function release() {
    if (preview.current) URL.revokeObjectURL(preview.current);

    preview.current = null;
  }

  function reset() {
    release();
    setDraft(null);
    setCaption("");
    setTaskId("");
    setHasPeople(false);
    setConsent(false);
  }

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    // يُفرَّغ الحقل كي تُطلق الصورة نفسها الحدث لو اختيرت مرة ثانية.
    event.target.value = "";

    if (!file) return;

    release();
    preview.current = URL.createObjectURL(file);
    setWithLocation(prefersLocation());
    setDraft({ file, previewUrl: preview.current });
  }

  const blocked = hasPeople && !consent;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || blocked) return;

    setSaving(true);

    try {
      const [blob, location] = await Promise.all([
        compressPhoto(draft.file),
        withLocation ? locatePhoto() : null,
      ]);

      rememberLocation(withLocation);

      await actions.addPhoto(blob, {
        ...(caption.trim() ? { captionAr: caption.trim() } : {}),
        ...(taskId ? { taskId } : {}),
        location,
        hasPeople,
        peopleConsent: hasPeople && consent,
      });

      notify("حُفظت الصورة على الهاتف، وتُرفع حين توجد الشبكة.");
      reset();
    } catch (error) {
      console.error("[field] تعذّر حفظ الصورة:", error);
      notify(
        "تعذّر تجهيز هذه الصورة. التقطها من جديد أو اختر غيرها.",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <FieldCard>
        <div className="grid grid-cols-2 gap-3">
          {/*
            `<label>` يغلّف الحقل: النقر عليه يفتح الكاميرا بلا JavaScript،
            والحقل نفسه مخفيّ عن العين لا عن قارئ الشاشة.
          */}
          <label
            className={cn(
              buttonVariants({ size: "lg" }),
              "cursor-pointer px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
            )}
          >
            <Camera aria-hidden />
            التقط صورة
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={choose}
              className="sr-only"
            />
          </label>

          <label
            className={cn(
              buttonVariants({ variant: "secondary", size: "lg" }),
              "cursor-pointer px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
            )}
          >
            <ImagePlus aria-hidden />
            من المعرض
            <input
              type="file"
              accept="image/*"
              onChange={choose}
              className="sr-only"
            />
          </label>
        </div>
      </FieldCard>
    );
  }

  return (
    <FieldCard title="صورة جديدة">
      <form onSubmit={save} className="space-y-4">
        {/* معاينة من ملف على الهاتف: لا محسِّن صور يمرّ بها، ولا شبكة. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={draft.previewUrl}
          alt="معاينة الصورة قبل حفظها"
          className="max-h-72 w-full rounded-lg bg-surface-strong object-contain"
        />

        <Field id={`${id}-caption`} label="ماذا في الصورة؟" optional>
          <input
            id={`${id}-caption`}
            maxLength={300}
            autoComplete="off"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="مثال: الصف الأول بعد الغرس"
            className={INPUT_CLASS}
          />
        </Field>

        {sheet.tasks.length > 0 ? (
          <Field
            id={`${id}-task`}
            label="تخصّ مهمة؟"
            optional
            hint="صورة عائق أو إنجاز تظهر للمنسّق مع مهمتها."
          >
            <select
              id={`${id}-task`}
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">الموقع عمومًا</option>
              {sheet.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.titleAr}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="space-y-2">
          <CheckRow
            checked={hasPeople}
            onChange={(checked) => {
              setHasPeople(checked);

              if (!checked) setConsent(false);
            }}
            label="في الصورة أشخاص تُعرف وجوههم"
          />

          {hasPeople ? (
            <CheckRow
              checked={consent}
              onChange={setConsent}
              label="وافقوا على تصويرهم"
              hint="وعن الأطفال وليّ أمرهم. بلا موافقة لا تُحفظ الصورة: صوّر الموقع والعمل دون الوجوه."
            />
          ) : null}

          <CheckRow
            checked={withLocation}
            onChange={setWithLocation}
            label="أرفق موقع الالتقاط"
            hint="يسأل الهاتف إذنك مرة. يثبت أن الصورة من موقع التنفيذ، ولا يُنشر."
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            size="lg"
            className="flex-1"
            disabled={saving || blocked}
          >
            {saving ? "…جارٍ الحفظ" : "احفظ الصورة"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={saving}
            onClick={reset}
          >
            إلغاء
          </Button>
        </div>
      </form>
    </FieldCard>
  );
}

/** عنوان مؤقت لصورة محفوظة على الهاتف؛ يُحرَّر حين يُزال الصف. */
function useBlobUrl(clientId: string) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    void (async () => {
      const blob = await readBlob(clientId);

      if (!blob || cancelled) return;

      created = URL.createObjectURL(blob);
      setUrl(created);
    })();

    return () => {
      cancelled = true;

      if (created) URL.revokeObjectURL(created);
    };
  }, [clientId]);

  return url;
}

function WaitingPhoto({ item }: { item: PhotoItem }) {
  const url = useBlobUrl(item.clientId);
  const [confirming, setConfirming] = useState(false);
  const failed = item.status === "failed";

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-strong text-muted-foreground">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <CloudUpload className="size-5" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {item.label}
        </p>
        <p
          className={cn(
            "flex items-start gap-1.5 text-xs leading-relaxed",
            failed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {failed ? (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : null}
          {failed
            ? (item.lastError ?? "تعذّر رفعها.")
            : `التُقطت ${formatAge(item.createdAt)} · تُرفع حين توجد الشبكة`}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {failed ? (
            <Button size="sm" onClick={() => void retry(item.clientId)}>
              أعد المحاولة
            </Button>
          ) : null}

          {confirming ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void discard(item.clientId)}
              >
                نعم، احذفها
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                أبقها
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(true)}
            >
              احذفها
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function PhotoTile({ photo }: { photo: Photo }) {
  const [missing, setMissing] = useState(false);
  const label = photo.captionAr ?? "صورة من الموقع";

  return (
    <li className="space-y-1">
      <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-strong text-muted-foreground">
        {missing ? (
          // بلا شبكة لا تصل الصورة من التخزين؛ مكانها محفوظ وعنوانها تحتها.
          <ImageOff className="size-5" aria-label="تعذّر عرض الصورة الآن" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={label}
            loading="lazy"
            decoding="async"
            onError={() => setMissing(true)}
            className="size-full object-cover"
          />
        )}
      </span>
      {photo.captionAr ? (
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {photo.captionAr}
        </p>
      ) : null}
    </li>
  );
}
