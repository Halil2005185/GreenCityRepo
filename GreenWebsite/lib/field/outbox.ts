"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
  type FieldCard,
  FieldApiError,
  type FieldSheet,
  OfflineError,
  fieldFetch,
  uploadPhoto,
} from "./api";
import { fieldDb } from "./db";
import { damascusDay } from "./labels";
import type { OutboxDraft, OutboxItem, PhotoItem } from "./outbox-types";
import { applyItem, applyRsvp, forDay, isCurrentShape } from "./overlay";
import { fieldKeys } from "./queries";

export type OutboxState = {
  /** ما ينتظر وما رُفض، الأقدم أولًا. */
  items: readonly OutboxItem[];
  syncing: boolean;
  /** قُرئ الطابور من الجهاز. قبلها لا يُعرف هل فيه شيء. */
  loaded: boolean;
  /**
   * المخزن محجوب (تصفّح خاص) أو ممتلئ: ما يُسجَّل يعيش في الذاكرة ويُرسَل
   * لحظته، ولا ينجو من إغلاق التطبيق بلا شبكة.
   */
  volatile: boolean;
};

const EMPTY: OutboxState = {
  items: [],
  syncing: false,
  loaded: false,
  volatile: false,
};

let state: OutboxState = EMPTY;
let engine: { ownerId: string; queryClient: QueryClient } | null = null;
let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** صور ما تعذّر حفظه على القرص؛ تعيش ما عاشت الصفحة. */
const memoryBlobs = new Map<string, Blob>();

const listeners = new Set<() => void>();

function publish(next: Partial<OutboxState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
  };
}

export function useOutbox() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

/** ما سجّله هذا المستخدم على هذا الجهاز. طابور غيره لا يُقرأ ولا يُرسَل. */
async function readItems(ownerId: string) {
  const all = await (await fieldDb()).getAllFromIndex("outbox", "by-created");

  return all.filter((item) => item.ownerId === ownerId);
}

/**
 * يربط الطابور بصاحب الجلسة ويقرأ ما ترك على الجهاز. يُستدعى حين تُعرف
 * الهوية — بشبكة أو بلا شبكة — فما سُجّل أمس يظهر اليوم قبل أن يُرسَل.
 */
export async function attachOutbox(ownerId: string, queryClient: QueryClient) {
  engine = { ownerId, queryClient };

  try {
    publish({ items: await readItems(ownerId), loaded: true, volatile: false });
  } catch (error) {
    // مخزن محجوب: التطبيق يعمل بطابور في الذاكرة، وكل فعل يُرسَل لحظته.
    console.warn("[field] تعذّر فتح الطابور:", error);
    publish({ items: [], loaded: true, volatile: true });
  }
}

export function detachOutbox() {
  engine = null;

  if (retryTimer) clearTimeout(retryTimer);

  retryTimer = null;
  memoryBlobs.clear();
  publish(EMPTY);
}

/**
 * يسجّل فعلًا في الطابور ثم يحاول إرساله. الحفظ يسبق الإرسال دائمًا:
 * النقرة لا تنتظر الشبكة، ولا تضيع إن أُغلق التطبيق قبل أن تصل.
 */
export async function enqueue(draft: OutboxDraft, blob?: Blob) {
  if (!engine) throw new Error("The outbox is not attached to a session.");

  const item = {
    ...draft,
    clientId: crypto.randomUUID(),
    ownerId: engine.ownerId,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    lastError: null,
  } as OutboxItem;

  try {
    const db = await fieldDb();
    const tx = db.transaction(["outbox", "blobs"], "readwrite");

    // الصورة وصفّها معًا أو لا شيء: صف بلا صورته لا يُرسَل أبدًا.
    await Promise.all([
      tx.objectStore("outbox").put(item),
      blob ? tx.objectStore("blobs").put(blob, item.clientId) : null,
      tx.done,
    ]);
  } catch (error) {
    /**
     * القرص رفض — محجوب أو ممتلئ. الفعل لا يُرمى: يبقى في الذاكرة ويُرسَل
     * الآن، والواجهة تقول لصاحبه إنه لن ينجو من إغلاق التطبيق.
     */
    console.warn("[field] تعذّر حفظ الفعل على الجهاز:", error);

    if (blob) memoryBlobs.set(item.clientId, blob);

    publish({ volatile: true });
  }

  publish({ items: [...state.items, item] });
  void flush();

  return item;
}

/**
 * يخرج الفعل من الحالة أولًا ثم من القرص. الترتيب مقصود: من يستدعيها بعد
 * إرسال ناجح ثبّت أثر الفعل في الورقة لتوّه، فيجب ألا تُرسم لحظةٌ يُحسب
 * فيها الأثر مرتين — مرة من الورقة ومرة من الطابور.
 */
