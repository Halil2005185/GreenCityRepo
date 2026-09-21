import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type Program = components["schemas"]["Program"];
export type Metric = components["schemas"]["Metric"];
export type Area = components["schemas"]["Area"];
export type InitiativeSummary = components["schemas"]["InitiativeSummary"];
export type InitiativeDetail = components["schemas"]["InitiativeDetail"];
export type InitiativeRollup = components["schemas"]["InitiativeRollup"];

export type InitiativeStatus = InitiativeSummary["status"];
export type TargetRollup = Program["defaultTargetRollup"];
export type SiteStatus = InitiativeDetail["sites"][number]["status"];

/**
 * التسميات العربية للقيم المجمّدة تعيش هنا لا في القاعدة.
 *
 * أما أسماء البرامج والمؤشرات والمناطق فتأتي من الـAPI: تلك بيانات
 * يحرّرها الفريق، وكتابتها هنا تعيد النظام إلى ما بُني ليتجاوزه.
 */
export const INITIATIVE_STATUS_LABELS: Record<InitiativeStatus, string> = {
  DRAFT: "مسودة",
  PLANNING: "تخطيط",
  ACTIVE: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  PLANNED: "مخطط",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
};

export const AREA_LEVEL_LABELS: Record<Area["level"], string> = {
  GOVERNORATE: "محافظة",
  CITY: "مدينة",
  DISTRICT: "منطقة",
  NEIGHBORHOOD: "حي",
};

export const ROLLUP_LABELS: Record<TargetRollup, string> = {
  STRICT: "صارمة — تمنع بدء التنفيذ عند اختلاف المجموع",
  ADVISORY: "إرشادية — تنبّه ولا تمنع",
  NONE: "بلا مطابقة",
};

export const ROLLUP_SHORT: Record<TargetRollup, string> = {
  STRICT: "صارمة",
  ADVISORY: "إرشادية",
  NONE: "بلا مطابقة",
};

export const WORK_STATUS_LABELS = {
  TODO: "لم تبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  BLOCKED: "محجوبة",
  IN_REVIEW: "بانتظار الاعتماد",
  DONE: "منجزة",
  CANCELLED: "ملغاة",
} as const;

export const MILESTONE_STATUS_LABELS = {
  PENDING: "لم تبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  DONE: "مكتملة",
  CANCELLED: "ملغاة",
} as const;

export const PRIORITY_LABELS = {
  LOW: "منخفضة",
  NORMAL: "عادية",
  HIGH: "عالية",
  URGENT: "عاجلة",
} as const;

// ── المرجعيات ──────────────────────────────────────────────────────────

export function listPrograms() {
  return apiFetch<{ data: Program[] }>("/admin/programs").then((r) => r.data);
}

export function createProgram(body: {
  slug: string;
  nameAr: string;
  descriptionAr?: string;
  defaultTargetRollup: TargetRollup;
}) {
  return apiFetch<Program>("/admin/programs", { method: "POST", body });
}

export function listMetrics() {
  return apiFetch<{ data: Metric[] }>("/admin/metrics").then((r) => r.data);
}

export function createMetric(body: {
  slug: string;
  nameAr: string;
  unitAr: string;
  aggregation: Metric["aggregation"];
  decimals: number;
}) {
  return apiFetch<Metric>("/admin/metrics", { method: "POST", body });
}

export function listAreas(level?: string) {
  const query = level ? `?level=${level}` : "";
  return apiFetch<{ data: Area[] }>(`/admin/areas${query}`).then((r) => r.data);
}

/** بحث في المناطق كلها بالاسم — للقوائم التي لا تُحمَّل كاملة. */
export function searchAreas(q: string, signal?: AbortSignal) {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch<{ data: Area[] }>(`/admin/areas${query}`, { signal }).then((r) => r.data);
}

// ── المبادرات ──────────────────────────────────────────────────────────

export function listInitiatives(
  filters: { programId?: string; status?: string; q?: string } = {},
) {
  const params = new URLSearchParams();
  if (filters.programId) params.set("programId", filters.programId);
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return apiFetch<{ data: InitiativeSummary[] }>(
    `/admin/initiatives${query ? `?${query}` : ""}`,
  ).then((r) => r.data);
}

