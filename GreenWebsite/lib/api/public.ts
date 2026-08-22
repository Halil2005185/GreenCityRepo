import type {
  PublicImpactSummary,
  PublicInitiative,
  PublicInitiativeSummary,
  PublicPartner,
  PublicProgram,
} from "./types";

/**
 * الموقع لا يملك جلسة ولا يرسل كوكي: كل قراءة تخرج من خادم Next إلى
 * الـAPI باسم الموقع نفسه، فلا سطح مصادقة على الواجهة العامة.
 *
 * ملاحظة انتقالية: مسارات `/api/public/*` غير موجودة في الباك‌اند بعد
 * (الموجود اليوم `/api/admin/*` خلف مصادقة). حتى تصدر، تُرجع كل دالة
 * هنا قيمة فارغة والصفحات تعرض حالة «لا بيانات» بدل أن تنهار. راجع
 * README للعقد المطلوب.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

/** المحتوى العام لا يتغير كل ثانية، ولا يجوز أن يتأخر يومًا عن الواقع. */
const REVALIDATE_SECONDS = 300;

async function getJson<T>(path: string): Promise<T | null> {
  const url = `${API_ORIGIN}/api/public${path}`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      console.warn(`[api] ${path} أعاد ${response.status}`);
      return null;
    }

    const body = (await response.json()) as { data: T };
    return body.data;
  } catch (error) {
    /**
     * انقطاع الـAPI يجب ألا يُسقط الموقع كله: صفحة «من نحن» وصفحة
     * الشراكة لا تعتمد عليه أصلًا، والصفحات التي تعتمد عليه تعرض حالة
     * فراغ. الخطأ يُسجَّل ولا يُبتلع صامتًا.
     */
    console.warn(`[api] تعذّر الوصول إلى ${url}:`, error);
    return null;
  }
}

export async function listPrograms(): Promise<PublicProgram[]> {
  return (await getJson<PublicProgram[]>("/programs")) ?? [];
}

export async function getProgram(slug: string): Promise<PublicProgram | null> {
  return getJson<PublicProgram>(`/programs/${encodeURIComponent(slug)}`);
}

export async function listInitiatives(options?: {
  programSlug?: string;
  limit?: number;
}): Promise<PublicInitiativeSummary[]> {
  const query = new URLSearchParams();
  if (options?.programSlug) query.set("program", options.programSlug);
  if (options?.limit) query.set("limit", String(options.limit));

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return (await getJson<PublicInitiativeSummary[]>(`/initiatives${suffix}`)) ?? [];
}

export async function getInitiative(
  slug: string,
): Promise<PublicInitiative | null> {
  return getJson<PublicInitiative>(`/initiatives/${encodeURIComponent(slug)}`);
}

export async function getImpactSummary(): Promise<PublicImpactSummary | null> {
  return getJson<PublicImpactSummary>("/impact/summary");
}

/** الشركاء الذين وافقوا صراحة على إظهار الاسم والشعار وحدهم. */
export async function listPartners(): Promise<PublicPartner[]> {
  return (await getJson<PublicPartner[]>("/partners")) ?? [];
}
