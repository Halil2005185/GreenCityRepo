"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useState } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { z } from "zod";

import { IconButton } from "@/components/ui/actions";
import { Input, Label } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { listMapAreas } from "@/lib/api/map";
import { type Coordinates, isValidCoordinates } from "@/lib/map/geometry";

import { MapClient } from "./map-client";

const INVALID_MESSAGE =
  "الإحداثيات غير صالحة: خط العرض من سالب 90 إلى 90، وخط الطول من سالب 180 إلى 180.";

/** موقع إلزامي: غيابه يطلب التحديد، وقيمته المكتوبة الخاطئة تطلب التصحيح. */
export const locationSchema = z.custom<Coordinates>(isValidCoordinates, {
  error: (issue) =>
    issue.input == null ? "حدّد الموقع على الخريطة أو اكتب إحداثياته." : INVALID_MESSAGE,
});

/** موقع اختياري: `null` مقبول، والإحداثيات إن كُتبت فكلاهما معًا (شرط الـAPI). */
export const optionalLocationSchema = z.custom<Coordinates | null>(
  (value) => value == null || isValidCoordinates(value),
  INVALID_MESSAGE,
);

/**
 * ما يكتبه المستخدم ولا يُقرأ رقمًا: يفشل في التحقق بدل أن يبقى الموقع
 * القديم في النموذج صامتًا والحقل يعرض غيره.
 */
const INVALID: Coordinates = { lat: Number.NaN, lng: Number.NaN };

type Drafts = { lat: string; lng: string };

const EMPTY_DRAFTS: Drafts = { lat: "", lng: "" };

function toDrafts(value: Coordinates | null | undefined): Drafts {
  return isValidCoordinates(value) ? { lat: String(value.lat), lng: String(value.lng) } : EMPTY_DRAFTS;
}

/** الأرقام المشرقية والفارسية والفاصلة العشرية العربية إلى ما يفهمه `Number`. */
function normalizeNumber(text: string) {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .trim();
}

function parseDrafts(drafts: Drafts): Coordinates | null {
  const lat = normalizeNumber(drafts.lat);
  const lng = normalizeNumber(drafts.lng);

  if (!lat && !lng) return null;

  const value = { lat: lat ? Number(lat) : Number.NaN, lng: lng ? Number(lng) : Number.NaN };

  return isValidCoordinates(value) ? value : INVALID;
}

/** لصق «33.5138, 36.2765» من تطبيق خرائط في أيٍّ من الحقلين يملأ الاثنين. */
function splitPair(text: string): Drafts | null {
  const parts = normalizeNumber(text)
    .split(/[\s,،]+/)
    .filter(Boolean);

  return parts.length === 2 && parts.every((part) => Number.isFinite(Number(part)))
    ? { lat: parts[0], lng: parts[1] }
    : null;
}

/**
 * اختيار نقطة داخل أي نموذج: خريطة مصغّرة يُنقر فيها الموقع ويُسحب دبوسه،
 * وحقلا إحداثيات مربوطان بها. الحقلان ليسا تكرارًا: بهما يختار من يعمل
 * بلوحة المفاتيح، ويُلصق موقع منسوخ، ويبقى النموذج صالحًا للاستعمال حين
 * تُبنى اللوحة بلا رمز Mapbox.
 */
export function LocationPicker({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  clearable = false,
  inputRef,
}: {
  id: string;
  value: Coordinates | null | undefined;
  onChange: (value: Coordinates | null) => void;
  invalid?: boolean;
  describedBy?: string;
  /** موقع اختياري: زر يزيله فيعود الحقل فارغًا. */
  clearable?: boolean;
  /** يتلقى التركيز حين يفشل التحقق. */
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const areas = useQuery({ queryKey: ["map-areas"], queryFn: listMapAreas });

  const [drafts, setDrafts] = useState(() => toDrafts(value));
  const [synced, setSynced] = useState(value);
  const [focus, setFocus] = useState<Coordinates | null>(null);

  /**
   * قيمة تغيّرت من خارج الحقلين والخريطة — فتح النافذة من جديد، أو ضبط
   * النموذج — تُكتب في الحقلين وتطير إليها الخريطة. ما يكتبه المستخدم أو
   * ينقره يمرّ بـ`type` و`place` ويُسجَّل هناك، فلا يُعاد تنسيقه تحت يده.
   */
  if (value !== synced) {
    setSynced(value);

    if (value == null || isValidCoordinates(value)) {
      setDrafts(toDrafts(value));
      setFocus(value ?? null);
    }
  }

  function type(next: Drafts) {
    const parsed = parseDrafts(next);

    setDrafts(next);
    setSynced(parsed);
    onChange(parsed);

    if (isValidCoordinates(parsed)) setFocus(parsed);
  }

  function place(location: Coordinates) {
    setDrafts(toDrafts(location));
    setSynced(location);
    onChange(location);
  }

  function clear() {
    setDrafts(EMPTY_DRAFTS);
    setSynced(null);
    onChange(null);
  }

  function edit(key: keyof Drafts, text: string) {
    type(splitPair(text) ?? { ...drafts, [key]: text });
  }

  const current = isValidCoordinates(value) ? value : null;
  const areasSettled = areas.isSuccess || areas.isError;

  return (
    <div className="space-y-2">
      <div className="h-56 overflow-hidden rounded-md border border-input sm:h-64">
        {areasSettled ? (
          <MapClient
            compact
            picking
            label="خريطة لاختيار الموقع"
            areas={areas.data?.data ?? []}
            attribution={areas.data?.attribution ?? ""}
            pin={current}
            onPinMove={place}
            onPick={place}
            initialFocus={current}
            focus={focus}
          />
        ) : (
          <Skeleton className="size-full rounded-none" />
        )}
      </div>

      <div className="flex items-end gap-3">
        {(["lat", "lng"] as const).map((key) => (
          <div key={key} className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`${id}-${key}`} className="text-xs font-normal text-muted-foreground">
              {key === "lat" ? "خط العرض" : "خط الطول"}
            </Label>
            <Input
              ref={key === "lat" ? inputRef : undefined}
              id={`${id}-${key}`}
              dir="ltr"
              inputMode="decimal"
              autoComplete="off"
              placeholder={key === "lat" ? "33.5138" : "36.2765"}
              className="text-start"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              value={drafts[key]}
              onChange={(event) => edit(key, event.target.value)}
            />
          </div>
        ))}

        {/* في آخر صف الإحداثيات لا تحته، فيبقى تلميح الحقل ملاصقًا له. */}
        {clearable && value ? (
          <IconButton label="إزالة الموقع" icon={X} variant="outline" size="icon" onClick={clear} />
        ) : null}
      </div>
    </div>
  );
}

/** `LocationPicker` بتسميته وتلميحه ورسالة خطئه على react-hook-form. */
export function LocationField<T extends FieldValues>({
  control,
  name,
  label,
  hint = "انقر الموقع على الخريطة ثم اسحب الدبوس لضبطه، أو اكتب الإحداثيات أو الصقها.",
  clearable = false,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  clearable?: boolean;
}) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;
        const describedBy =
          [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null]
            .filter(Boolean)
            .join(" ") || undefined;

        return (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium text-foreground">{label}</legend>

            <LocationPicker
              id={id}
              value={field.value as Coordinates | null | undefined}
              onChange={(next) => {
                field.onChange(next);
                field.onBlur();
              }}
              invalid={Boolean(error)}
              describedBy={describedBy}
              clearable={clearable}
              inputRef={field.ref}
            />

            {hint && !error ? (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </fieldset>
        );
      }}
    />
  );
}
