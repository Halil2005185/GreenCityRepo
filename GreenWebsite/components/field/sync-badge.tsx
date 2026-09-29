"use client";

import { CloudOff, RefreshCw, TriangleAlert, Upload, Wifi } from "lucide-react";
import Link from "next/link";

import { FIELD_ROUTES } from "@/lib/field/config";
import { useOutbox } from "@/lib/field/outbox";
import { useFieldSession, useOnline } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * حال الاتصال وما ينتظر الإرسال، في رأس التطبيق.
 *
 * يجيب عن سؤال القائد الواحد: «هل وصل ما سجّلته؟». الأهم يغلب: ما رفضه
 * الخادم يحتاج قرارًا منه، ثم الانقطاع، ثم ما في الطريق.
 *
 * والشارة رابط إلى «أنا»: هناك قائمة ما لم يُرسَل وما يُفعل به.
 */
export function SyncBadge({ className }: { className?: string }) {
  const online = useOnline();
  const { status } = useFieldSession();
  const { items, syncing } = useOutbox();

  const offline = !online || status === "offline";
  const failed = items.filter((item) => item.status === "failed").length;
  const waiting = items.length - failed;

  const view =
    failed > 0
      ? {
          icon: TriangleAlert,
          label: `تعذّر إرسال ${failed}`,
          tone: "bg-destructive/15 text-destructive",
        }
      : offline
        ? {
            icon: CloudOff,
            label: waiting > 0 ? `بلا شبكة · ${waiting} بانتظارها` : "بلا شبكة",
            tone: "bg-warning/20 text-warning",
          }
        : waiting > 0
          ? {
              icon: syncing ? RefreshCw : Upload,
              label: syncing ? "يُرسَل…" : `${waiting} بانتظار الإرسال`,
              tone: "bg-primary/15 text-foreground",
            }
          : {
              icon: Wifi,
              label: "متصل",
              tone: "bg-primary/15 text-foreground",
            };

  return (
    <Link
      href={FIELD_ROUTES.me}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        view.tone,
        className,
      )}
    >
      <view.icon
        className={cn(
          "size-3.5",
          syncing && waiting > 0 && failed === 0 && !offline
            ? "motion-safe:animate-spin"
            : null,
        )}
        aria-hidden
      />
      {/* المنطقة الحيّة داخل الرابط لا عليه: الرابط يبقى رابطًا لقارئ الشاشة. */}
      <span role="status" className="tabular-nums">
        {view.label}
      </span>
    </Link>
  );
}
