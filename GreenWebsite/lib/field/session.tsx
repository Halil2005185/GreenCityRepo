"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type AuthUser,
  FieldApiError,
  OfflineError,
  clearAccessToken,
  login as requestLogin,
  logout as requestLogout,
  refreshSession,
} from "./api";
import { clearFieldData } from "./db";

/**
 * ما يُعرف عن صاحب الجلسة ويُحفظ على الجهاز: اسمه ومعرّفه، لا رمزه ولا
 * قدراته. به يُفتح التطبيق بلا شبكة على «مرحبًا يا فلان» وورقته المحفوظة
 * بدل صفحة دخول لا تستطيع أن تُدخل أحدًا.
 */
export type FieldIdentity = {
  userId: string;
  fullNameAr: string;
  email: string;
};

/**
 * `offline`: لا جواب من الخادم، ومعنا هوية من جلسة سابقة. يُقرأ المحفوظ،
 * والتحقق من الجلسة مؤجَّل إلى عودة الشبكة.
 */
export type SessionStatus = "loading" | "authenticated" | "offline" | "anonymous";

type SessionValue = {
  status: SessionStatus;
  identity: FieldIdentity | null;
  /** من الخادم في هذه الجلسة. `null` بلا شبكة ولو عُرفت الهوية. */
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const IDENTITY_KEY = "gc-field-identity";

/**
 * خروجٌ طُلب بلا شبكة: الكوكي httpOnly لا تُمسح من المتصفح، فتبقى صالحة
 * على الخادم. العلامة تجعل أول فتح بشبكة يُنهي الجلسة هناك قبل أي شيء،
 * وإلا عاد التطبيق يدخل صاحبها بصمت بعد أن خرج.
 */
const SIGNED_OUT_KEY = "gc-field-signed-out";

function readIdentity(): FieldIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);

    return raw ? (JSON.parse(raw) as FieldIdentity) : null;
  } catch {
    return null;
  }
}

function writeIdentity(identity: FieldIdentity | null) {
  try {
    if (identity) {
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } else {
      window.localStorage.removeItem(IDENTITY_KEY);
    }
  } catch {
    // مخزن محجوب (تصفّح خاص): التطبيق يعمل، ولا يتذكّر بين الجلسات.
  }
}

function flag(key: string, value?: boolean) {
  try {
    if (value === undefined) return window.localStorage.getItem(key) === "1";

    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // كما في `writeIdentity`.
  }

  return false;
}

type Resolution = Pick<SessionValue, "status" | "identity" | "user">;

const ANONYMOUS: Resolution = { status: "anonymous", identity: null, user: null };

/**
 * صاحب جلسة غير من سبقه على الجهاز: ما حُفظ لذاك لا يُعرض لهذا. يُمسح قبل
 * أن تُعلَن الجلسة، فلا تومض ورقة مجموعة ليست له.
 */
async function adopt(next: AuthUser, queryClient: QueryClient) {
  const previous = readIdentity();

  if (previous && previous.userId !== next.id) {
    queryClient.clear();
    await clearFieldData().catch(() => undefined);
  }

  const identity = {
    userId: next.id,
    fullNameAr: next.fullNameAr,
    email: next.email,
  };

  writeIdentity(identity);

  return { status: "authenticated", identity, user: next } satisfies Resolution;
}

/**
 * يسأل الخادم عن الجلسة ويعيد ما يجب أن تكون عليه الحال. بلا حالة React
 * فيه: النتيجة قيمة يطبّقها المزوِّد، فيُستدعى عند الفتح وعند عودة الشبكة.
 */
async function resolveSession(queryClient: QueryClient): Promise<Resolution> {
  try {
    if (flag(SIGNED_OUT_KEY)) {
      await requestLogout();
      flag(SIGNED_OUT_KEY, false);

      return ANONYMOUS;
    }

    const session = await refreshSession();

    // الخادم أجاب: لا جلسة. الهوية المحفوظة تبقى لتُقارَن بمن يدخل بعدها.
    return session ? await adopt(session.user, queryClient) : ANONYMOUS;
  } catch (error) {
    if (!(error instanceof OfflineError)) {
      // عطل لا نعرفه: صفحة الدخول أصدق من شاشة تحميل لا تنتهي.
      console.error("[field] تعذّر استئناف الجلسة:", error);

      return ANONYMOUS;
    }

    const known = flag(SIGNED_OUT_KEY) ? null : readIdentity();

    return known
      ? { status: "offline", identity: known, user: null }
      : ANONYMOUS;
  }
}

const SessionContext = createContext<SessionValue | null>(null);

export function FieldSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [identity, setIdentity] = useState<FieldIdentity | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const apply = useCallback((resolution: Resolution) => {
    setIdentity(resolution.identity);
    setUser(resolution.user);
    setStatus(resolution.status);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resume = () =>
      void (async () => {
        const resolution = await resolveSession(queryClient);

        if (!cancelled) apply(resolution);
      })();

    resume();

    // عودة الشبكة تعيد المحاولة: من فُتح تطبيقه في الوادي يُتحقَّق منه عند الطريق.
    window.addEventListener("online", resume);

    return () => {
      cancelled = true;
      window.removeEventListener("online", resume);
    };
  }, [queryClient, apply]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await requestLogin(email, password);

      /**
       * ممثل جهة شريكة حسابه صالح، لكن الميدان ليس بوابته. يُخرَج فورًا كي
       * لا تبقى على الجهاز جلسة لا تفتح شيئًا.
       */
      if (session.user.kind !== "STAFF") {
        await requestLogout().catch(() => undefined);

        throw new FieldApiError(
          "هذا الحساب لبوابة الشركاء، والتطبيق الميداني لفريق المدن الخضراء.",
          403,
          "FORBIDDEN",
        );
      }

      flag(SIGNED_OUT_KEY, false);
      apply(await adopt(session.user, queryClient));
    },
    [apply, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;

      flag(SIGNED_OUT_KEY, true);
    } finally {
      clearAccessToken();
      writeIdentity(null);
      queryClient.clear();
      await clearFieldData().catch(() => undefined);
      setIdentity(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, [queryClient]);

  const value = useMemo<SessionValue>(
    () => ({ status, identity, user, login, logout }),
    [status, identity, user, login, logout],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useFieldSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useFieldSession must be used inside <FieldSessionProvider>.");
  }

  return context;
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * ما يقوله المتصفح عن الشبكة. تلميح للواجهة لا حَكَم: شبكة بلا إنترنت
 * تُقرأ «متصل»، فالطلب نفسه هو ما يقرر — هذا يختار العبارة وحدها.
 */
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
