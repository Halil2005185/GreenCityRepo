"use client";

import { QueryClient } from "@tanstack/react-query";
import {
  type PersistedClient,
  type Persister,
  PersistQueryClientProvider,
} from "@tanstack/react-query-persist-client";
import { useState } from "react";

import { FieldApiError, OfflineError } from "./api";
import { FIELD_CACHE_MAX_AGE_MS, FIELD_DATA_VERSION } from "./config";
import { readValue, removeValue, writeValue } from "./db";

const CACHE_KEY = "query-cache";

/** الكتابة إلى القرص مؤجَّلة ثانية: ذاكرة الاستعلامات تتغيّر دفعات متلاحقة. */
const PERSIST_DELAY_MS = 1000;

/**
 * يحفظ ما قُرئ من الخادم على الجهاز، فورقة اليوم المفتوحة صباحًا تبقى
 * مقروءة في الوادي. اللقطة تُحفظ كائنًا كما هي — IndexedDB ينسخ البنية،
 * فلا تحويل إلى نص ولا عودة منه.
 *
 * فشل الكتابة يُسجَّل ولا يُرمى: مخزن ممتلئ أو محجوب (تصفّح خاص) يجعل
 * التطبيق يعمل بلا حفظ، لا أن يتعطل.
 */
function createPersister(): Persister {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedClient | null = null;

  const flush = () => {
    timer = null;

    if (!pending) return;

    const snapshot = pending;

    pending = null;
    writeValue(CACHE_KEY, snapshot).catch((error: unknown) => {
      console.warn("[field] تعذّر حفظ البيانات على الجهاز:", error);
    });
  };

  return {
    persistClient(client) {
      pending = client;
      timer ??= setTimeout(flush, PERSIST_DELAY_MS);
    },
    async restoreClient() {
      try {
        return await readValue<PersistedClient>(CACHE_KEY);
      } catch {
        return undefined;
      }
    },
    async removeClient() {
      pending = null;
      await removeValue(CACHE_KEY).catch(() => undefined);
    },
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * المحاولة تجري ولو قال المتصفح «بلا شبكة»: `navigator.onLine` يكذب
         * في الاتجاهين — شبكة بلا إنترنت، وإنترنت خلف واجهة يراها معطّلة.
         * الحَكَم هو الطلب نفسه.
         */
        networkMode: "offlineFirst",
        staleTime: 30_000,
        // يجب ألا يقلّ عن عمر المحفوظ، وإلا مُسح من الذاكرة قبل أن يُحفظ.
        gcTime: FIELD_CACHE_MAX_AGE_MS,
        refetchOnReconnect: true,
        /**
         * الانقطاع والرفض لا يُعادان: الأول تعيده عودة الشبكة، والثاني
         * جوابٌ لن يتغيّر بالتكرار. يُعاد ما عداهما مرة — عطل عابر.
         */
        retry: (failures, error) =>
          !(error instanceof OfflineError) &&
          !(error instanceof FieldApiError && error.status < 500) &&
          failures < 1,
      },
    },
  });
}

export function FieldQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createClient);
  const [persister] = useState(createPersister);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: FIELD_CACHE_MAX_AGE_MS,
        buster: FIELD_DATA_VERSION,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
