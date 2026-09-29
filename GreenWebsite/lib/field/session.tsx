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
  onSessionLost,
  redeemLink,
  refreshSession,
  setLinkToken,
} from "./api";
import { clearFieldData } from "./db";
import { disablePush } from "./push";
import { notify } from "./toast";

/**
 * ما يُعرف عن صاحب الجلسة ويُحفظ على الجهاز: اسمه ومعرّفه، لا قدراته. به
 * يُفتح التطبيق بلا شبكة على «مرحبًا يا فلان» وما حُفظ له، بدل صفحة دخول لا
 * تستطيع أن تُدخل أحدًا.
 *
 * صاحبان: عضو الفريق بحسابه، والمتطوع برابطه الشخصي. `ownerId` ما يُنسب
 * إليه ما سُجّل على الهاتف ولم يُرسَل، فلا يُرسَل طابور أحدهما باسم الآخر.
 */
export type StaffIdentity = {
  kind: "STAFF";
  ownerId: string;
  userId: string;
  fullNameAr: string;
  email: string;
};

export type ParticipantIdentity = {
  kind: "PARTICIPANT";
  ownerId: string;
  participantId: string;
  fullNameAr: string;
  initiativeNameAr: string;
  /** انتهاء الرابط الشخصي؛ بعده تُغلق البطاقة ويُطلب رابط جديد. */
  expiresAt: string;
};

export type FieldIdentity = StaffIdentity | ParticipantIdentity;

/**
 * `offline`: لا جواب من الخادم، ومعنا هوية من جلسة سابقة. يُقرأ المحفوظ،
 * والتحقق من الجلسة مؤجَّل إلى عودة الشبكة.
 */
export type SessionStatus = "loading" | "authenticated" | "offline" | "anonymous";

type SessionValue = {
  status: SessionStatus;
  identity: FieldIdentity | null;
  /** من الخادم في هذه الجلسة. `null` بلا شبكة ولو عُرفت الهوية، وللمتطوع. */
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  /** يفتح رابطًا شخصيًا ويحفظه على الجهاز. */
  redeem: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const IDENTITY_KEY = "gc-field-identity";

/**
 * الرابط الشخصي على الجهاز: الرمز ومعه ما يكفي ليُقال «أهلًا يا فلان» بلا
 * شبكة. المتطوع لا كوكي له ولا كلمة مرور — الرمز اعتماده كله، وما يفتحه
 * بطاقته في حملة واحدة.
 */
const LINK_KEY = "gc-field-link";

/**
 * خروجٌ طُلب بلا شبكة: الكوكي httpOnly لا تُمسح من المتصفح، فتبقى صالحة
 * على الخادم. العلامة تجعل أول فتح بشبكة يُنهي الجلسة هناك قبل أي شيء،
 * وإلا عاد التطبيق يدخل صاحبها بصمت بعد أن خرج.
 */
const SIGNED_OUT_KEY = "gc-field-signed-out";

type StoredLink = Omit<ParticipantIdentity, "kind" | "ownerId"> & {
  token: string;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // مخزن محجوب (تصفّح خاص): التطبيق يعمل، ولا يتذكّر بين الجلسات.
  }
}

function readIdentity(): StaffIdentity | null {
  const stored = readJson<Omit<StaffIdentity, "kind" | "ownerId">>(IDENTITY_KEY);

  // ما حُفظ قبل أن يُعرف المتطوع لا يحمل `kind`؛ كله كان لعضو فريق.
  return stored?.userId
    ? {
        kind: "STAFF",
        ownerId: stored.userId,
        userId: stored.userId,
        fullNameAr: stored.fullNameAr,
        email: stored.email,
      }
    : null;
}

function writeIdentity(identity: StaffIdentity | null) {
  writeJson(
    IDENTITY_KEY,
    identity
      ? {
          userId: identity.userId,
          fullNameAr: identity.fullNameAr,
          email: identity.email,
        }
      : null,
  );
}

const participantOf = (link: StoredLink): ParticipantIdentity => ({
  kind: "PARTICIPANT",
  ownerId: `participant:${link.participantId}`,
  participantId: link.participantId,
  fullNameAr: link.fullNameAr,
  initiativeNameAr: link.initiativeNameAr,
  expiresAt: link.expiresAt,
});

function flag(key: string, value?: boolean) {
  try {
    if (value === undefined) return window.localStorage.getItem(key) === "1";

    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // كما في `writeJson`.
  }

  return false;
}

type Resolution = Pick<SessionValue, "status" | "identity" | "user">;

const ANONYMOUS: Resolution = { status: "anonymous", identity: null, user: null };

/**
 * صاحب جلسة غير من سبقه على الجهاز: ما حُفظ لذاك لا يُعرض لهذا. يُمسح قبل
 * أن تُعلَن الجلسة، فلا تومض ورقة مجموعة ليست له.
 */
async function forget(queryClient: QueryClient) {
  queryClient.clear();
  await clearFieldData().catch(() => undefined);
}

async function adopt(next: AuthUser, queryClient: QueryClient) {
  const previous = readIdentity();

  if ((previous && previous.userId !== next.id) || readJson(LINK_KEY)) {
    await forget(queryClient);
  }

  // عضو الفريق يدخل بحسابه: رابط متطوع على الجهاز نفسه يُنسى، فصاحب واحد.
  writeJson(LINK_KEY, null);
  setLinkToken(null);

  const identity: StaffIdentity = {
    kind: "STAFF",
    ownerId: next.id,
    userId: next.id,
    fullNameAr: next.fullNameAr,
    email: next.email,
  };

  writeIdentity(identity);

  return { status: "authenticated", identity, user: next } satisfies Resolution;
}

