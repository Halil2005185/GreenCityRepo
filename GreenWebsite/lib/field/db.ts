import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { OutboxItem } from "./outbox-types";

/**
 * مخزن التطبيق على الجهاز (IndexedDB).
 *
 * `localStorage` لا يكفي: متزامن يحجب الواجهة عند كل كتابة، وسقفه خمسة
 * ميغابايت نصًّا، ولا يحفظ الصور. هنا يعيش ما يجب أن ينجو من إغلاق
 * التطبيق بلا شبكة.
 */
interface FieldDb extends DBSchema {
  /** قيم مفردة بمفتاحها — ومنها لقطة ورقة اليوم. */
  kv: { key: string; value: unknown };
  /** ما سُجّل في الميدان وينتظر الإرسال، بترتيب تسجيله. */
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: { "by-created": number };
  };
  /** صور الطابور. منفصلة عنه كي لا تُقرأ الصور كلها عند كل عدّ للطابور. */
  blobs: { key: string; value: Blob };
}

const DB_NAME = "gc-field";
const DB_VERSION = 2;

let opening: Promise<IDBPDatabase<FieldDb>> | null = null;

/**
 * اتصال واحد يُفتح عند أول حاجة. لا يُستدعى على الخادم: `indexedDB` غير
 * موجودة هناك، والمستدعون كلهم مكوّنات عميل بعد التركيب.
 */
export function fieldDb() {
  opening ??= openDB<FieldDb>(DB_NAME, DB_VERSION, {
    /**
     * كل مخزن يُنشأ إن غاب، فالترقية من أي نسخة سابقة تمرّ من الكود نفسه
     * ولا تمسّ ما حُفظ في المخازن القائمة.
     */
    upgrade(db) {
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");

      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "clientId" }).createIndex(
          "by-created",
          "createdAt",
        );
      }

      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    },
    /**
     * نسخة أحدث من التطبيق في تبويب آخر تطلب ترقية المخزن: يُغلق هذا
     * الاتصال فلا يحجبها، ويُفتح من جديد عند أول حاجة.
     */
    blocking() {
      void opening?.then((db) => db.close());
      opening = null;
    },
    terminated() {
      opening = null;
    },
  });

  return opening;
}

export async function readValue<T>(key: string): Promise<T | undefined> {
  return (await (await fieldDb()).get("kv", key)) as T | undefined;
}

export async function writeValue(key: string, value: unknown) {
  await (await fieldDb()).put("kv", value, key);
}

export async function removeValue(key: string) {
  await (await fieldDb()).delete("kv", key);
}

/**
 * عند الخروج أو تبدّل صاحب الجلسة: لا يبقى على الجهاز ما قُرئ لمن سبقه.
 *
 * الطابور لا يُمسح هنا: ما سُجّل في الميدان ولم يُرسَل ليس نسخة من الخادم
 * بل الأصل الوحيد. يبقى باسم صاحبه، ويُرسَل حين يعود هو.
 */
export async function clearFieldData() {
  const db = await fieldDb();

  await db.clear("kv");
}