async function remove(clientId: string) {
  publish({ items: state.items.filter((item) => item.clientId !== clientId) });
  memoryBlobs.delete(clientId);

  try {
    const db = await fieldDb();
    const tx = db.transaction(["outbox", "blobs"], "readwrite");

    await Promise.all([
      tx.objectStore("outbox").delete(clientId),
      tx.objectStore("blobs").delete(clientId),
      tx.done,
    ]);
  } catch (error) {
    // بقي على القرص: يُعاد إرساله عند الفتح التالي، والخادم يعرف معرّفه.
    console.warn("[field] تعذّر حذف الفعل من الجهاز:", error);
  }
}

async function update(clientId: string, changes: Partial<OutboxItem>) {
  const current = state.items.find((item) => item.clientId === clientId);

  if (!current) return null;

  const next = { ...current, ...changes } as OutboxItem;

  publish({
    items: state.items.map((item) => (item.clientId === clientId ? next : item)),
  });

  try {
    await (await fieldDb()).put("outbox", next);
  } catch (error) {
    console.warn("[field] تعذّر تحديث الفعل على الجهاز:", error);
  }

  return next;
}

/**
 * يسقط فعلًا لم يُرسَل. يعيد `false` إن كان الفعل يُرسَل الآن أو أُرسل:
 * ما خرج إلى الشبكة لا يُسحب، والتراجع عنه فعلٌ ثانٍ.
 */
export async function discard(clientId: string) {
  if (sending === clientId) return false;
  if (!state.items.some((item) => item.clientId === clientId)) return false;

  await remove(clientId);

  return true;
}

export async function retry(clientId: string) {
  await update(clientId, { status: "pending", lastError: null, attempts: 0 });
  void flush();
}

export async function readBlob(clientId: string) {
  const held = memoryBlobs.get(clientId);

  if (held) return held;

  try {
    return await (await fieldDb()).get("blobs", clientId);
  } catch {
    return undefined;
  }
}

// ── الإرسال ────────────────────────────────────────────────────────────

let sending: string | null = null;

async function sendPhoto(item: PhotoItem) {
  const base = `/field/groups/${item.groupId}/photos`;
  let url = item.uploadedUrl;

  if (!url) {
    const blob = await readBlob(item.clientId);

    if (!blob) {
      throw new FieldApiError(
        "الصورة لم تعد على هذا الجهاز. التقطها من جديد.",
        410,
        "BLOB_MISSING",
      );
    }

    const signed = await fieldFetch<{
      data: { uploadUrl: string; publicUrl: string };
    }>(`${base}/sign`, {
      method: "POST",
      body: { contentType: item.payload.contentType, size: blob.size },
    });

    await uploadPhoto(signed.data.uploadUrl, blob, item.payload.contentType);

    url = signed.data.publicUrl;
    // يُحفظ قبل التسجيل: انقطاعٌ بعده لا يرفع الصورة مرة ثانية.
    await update(item.clientId, { uploadedUrl: url });
  }

  await fieldFetch(base, {
    method: "POST",
    body: { clientId: item.clientId, url, ...item.payload },
  });
}

function send(item: OutboxItem) {
  const group = `/field/groups/${item.groupId}`;

  switch (item.kind) {
    case "rsvp":
      return fieldFetch("/field/me/rsvp", {
        method: "POST",
        body: item.payload,
      });

    case "attendance":
      return fieldFetch(`${group}/attendance`, {
        method: "POST",
        body: { clientId: item.clientId, ...item.payload },
      });

    case "walk-in": {
      const { checkedInAt, ...walkIn } = item.payload;

      return fieldFetch(`${group}/attendance`, {
        method: "POST",
        body: { clientId: item.clientId, walkIn, checkedInAt },
      });
    }

    case "attendance-undo": {
      const { attendanceId, attendanceClientId } = item.payload;

      return fieldFetch(`${group}/attendance/undo`, {
        method: "POST",
        body: attendanceId ? { attendanceId } : { attendanceClientId },
      });
    }

    case "impact":
      return fieldFetch(`${group}/impact`, {
        method: "POST",
        body: { clientId: item.clientId, ...item.payload },
      });

    case "photo":
      return sendPhoto(item);

    case "task-status": {
      const { taskId, ...body } = item.payload;

      return fieldFetch(`/field/tasks/${taskId}/status`, {
        method: "POST",
        body: { groupId: item.groupId, ...body },
      });
    }

    case "task-comment":
      return fieldFetch(`/field/tasks/${item.payload.taskId}/comments`, {
        method: "POST",
        body: {
          clientId: item.clientId,
          groupId: item.groupId,
          bodyAr: item.payload.bodyAr,
        },
      });

    case "site-status":
      return fieldFetch(`${group}/site`, {
        method: "PATCH",
        body: item.payload,
      });
  }
}

/**
 * ما يُعاد من تلقائه: الخادم مشغول أو متعثّر، أو رابط الرفع انتهى عمره.
 * وما عداه رفضٌ لن يتغيّر بالتكرار — بيانات لا تُقبل، أو مجموعة لم تعد له.
 */
function isTransient(error: FieldApiError) {
  return (
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500 ||
    error.code === "UPLOAD_FAILED"
  );
}

