import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type LookupCode = components["schemas"]["LookupCode"];
export type LookupRef = components["schemas"]["LookupRef"];
export type LookupValue = components["schemas"]["LookupValue"];
export type LookupList = components["schemas"]["LookupList"];
export type LookupListSummary = components["schemas"]["LookupListSummary"];

/**
 * مفاتيح مخزن الاستعلامات. كل قائمة منسدلة بالرمز نفسه تقرأ المفتاح نفسه،
 * فعشرة حقول «نوع الجهة» في صفحة طلب واحد، وقيمة يضيفها زر «+» في أحدها
 * تظهر في الباقي فورًا.
 *
 * كلها تحت `["lookups"]`، فإبطال البادئة بعد أي تعديل في الإعدادات يحدّث
 * القوائم والجداول والملخّص معًا. الرموز بأحرف كبيرة، فلا يصطدم بها
 * `summary` و`manage`.
 */
export const lookupKeys = {
  all: ["lookups"] as const,
  summary: ["lookups", "summary"] as const,
  options: (code: LookupCode) => ["lookups", code] as const,
  manage: (code: LookupCode) => ["lookups", code, "manage"] as const,
};

export function listLookups() {
  return apiFetch<{ data: LookupListSummary[] }>("/admin/lookups").then(
    (response) => response.data,
  );
}

export function getLookup(
  code: LookupCode,
  options: { includeInactive?: boolean; includeUsage?: boolean } = {},
) {
  const params = new URLSearchParams();

  if (options.includeInactive) params.set("includeInactive", "true");
  if (options.includeUsage) params.set("includeUsage", "true");

  const query = params.toString();

  return apiFetch<LookupList>(`/admin/lookups/${code}${query ? `?${query}` : ""}`);
}

export function updateLookupList(
  code: LookupCode,
  body: { nameAr?: string; descriptionAr?: string | null },
) {
  return apiFetch<LookupList>(`/admin/lookups/${code}`, { method: "PATCH", body });
}

export type LookupValueBody = {
  nameAr: string;
  code?: string;
  nameEn?: string;
  descriptionAr?: string;
};

export function createLookupValue(code: LookupCode, body: LookupValueBody) {
  return apiFetch<LookupValue>(`/admin/lookups/${code}/values`, {
    method: "POST",
    body,
  });
}

export function updateLookupValue(
  code: LookupCode,
  id: string,
  body: {
    nameAr?: string;
    nameEn?: string | null;
    descriptionAr?: string | null;
    isActive?: boolean;
  },
) {
  return apiFetch<LookupValue>(`/admin/lookups/${code}/values/${id}`, {
    method: "PATCH",
    body,
  });
}

export function reorderLookupValues(code: LookupCode, ids: string[]) {
  return apiFetch<LookupList>(`/admin/lookups/${code}/values/reorder`, {
    method: "POST",
    body: { ids },
  });
}

export function deleteLookupValue(code: LookupCode, id: string) {
  return apiFetch<void>(`/admin/lookups/${code}/values/${id}`, { method: "DELETE" });
}