export function getInitiative(id: string) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}`);
}

export function createInitiative(body: {
  programId: string;
  nameAr: string;
  summaryAr?: string;
  season?: string;
  startsAt?: string;
  endsAt?: string;
  targetRollup?: TargetRollup;
}) {
  return apiFetch<InitiativeDetail>("/admin/initiatives", { method: "POST", body });
}

/** تحرير محتوى صفحة المبادرة وحده — لا الحالة ولا البرنامج ولا الأهداف. */
export function updateInitiativeStory(
  id: string,
  body: { storyAr?: string; coverImageUrl?: string },
) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}`, {
    method: "PATCH",
    body,
  });
}

/**
 * بيانات المبادرة التشغيلية. `null` يمسح الحقل و`undefined` يتركه.
 * المسار نفسه لتحرير القصة؛ الفصل في الواجهة لا في العقد.
 */
export function updateInitiative(
  id: string,
  body: {
    nameAr?: string;
    summaryAr?: string | null;
    season?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    targetRollup?: TargetRollup;
  },
) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}`, {
    method: "PATCH",
    body,
  });
}

export function addInitiativeArea(id: string, areaId: string) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/areas`, {
    method: "POST",
    body: { areaId },
  });
}

/** يحذف ربط المنطقة بالمبادرة لا المنطقة نفسها؛ المعامل معرّف المنطقة. */
export function removeInitiativeArea(id: string, areaId: string) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/areas/${areaId}`, {
    method: "DELETE",
  });
}

/** الإحداثيات كلاهما أو لا شيء؛ بدونها لا يظهر الموقع على الخريطة. */
export function addSite(
  id: string,
  body: { nameAr: string; areaId?: string; descriptionAr?: string; lat?: number; lng?: number },
) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/sites`, {
    method: "POST",
    body,
  });
}

export function updateSite(
  id: string,
  siteId: string,
  body: {
    status?: SiteStatus;
    nameAr?: string;
    areaId?: string | null;
    descriptionAr?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/sites/${siteId}`, {
    method: "PATCH",
    body,
  });
}

export function setInitiativeTarget(id: string, metricId: string, value: number) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/targets`, {
    method: "PUT",
    body: { metricId, value },
  });
}

export function setSiteTarget(
  id: string,
  siteId: string,
  metricId: string,
  value: number,
) {
  return apiFetch<InitiativeDetail>(
    `/admin/initiatives/${id}/sites/${siteId}/targets`,
    { method: "PUT", body: { metricId, value } },
  );
}

export function launchInitiative(id: string) {
  return apiFetch<InitiativeDetail & { warnings: InitiativeRollup["metrics"] }>(
    `/admin/initiatives/${id}/launch`,
    { method: "POST" },
  );
}

/**
 * الإلغاء لا الحذف: يُبقي سجل المبادرة ويُخرجها من الخريطة والمجاميع.
 * هو الباب الوحيد لما أُطلق أو تراكم عليه عمل.
 */
export function cancelInitiative(id: string) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/cancel`, {
    method: "POST",
  });
}

/**
 * الحذف للمسودة وحدها. الخادم يرفض ما أُطلق أو حمل أثرًا أو تحرّكت مهامه،
 * فالشرط هنا لإخفاء الزر لا لحراسته.
 */
export function deleteInitiative(id: string) {
  return apiFetch<void>(`/admin/initiatives/${id}`, { method: "DELETE" });
}

export function completeInitiative(id: string) {
  return apiFetch<InitiativeDetail>(`/admin/initiatives/${id}/complete`, {
    method: "POST",
  });
}

// ── الأثر ──────────────────────────────────────────────────────────────

export function recordImpact(body: {
  metricId: string;
  initiativeId?: string;
  siteId?: string;
  value: number;
  occurredAt?: string;
  noteAr?: string;
}) {
  return apiFetch<{ id: string }>("/admin/impact/entries", {
    method: "POST",
    body,
  });
}

export function verifyImpact(entryId: string) {
  return apiFetch<{ id: string }>(`/admin/impact/entries/${entryId}/verify`, {
    method: "POST",
  });
}

// ── العمل ──────────────────────────────────────────────────────────────

export function changeTaskStatus(
  taskId: string,
  status: keyof typeof WORK_STATUS_LABELS,
  blockedReasonAr?: string,
) {
  return apiFetch(`/admin/work/tasks/${taskId}/status`, {
    method: "POST",
    body: blockedReasonAr ? { status, blockedReasonAr } : { status },
  });
}
