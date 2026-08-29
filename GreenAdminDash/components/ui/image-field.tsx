"use client";

import { ImageUp, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { type UploadPurpose, uploadFile } from "@/lib/api/uploads";

/**
 * حقل صورة: يرفع الملف ويحتفظ برابطه.
 *
 * القيمة تبقى رابطًا كما كانت — لا عمود جديد ولا هجرة — فما رُفع سابقًا
 * من روابط خارجية يظل صالحًا، والرفع ليس إلا طريقة أخرى لملء الحقل نفسه.
 */
export function ImageField({
  label,
  hint,
  value,
  purpose,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  purpose: UploadPurpose;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      onChange(await uploadFile(file, purpose));
    } catch (thrown) {
      setError(
        thrown instanceof ApiError || thrown instanceof Error
          ? thrown.message
          : "تعذّر رفع الصورة.",
      );
    } finally {
      setUploading(false);

      // تفريغ الحقل كي يُقبل اختيار الملف نفسه مرة أخرى بعد فشل.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>

      {value ? (
        <div className="relative">
          {/* رابط تخزين خارجي، فلا `next/image` بلا نطاق مسموح. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="h-40 w-full rounded-lg border border-border object-cover"
          />

          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="إزالة الصورة"
            className="absolute end-2 top-2"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImageUp className="size-4" />
          {value ? "استبدال الصورة" : "رفع صورة"}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void pick(event.target.files?.[0])}
        />

        <span className="text-xs text-muted-foreground">
          {hint ?? "JPEG أو PNG أو WebP، حتى خمسة ميغابايت."}
        </span>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
