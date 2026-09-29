"use client";

import { CloudOff, Wifi } from "lucide-react";

import { useFieldSession, useOnline } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * حال الاتصال في رأس التطبيق. «بلا شبكة» يجتمع عليه اثنان: المتصفح يقول
 * لا واجهة، أو الخادم لم يُجب عند الفتح — وأيّهما يكفي، فالقائد يريد أن
 * يعرف هل ما يراه من المحفوظ.
 */
export function ConnectionBadge({ className }: { className?: string }) {
  const online = useOnline();
  const { status } = useFieldSession();
  const offline = !online || status === "offline";

  return (
    <span
      role="status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        offline
          ? "bg-warning/20 text-warning"
          : "bg-primary/15 text-foreground",
        className,
      )}
    >
      {offline ? (
        <CloudOff className="size-3.5" aria-hidden />
      ) : (
        <Wifi className="size-3.5" aria-hidden />
      )}
      {offline ? "بلا شبكة" : "متصل"}
    </span>
  );
}