/** المتطوع برابطه المحفوظ. صلاحه يُعرف عند أول قراءة لبطاقته. */
function withLink(link: StoredLink, status: "authenticated" | "offline") {
  setLinkToken(link.token);

  return { status, identity: participantOf(link), user: null } satisfies Resolution;
}

/**
 * يسأل الخادم عن الجلسة ويعيد ما يجب أن تكون عليه الحال. بلا حالة React
 * فيه: النتيجة قيمة يطبّقها المزوِّد، فيُستدعى عند الفتح وعند عودة الشبكة.
 */
async function resolveSession(queryClient: QueryClient): Promise<Resolution> {
  const link = readJson<StoredLink>(LINK_KEY);

  /**
   * متطوع لم يدخل هذا الجهازَ عضوُ فريق قط: لا جلسة تُسأل عنها، فلا يُرسَل
   * طلب تدوير يعود بـ401 مع كل فتح للبطاقة.
   */
  if (link && !readIdentity() && !flag(SIGNED_OUT_KEY)) {
    return withLink(link, navigator.onLine ? "authenticated" : "offline");
  }

  try {
    if (flag(SIGNED_OUT_KEY)) {
      await requestLogout();
      flag(SIGNED_OUT_KEY, false);

      return link ? withLink(link, "authenticated") : ANONYMOUS;
    }

    const session = await refreshSession();

    if (session) return await adopt(session.user, queryClient);

    // الخادم أجاب: لا جلسة. الهوية المحفوظة تبقى لتُقارَن بمن يدخل بعدها.
    return link ? withLink(link, "authenticated") : ANONYMOUS;
  } catch (error) {
    /**
     * الخادم لم يُسأل (انقطاع) أو سُئل فتعثّر (429، 5xx): في الحالين لم يقل
     * «لا جلسة»، فيُعمل بما على الجهاز ويُعاد السؤال عند عودة الشبكة.
     */
    const unanswered =
      error instanceof OfflineError || error instanceof FieldApiError;

    if (!unanswered) {
      // عطل لا نعرفه: صفحة الدخول أصدق من شاشة تحميل لا تنتهي.
      console.error("[field] تعذّر استئناف الجلسة:", error);

      return ANONYMOUS;
    }

    const known = flag(SIGNED_OUT_KEY) ? null : readIdentity();

    if (known) return { status: "offline", identity: known, user: null };

    return link ? withLink(link, "offline") : ANONYMOUS;
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

  /**
   * الخادم قال «لا جلسة» في منتصف العمل. ما في الطابور يبقى على الهاتف
   * باسم صاحبه ويُرسَل حين يدخل.
   *
   * رابط المتطوع الذي رُفض يُنسى: لن يصلح ثانية، وبقاؤه يعيد الرفض مع كل
   * فتح. وهوية عضو الفريق تبقى لتُقارَن بمن يدخل بعدها.
   */
  useEffect(
    () =>
      onSessionLost((kind) => {
        if (kind === "PARTICIPANT") {
          writeJson(LINK_KEY, null);
          setLinkToken(null);
        }

        apply(ANONYMOUS);
        notify(
          kind === "PARTICIPANT"
            ? "رابطك لم يعد صالحًا. اطلب رابطًا جديدًا من منسّق الحملة."
            : "انتهت جلستك. سجّل الدخول من جديد — ما سجّلته محفوظ على هذا الهاتف ويُرسَل بعد دخولك.",
          "danger",
        );
      }),
    [apply],
  );

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

  const redeem = useCallback(
    async (token: string) => {
      const opened = await redeemLink(token);
      const previous = readJson<StoredLink>(LINK_KEY);

      // بطاقة غير التي كانت على الجهاز: ما حُفظ لتلك لا يُعرض لهذه.
      if (previous?.participantId !== opened.participant.id) {
        await forget(queryClient);
      }

      const link: StoredLink = {
        token,
        participantId: opened.participant.id,
        fullNameAr: opened.participant.fullNameAr,
        initiativeNameAr: opened.initiative.nameAr,
        expiresAt: opened.expiresAt,
      };

      writeJson(LINK_KEY, link);
      apply(withLink(link, "authenticated"));
    },
    [apply, queryClient],
  );

  const logout = useCallback(async () => {
    const leaving = identity?.kind ?? "STAFF";

    try {
      /**
       * قبل الخروج والرمز ما زال صالحًا: هذا الجهاز لا يستقبل بعده إشعارًا
       * باسم من خرج. فشله لا يوقف الخروج — إلغاء المتصفح وحده يكفي ليزول
       * الاشتراك عند أول إرسال.
       */
      await disablePush().catch(() => undefined);

      // المتطوع لا جلسة له على الخادم: خروجه نسيان الرابط على هذا الجهاز.
      if (leaving === "STAFF") await requestLogout();
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;

      flag(SIGNED_OUT_KEY, true);
    } finally {
      clearAccessToken();
      setLinkToken(null);
      writeJson(LINK_KEY, null);

      if (leaving === "STAFF") writeIdentity(null);

      await forget(queryClient);
      setIdentity(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, [queryClient, identity]);

  const value = useMemo<SessionValue>(
    () => ({ status, identity, user, login, redeem, logout }),
    [status, identity, user, login, redeem, logout],
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

/** هل لصاحب الجلسة ما يُقرأ له — بشبكة أو من المحفوظ؟ */
export function useSessionKind() {
  const { status, identity } = useFieldSession();

  return status === "authenticated" || status === "offline"
    ? (identity?.kind ?? null)
    : null;
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
