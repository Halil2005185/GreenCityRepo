"use client";

import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { FieldCard } from "@/components/field/states";
import { Button } from "@/components/ui/button";
import { formatAge } from "@/lib/field/labels";
import { discard, flush, retry, useOutbox } from "@/lib/field/outbox";
import type { OutboxItem } from "@/lib/field/outbox-types";
import { useOnline } from "@/lib/field/session";
import { cn } from "@/lib/utils";

/**
 * ما سُجّل على هذا الهاتف ولم يصل الخادم بعد.
 *
 * قسمان لأن حكمهما مختلف: ما ينتظر يُرسَل من تلقائه ولا يُطلب فيه شيء، وما
 * رفضه الخادم واقف حتى يقرر صاحبه — يعيده أو يسقطه.
 */
export function OutboxList() {
  const { items, syncing, loaded, volatile } = useOutbox();
  const online = useOnline();

  const failed = items.filter((item) => item.status === "failed");
  const waiting = items.filter((item) => item.status === "pending");

  if (!loaded) return null;

  return (
    <FieldCard
      title="ما لم يُرسَل بعد"
      aside={
        waiting.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={syncing || !online}
            onClick={() => void flush()}
          >
            <RefreshCw
              className={cn(syncing && "motion-safe:animate-spin")}
              aria-hidden
            />
            {syncing ? "يُرسَل…" : "أرسل الآن"}
          </Button>
        ) : null
      }
    >
      {volatile ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-foreground">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden
          />
          هذا المتصفح لا يسمح بالحفظ على الجهاز (تصفّح خاص، أو مساحة ممتلئة).
          ما تسجّله يُرسَل لحظته، ولا يبقى إن أُغلق التطبيق بلا شبكة.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          كل ما سجّلته وصل.
        </p>
      ) : (
        <div className="space-y-4">
          {failed.length > 0 ? (
            <section className="space-y-1">
              <h3 className="text-sm font-bold text-destructive">
                تعذّر إرساله
              </h3>
              <ul className="divide-y divide-border">
                {failed.map((item) => (
                  <Row key={item.clientId} item={item} />
                ))}
              </ul>
            </section>
          ) : null}

          {waiting.length > 0 ? (
            <section className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">
                بانتظار الإرسال
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {online
                  ? "يُرسَل من تلقائه والتطبيق مفتوح."
                  : "محفوظ على الهاتف، ويُرسَل حين تعود الشبكة والتطبيق مفتوح."}
              </p>
              <ul className="divide-y divide-border">
                {waiting.map((item) => (
                  <Row key={item.clientId} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </FieldCard>
  );
}

function Row({ item }: { item: OutboxItem }) {
  const [confirming, setConfirming] = useState(false);
  const failed = item.status === "failed";

  return (
    <li className="space-y-2 py-3 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold leading-snug text-foreground">
            {item.label}
          </p>
          <p className="text-xs text-muted-foreground">
            سُجّل {formatAge(item.createdAt)}
          </p>
        </div>

        {confirming ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="-my-1 shrink-0 px-3"
            onClick={() => setConfirming(true)}
          >
            أسقطه
          </Button>
        )}
      </div>

      {item.lastError ? (
        <p
          className={cn(
            "text-xs leading-relaxed",
            failed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {failed ? item.lastError : `آخر محاولة: ${item.lastError}`}
        </p>
      ) : null}

      {failed || confirming ? (
        <div className="flex flex-wrap gap-2">
          {failed && !confirming ? (
            <Button size="sm" onClick={() => void retry(item.clientId)}>
              أعد المحاولة
            </Button>
          ) : null}

          {confirming ? (
            <>
              {/* الإسقاط لا رجعة فيه: ما لم يُرسَل لا نسخة له في مكان آخر. */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void discard(item.clientId)}
              >
                نعم، أسقطه
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                أبقه
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
