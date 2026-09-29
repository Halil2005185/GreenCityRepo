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
export type FieldCard = components["schemas"]["FieldCard"];
export type FieldCardMembership = components["schemas"]["FieldCardMembership"];
export type FieldRedeemedLink = components["schemas"]["FieldRedeemedLink"];
export type FieldAnnouncement = components["schemas"]["FieldAnnouncement"];
export type FieldPushKey = components["schemas"]["FieldPushKey"];
export type FieldRecord = components["schemas"]["FieldRecord"];
export type FieldCertificate = components["schemas"]["FieldCertificate"];

/** من يُنادى باسمه: عضو فريق بجلسته، أو متطوع برابطه الشخصي. */
export type SessionKind = "STAFF" | "PARTICIPANT";

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
  sessionKnownLost = false;
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

/**
 * رمز الرابط الشخصي. المتطوع لا جلسة له تُدوَّر: رمزه يُرسَل كما هو مع كل
 * طلب، وصلاحه يقرره الخادم. يضعه مزوّد الجلسة حين يُعرف صاحب الجهاز.
 */
let linkToken: string | null = null;

export function setLinkToken(token: string | null) {
  linkToken = token;

  if (token) sessionKnownLost = false;
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
 * من يُبلَّغ حين يقول الخادم «لا جلسة» لطلبٍ من تطبيق يظنّ أن له جلسة:
 * انتهت مدتها، أو أُبطلت من اللوحة، أو دوّرها تبويب آخر. بلا هذا البلاغ يبقى
 * التطبيق يعرض صاحبه داخلًا وطابوره واقفًا بلا سبب يُقرأ.
 */
const sessionLostListeners = new Set<(kind: SessionKind) => void>();

/** طلبات متزامنة تكتشف الخروج معًا؛ يُبلَّغ به مرة حتى الدخول التالي. */
let sessionKnownLost = false;

export function onSessionLost(listener: (kind: SessionKind) => void) {
  sessionLostListeners.add(listener);

  return () => {
    sessionLostListeners.delete(listener);
  };
}

/**
 * طلب تدوير واحد مهما تزامنت عليه الطلبات: تدويران متوازيان يُبطل ثانيهما
 * رمز الأول، فيقرؤه الخادم إعادة استعمال — أي سرقة — ويُسقط الجلسة كلها.
 *
 * ثلاثة أجوبة بثلاثة معانٍ: `null` حين يقول الخادم «لا جلسة» (401) فيلزم
 * الدخول؛ و`OfflineError` حين لا يصل الطلب فيُعمل بما على الجهاز؛
 * و`FieldApiError` حين يتعثّر الخادم نفسه (429، 5xx) — عطل عابر لا يُخرج
 * أحدًا من جلسته.
 */
let refreshInFlight: Promise<SessionResponse | null> | null = null;

export function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await send("/auth/refresh", {
        method: "POST",
        withCookies: true,
      });

      if (response.status === 401) return null;
      if (!response.ok) throw await toApiError(response);

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

function announceSessionLost(kind: SessionKind) {
  if (sessionKnownLost) return;

  sessionKnownLost = true;
  for (const listener of sessionLostListeners) listener(kind);
}

async function finish<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export async function fieldFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // المتطوع: رمز واحد لا يُدوَّر. 401 تعني أن رابطه انتهى أو أُبطل.
  if (linkToken) {
    const response = await send(path, { ...options, token: linkToken });

    if (response.status === 401) announceSessionLost("PARTICIPANT");

    return finish<T>(response);
  }

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
    } else {
      clearAccessToken();
      announceSessionLost("STAFF");
    }
  }

  return finish<T>(response);
}

/**
 * فتح رابط شخصي. بلا ترويسة مصادقة: الرمز هو الاعتماد، ويُرسَل في جسم
 * الطلب فلا يُكتب في سجل وصول.
 */
export async function redeemLink(token: string) {
  const response = await send("/field/links/redeem", {
    method: "POST",
    body: { token },
  });

  return finish<FieldRedeemedLink>(response);
}

/** الصورة أثقل من طلب، وشبكة الميدان أبطأ من أن تُمهَل عشرين ثانية. */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * يرفع الصورة إلى التخزين مباشرة بالرابط الموقّع؛ لا تمرّ بالخادم.
 *
 * فشل الاتصال هنا ليس «بلا شبكة»: طلب التوقيع سبقه بلحظة ونجح. فهو عطل
 * في الوصول إلى التخزين — رابط انتهى عمره، أو سياسة CORS على السطل لا
 * تذكر أصل الموقع — ويُعاد، ثم يُعرض على صاحبه إن تكرر.
 */
export async function uploadPhoto(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
) {
  const timeout = withTimeout(undefined, UPLOAD_TIMEOUT_MS);

  const failed = (status: number) =>
    new FieldApiError(
      "تعذّر رفع الصورة إلى التخزين. تُعاد المحاولة.",
      status,
      "UPLOAD_FAILED",
    );

  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: blob,
      signal: timeout.signal,
    });

    if (!response.ok) throw failed(response.status);
  } catch (error) {
    if (error instanceof FieldApiError) throw error;
    if (!navigator.onLine) throw new OfflineError();

    throw failed(0);
  } finally {
    timeout.release();
  }
}

/**
 * `/field/me` جوابه يتبع من يسأل. كل قراءة هنا تتحقق من `kind`: ورقة
 * مجموعات لا تُقرأ بطاقةً ولا العكس، لو تبدّل صاحب الجهاز بين طلب وجوابه.
 */
async function getMe<Kind extends SessionKind>(
  kind: Kind,
  signal?: AbortSignal,
) {
  const me = await fieldFetch<FieldHome | FieldCard>("/field/me", {
    ...(signal ? { signal } : {}),
  });

  if (me.kind !== kind) {
    throw new FieldApiError(
      "تبدّل صاحب الجلسة على هذا الجهاز. أعد فتح التطبيق.",
      409,
      "SESSION_CHANGED",
    );
  }

  return me as Extract<FieldHome | FieldCard, { kind: Kind }>;
}

export function getFieldHome(signal?: AbortSignal) {
  return getMe("STAFF", signal);
}

export function getFieldCard(signal?: AbortSignal) {
  return getMe("PARTICIPANT", signal);
}

export function getFieldRecord(signal?: AbortSignal) {
  return fieldFetch<FieldRecord>("/field/me/record", {
    ...(signal ? { signal } : {}),
  });
}

/**
 * شهادة المتطوع في حملة رابطه. طلب كتابة يُقرأ به: الخادم يصدرها عند أول
 * طلب ويعيدها هي نفسها بعده، فتكراره لا يغيّر شيئًا.
 */
export function issueFieldCertificate(signal?: AbortSignal) {
  return fieldFetch<FieldCertificate>("/field/me/certificate", {
    method: "POST",
    ...(signal ? { signal } : {}),
  });
}

export function getFieldSheet(groupId: string, signal?: AbortSignal) {
  return fieldFetch<FieldSheet>(`/field/groups/${groupId}`, {
    ...(signal ? { signal } : {}),
  });
}
