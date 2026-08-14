import type { components } from "./types.gen";

export type Problem = components["schemas"]["Problem"];

/**
 * خطأ يحمل استجابة `application/problem+json` كما أرسلها الخادم، فتستطيع
 * الواجهة أن تتفرع على `code` بدل مطابقة نص الرسالة.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly problem?: Problem,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** أخطاء التحقق تعود بمصفوفة مواضع لربطها بحقول النموذج. */
  get fieldIssues() {
    const details = this.problem?.details;

    if (!Array.isArray(details)) return [];

    return details.filter(
      (issue): issue is { path: string; message: string; in: string } =>
        typeof issue === "object" &&
        issue !== null &&
        "path" in issue &&
        "message" in issue,
    );
  }
}

/**
 * رمز الوصول يعيش في الذاكرة وحدها.
 *
 * `localStorage` يجعله متاحًا لأي سكربت يُحقن في الصفحة؛ والذاكرة تعني
 * أن إغلاق التبويب يفقده، وهو مقبول لأن كوكي التحديث httpOnly يعيد
 * إصداره صامتًا عند فتح التبويب من جديد.
 */
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

export function setAccessToken(token: string, expiresInSeconds: number) {
  accessToken = token;
  // هامش عشر ثوانٍ يمنع إرسال رمز ينتهي أثناء عبور الطلب للشبكة.
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

type SessionResponse = components["schemas"]["SessionResponse"];

/**
 * طلب تدوير واحد مهما تزامنت عليه الطلبات.
 *
 * بدون هذا التجميع تُطلق خمسة طلبات متوازية خمس عمليات تدوير، فيُبطل كل
 * تدوير رمز سابقه ويُفسَّر ذلك على الخادم بأنه إعادة استعمال — أي سرقة —
 * فتسقط عائلة الجلسة كاملة ويُطرد المستخدم بلا سبب.
 */
let refreshInFlight: Promise<SessionResponse | null> | null = null;

async function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) return null;

      const session = (await response.json()) as SessionResponse;

      setAccessToken(session.accessToken, session.expiresInSeconds);

      return session;
    } catch {
      return null;
    } finally {
      // يُفرَّغ بعد دورة الحدث حتى يلتقط المتزامنون النتيجة نفسها.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

export { refreshSession };

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** يمنع محاولة التدوير — يُستعمل في مسارات المصادقة نفسها. */
  skipRefresh?: boolean;
};

async function toApiError(response: Response) {
  let problem: Problem | undefined;

  try {
    problem = (await response.json()) as Problem;
  } catch {
    problem = undefined;
  }

  return new ApiError(
    problem?.detail ?? "تعذّر إتمام الطلب. حاول مرة أخرى.",
    response.status,
    problem?.title ?? "REQUEST_FAILED",
    problem,
  );
}

/**
 * كل النداءات على الأصل نفسه (`/api/...`): محليًا عبر rewrite في
 * `next.config.ts` وفي الإنتاج عبر Nginx. هذا شرط عمل كوكي
 * `SameSite=Strict`، ويعني ألا يظهر عنوان الـAPI في المتصفح أصلًا.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const send = async (token: string | null) => {
    const headers: Record<string, string> = {};

    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (token) headers["authorization"] = `Bearer ${token}`;

    return fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  };

  let response = await send(currentAccessToken());

  /**
   * 401 وحده يستدعي التدوير. 403 يعني «مصادق لكن بلا صلاحية»، وتدوير
   * الجلسة لن يمنحه قدرة جديدة — إعادة المحاولة عليه حلقة عبثية.
   */
  if (response.status === 401 && !options.skipRefresh) {
    const session = await refreshSession();

    if (session) {
      response = await send(session.accessToken);
    }
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