const RETRY_STEP_MS = 30_000;
const RETRY_CAP_MS = 5 * 60_000;

/** بعدها يكفّ الطابور عن إعادة صورة من تلقائه، ويعرضها على صاحبها. */
const MAX_UPLOAD_ATTEMPTS = 6;

function scheduleRetry(attempts: number) {
  if (retryTimer) clearTimeout(retryTimer);

  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      void flush();
    },
    Math.min(RETRY_STEP_MS * Math.max(attempts, 1), RETRY_CAP_MS),
  );
}

/**
 * التالي في الدور: الأفعال بترتيبها أولًا، ثم الصور.
 *
 * الصور في صف ثانٍ لأنها الأثقل والأكثر تعثّرًا: صورة عالقة على شبكة ضعيفة
 * لا يجوز أن تحبس خلفها حضور ثلاثين متطوعًا. والأفعال فيما بينها مرتّبة —
 * التراجع عن حضور يأتي بعد الحضور.
 */
function nextItem(skipped: ReadonlySet<string>) {
  const waiting = state.items.filter(
    (entry) => entry.status === "pending" && !skipped.has(entry.clientId),
  );

  return (
    waiting.find((entry) => entry.kind !== "photo") ??
    waiting.find((entry) => entry.kind === "photo")
  );
}

async function drain(current: NonNullable<typeof engine>) {
  const touched = new Set<string>();
  const skipped = new Set<string>();
  let cardTouched = false;

  try {
    for (;;) {
      // يُقرأ من الحالة في كل دورة: ما أُضيف أثناء الإرسال يلحق بهذه الجولة.
      const item = nextItem(skipped);

      if (!item || engine !== current) return;

      sending = item.clientId;

      try {
        await send(item);
      } catch (error) {
        if (error instanceof OfflineError) return;

        if (!(error instanceof FieldApiError)) throw error;

        // الجلسة انتهت: الطابور ينتظر الدخول، وما فيه باقٍ باسم صاحبه.
        if (error.status === 401) return;

        if (isTransient(error)) {
          const attempts = item.attempts + 1;

          if (item.kind === "photo" && attempts >= MAX_UPLOAD_ATTEMPTS) {
            await update(item.clientId, {
              status: "failed",
              attempts,
              lastError:
                "تعذّر رفع الصورة بعد محاولات. أعد المحاولة على شبكة أفضل، وإن تكرر فأخبر المنسّق.",
            });

            continue;
          }

          await update(item.clientId, { attempts, lastError: error.message });
          scheduleRetry(attempts);

          // صورة تعثّرت تُترك لجولة تالية ويمضي ما بعدها؛ وتعثّر فعلٍ آخر
          // يعني أن الخادم نفسه متعب، فتقف الجولة.
          if (item.kind !== "photo") return;

          skipped.add(item.clientId);

          continue;
        }

        await update(item.clientId, {
          status: "failed",
          lastError: error.message,
        });

        continue;
      } finally {
        sending = null;
      }

      /**
       * الأثر يُثبَّت في الورقة المحفوظة قبل أن يخرج الفعل من الطابور، فلا
       * تمرّ لحظة تختفي فيها علامة الحضور بين الإرسال وجواب الخادم.
       */
      if (item.kind === "rsvp") {
        current.queryClient.setQueryData<FieldCard>(fieldKeys.card, (card) =>
          card ? applyRsvp(card, item) : card,
        );
        cardTouched = true;
      } else {
        current.queryClient.setQueryData<FieldSheet>(
          fieldKeys.sheet(item.groupId),
          (sheet) =>
            isCurrentShape(sheet)
              ? applyItem(forDay(sheet, damascusDay(Date.now())), item)
              : sheet,
        );
        touched.add(item.groupId);
      }

      await remove(item.clientId);
    }
  } finally {
    for (const groupId of touched) {
      void current.queryClient.invalidateQueries({
        queryKey: fieldKeys.sheet(groupId),
      });
    }

    if (touched.size > 0) {
      void current.queryClient.invalidateQueries({ queryKey: fieldKeys.home });
    }

    if (cardTouched) {
      void current.queryClient.invalidateQueries({ queryKey: fieldKeys.card });
    }
  }
}

/**
 * يفرّغ الطابور بترتيبه، جولة واحدة في الوقت الواحد.
 *
 * يُستدعى عند الفتح، وعند عودة الشبكة، وبعد كل تسجيل. لا مزامنة خلفية في
 * عامل الخدمة: غير متاحة على iOS، فالإرسال يجري والتطبيق مفتوح.
 */
export function flush(): Promise<void> {
  const current = engine;

  if (!current) return Promise.resolve();

  running ??= (async () => {
    publish({ syncing: true });

    try {
      await drain(current);
    } catch (error) {
      console.error("[field] تعطّل إرسال الطابور:", error);
    } finally {
      running = null;
      publish({ syncing: false });
    }
  })();

  return running;
}
