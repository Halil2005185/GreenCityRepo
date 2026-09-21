"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * رابط يُعرض مرة واحدة (دعوة، إعادة تعيين): نسخه هو الطريق الوحيد إليه،
 * فحالة «نُسخ» ظاهرة على الزر، وإن رفض المتصفح الحافظة يُحدَّد النص كله
 * ليُنسخ يدويًا بدل أن يفشل الزر بصمت.
 */
export function OneTimeLink({
  url,
  note = "انسخ الرابط وأرسله — لن يظهر مرة أخرى.",
}: {
  url: string;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("نُسخ الرابط.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const range = document.createRange();

      if (codeRef.current) {
        range.selectNodeContents(codeRef.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }

      toast.error("تعذّر النسخ تلقائيًا. الرابط محدَّد — انسخه يدويًا.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm">{note}</p>
      <div className="flex items-center gap-2">
        <code
          ref={codeRef}
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-start text-xs"
        >
          {url}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "نُسخ" : "نسخ الرابط"}
        </Button>
      </div>
    </div>
  );
}
