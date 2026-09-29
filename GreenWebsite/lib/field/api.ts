import type { components } from "@/lib/api/types.gen";

import { FIELD_API_ORIGIN } from "./config";

export type Problem = components["schemas"]["Problem"];
export type SessionResponse = components["schemas"]["SessionResponse"];
export type AuthUser = components["schemas"]["AuthUser"];
export type FieldHome = components["schemas"]["FieldHome"];
export type FieldGroupCard = components["schemas"]["FieldGroupCard"];
export type FieldSheet = components["schemas"]["FieldSheet"];
export type FieldTask = components["schemas"]["FieldTask"];
export type FieldTarget = components["schemas"]["FieldTarget"];

/**
 * رفضٌ من الخادم، بجسمه كما أرسله (`application/problem+json`). الواجهة
 * تتفرع على `status` و`code` لا على نص الرسالة.
 */
export class FieldApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly problem?: Problem,
  ) {
    super(message);
    this.name = "FieldApiError";
  }
}

/**
 * الطلب لم يصل الخادم أصلًا: لا شبكة، أو انقطعت قبل الجواب.
 *
 * نوع مستقل لأن معناه عكس معنى الرفض: الرفض جوابٌ يُعرض، وهذا «لم نسأل
 * بعد» — ما كُتب يبقى في الطابور، وما قُرئ يبقى من المحفوظ.
 */
export class OfflineError extends Error {
  constructor() {
    super("لا اتصال بالشبكة الآن.");
    this.name = "OfflineError";
  }
}

/**
 * رمز الوصول في الذاكرة وحدها، كما في اللوحة: `localStorage` يجعله متاحًا
 * لأي سكربت يُحقن في الصفحة، وكوكي التحديث httpOnly تعيد إصداره عند الفتح.
 */
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

export function setAccessToken(token: string, expiresInSeconds: number) {
  accessToken = token;
  // هامش عشر ثوانٍ يمنع إرسال رمز ينتهي أثناء عبور الطلب لشبكة بطيئة.
  accessTokenExpiresAt = Date.now() + (expiresInSeconds - 10) * 1000;
}

export function clearAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
}

function currentAccessToken() {
  if (!accessToken || Date.now() >= accessTokenExpiresAt) return null;

  return accessToken;
}

/** شبكة الميدان بطيئة لا معدومة؛ بعد هذا الحد يُعامَل الطلب كأنه لم يصل. */
const REQUEST_TIMEOUT_MS = 20_000;

type SendOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  /** كوكي التحديث محصورة بمسار `/api/auth`، فلا تُرسَل مع غيره. */
  withCookies?: boolean;
  signal?: AbortSignal;
};

/**
 * مهلة تُلغى بإلغاء المستدعي أيضًا. باليد لا بـ`AbortSignal.any`: تلك غير
 * موجودة قبل iOS 17.4، وأقل ما ندعمه 16.4.
 */
function withTimeout(parent: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);

  if (parent?.aborted) abort();
  parent?.addEventListener("abort", abort, { once: true });

  return {
    signal: controller.signal,
    release() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

async function send(path: string, options: SendOptions) {
  const headers: Record<string, string> = { accept: "application/json" };

  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers["authorization"] = `Bearer ${options.token}`;

  const timeout = withTimeout(options.signal, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${FIELD_API_ORIGIN}/api${path}`, {
      method: options.method ?? "GET",
      headers,
      credentials: options.withCookies ? "include" : "omit",
      signal: timeout.signal,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    // إلغاءٌ طلبه المستدعي ليس انقطاعًا، فيعود إليه كما هو.
    if (options.signal?.aborted) throw error;

    throw new OfflineError();
  } finally {
    timeout.release();
  }
}

async function toApiError(response: Response) {
  let problem: Problem | undefined;

  try {
    problem = (await response.json()) as Problem;
  } catch {
    problem = undefined;
  }

  return new FieldApiError(
    problem?.detail ?? "تعذّر إتمام الطلب. حاول مرة أخرى.",
    response.status,
    problem?.title ?? "REQUEST_FAILED",
    problem,
  );
}

/**
 * طلب تدوير واحد مهما تزامنت عليه الطلبات: تدويران متوازيان يُبطل ثانيهما
 * رمز الأول، فيقرؤه الخادم إعادة استعمال — أي سرقة — ويُسقط الجلسة كلها.
 *
 * يعيد `null` حين يرفض الخادم (لا جلسة)، ويرمي `OfflineError` حين لا يصل
 * الطلب: الأول يعني «سجّل الدخول»، والثاني «اعمل بما على الجهاز».
 */
let refreshInFlight: Promise<SessionResponse | null> | null = null;

export function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await send("/auth/refresh", {
        method: "POST",
        withCookies: true,
      });

      if (!response.ok) return null;

      const session = (await response.json()) as SessionResponse;

      setAccessToken(session.accessToken, session.expiresInSeconds);

      return session;
    } finally {
      // يُفرَّغ بعد دورة الحدث حتى يلتقط المتزامنون النتيجة نفسها.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

export async function login(email: string, password: string) {
  const response = await send("/auth/login", {
    method: "POST",
    body: { email, password },
    withCookies: true,
  });

  if (!response.ok) throw await toApiError(response);

  const session = (await response.json()) as SessionResponse;

  setAccessToken(session.accessToken, session.expiresInSeconds);

  return session;
}

export async function logout() {
  clearAccessToken();

  const response = await send("/auth/logout", {
    method: "POST",
    withCookies: true,
  });

  if (!response.ok && response.status !== 401) throw await toApiError(response);
}

type RequestOptions = Pick<SendOptions, "method" | "body" | "signal">;

export async function fieldFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let token = currentAccessToken();

  // رمز منتهٍ معروف سلفًا: تدويره قبل الطلب يوفّر ذهابًا وإيابًا يعود بـ401.
  if (!token) token = (await refreshSession())?.accessToken ?? null;

  let response = await send(path, { ...options, token });

  /**
   * 401 وحده يستدعي التدوير. 403 يعني «مصادق بلا صلاحية»، والتدوير لا
   * يمنح قدرة جديدة.
   */
  if (response.status === 401) {
    const session = await refreshSession();

    if (session) {
      response = await send(path, { ...options, token: session.accessToken });
    }
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export function getFieldHome(signal?: AbortSignal) {
  return fieldFetch<FieldHome>("/field/me", { ...(signal ? { signal } : {}) });
}

export function getFieldSheet(groupId: string, signal?: AbortSignal) {
  return fieldFetch<FieldSheet>(`/field/groups/${groupId}`, {
    ...(signal ? { signal } : {}),
  });
}
