"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/field/button";
import { FieldCard } from "@/components/field/states";
import {
  FieldApiError,
  OfflineError,
  requestFieldDeletion,
  withdrawFieldDeletion,
} from "@/lib/field/api";
import { formatDate } from "@/lib/field/labels";
import { fieldKeys, useFieldCard } from "@/lib/field/queries";
import { useOnline } from "@/lib/field/session";
import { notify } from "@/lib/field/toast";

/** ما يقع إن نُفّذ الطلب — يُقرأ قبل إرساله لا بعده. */
const CONSEQUENCES = [
  "يُمحى اسمك وهاتفك وبريدك، وطلب تسجيلك بما كتبت فيه.",
  "يتوقف رابطك: لا تُفتح به بطاقتك ولا سجلّك بعدها.",
  "تُلغى شهادتك، فلا يجدها من يتحقق منها.",
  "يبقى حضورك عددًا في أرقام الحملة، بلا اسم.",
];

/**
 * «بياناتي» في تبويب «أنا»: ما يحفظه المشروع عن المتطوع، وطلب حذفه.
 *
 * الطلب لا يحذف شيئًا من تلقائه: يراجعه منسّق الحملة وينفّذه من اللوحة،
 * فهاتف يُعار أو رابط يُشارَك لا يمحو سجل صاحبه بنقرة. ولا يدخل الطابور:
 * طلبٌ كهذا لا يُرسَل بعد أيام دون أن يعلم صاحبه أنه أُرسل.
 */
export function MyDataCard() {
  const queryClient = useQueryClient();
  const online = useOnline();
  const card = useFieldCard();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = card.data?.deletionRequest ?? null;
  const pending = request?.status === "PENDING";

  if (!card.data) return null;

  async function send(action: "request" | "withdraw") {
    setBusy(true);

    try {
      const next =
        action === "request"
          ? await requestFieldDeletion()
          : await withdrawFieldDeletion();

      queryClient.setQueryData(fieldKeys.card, next);
      setConfirming(false);
      notify(
        action === "request"
          ? "وصل طلبك إلى منسّق الحملة."
          : "تراجعت عن طلب الحذف. بياناتك كما هي.",
      );
    } catch (error) {
      notify(
        error instanceof OfflineError
          ? "لا اتصال الآن. أرسل الطلب حين تعود الشبكة."
          : error instanceof FieldApiError
            ? error.message
            : "تعذّر إرسال الطلب. حاول مرة أخرى.",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <FieldCard title="بياناتي">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-accent-ink"
          aria-hidden
        />
        يحفظ المشروع عنك اسمك، ووسيلة التواصل التي أعطيتها، ومجموعتك، وأيام
        حضورك. اسمك يراه منسّق الحملة وقائد مجموعتك ومساعده، ووسيلة التواصل
        يراها المنسّق والقائد وحدهما.
      </p>

      {pending ? (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <p
            role="status"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-relaxed text-foreground"
          >
            طلبت حذف بياناتك في {formatDate(request.requestedAt)}، وطلبك
            ينتظر مراجعة منسّق الحملة. حين يُنفَّذ يتوقف رابطك.
          </p>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={busy || !online}
            onClick={() => void send("withdraw")}
          >
            <Undo2 aria-hidden />
            {busy ? "…جارٍ الإرسال" : "تراجع عن الطلب"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {request?.status === "REJECTED" ? (
            <div
              role="status"
              className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-relaxed text-foreground"
            >
              <p className="font-bold">لم يُنفَّذ طلب حذف بياناتك.</p>
              {request.noteAr ? <p>{request.noteAr}</p> : null}
            </div>
          ) : null}

          {confirming ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-foreground">
                إن نُفّذ طلبك:
              </p>
              <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-foreground">
                {CONSEQUENCES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground">
                ينفّذه منسّق الحملة بعد مراجعته، ولك أن تتراجع قبل ذلك. وما
                مُحي لا يُستعاد.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  إلغاء
                </Button>
                <Button
                  size="lg"
                  disabled={busy || !online}
                  onClick={() => void send("request")}
                >
                  {busy ? "…جارٍ الإرسال" : "أرسل الطلب"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              // اللونان معًا: زر التطبيق يكتب لونه بـ`app:`، فيغلب ما لا يحملها.
              className="w-full text-destructive app:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
              {request?.status === "REJECTED"
                ? "اطلب الحذف مرة أخرى"
                : "اطلب حذف بياناتي"}
            </Button>
          )}
        </div>
      )}

      {!online && (pending || confirming) ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          لا اتصال الآن. الطلب يُرسَل والشبكة موصولة.
        </p>
      ) : null}
    </FieldCard>
  );
}
