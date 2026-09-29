import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type Role = components["schemas"]["Role"];
export type CapabilityDefinition = components["schemas"]["CapabilityDefinition"];

/**
 * كتالوج القدرات ثابت في كود الخادم، فيُخزَّن طويلًا: شاشة الأدوار ونافذة
 * التخصيص تبنيان قوائمهما منه بدل تكرار الأسماء في الواجهة.
 */
export function listCapabilities() {
  return apiFetch<{ data: CapabilityDefinition[] }>("/admin/capabilities").then(
    (response) => response.data.filter((capability) => capability.scope === "STAFF"),
  );
}

export type RoleInput = {
  nameAr: string;
  descriptionAr?: string | null;
  officeId?: string | null;
  capabilities: string[];
};

/** `roles.manage`. كل قدرة في الحزمة يجب أن يحملها المنفّذ. */
export function createRole(input: RoleInput) {
  return apiFetch<{ data: { id: string } }>("/admin/roles", {
    method: "POST",
    body: input,
  });
}

/** يغيّر صلاحيات كل من يحمل الدور، ويجعل المزامنة تتركه كما هو. */
export function updateRole(id: string, input: Partial<RoleInput>) {
  return apiFetch<{ data: { id: string } }>(`/admin/roles/${id}`, {
    method: "PATCH",
    body: input,
  });
}

/** دور غير نظامي لم يُسنَد قط؛ غيره يُرفض بـ409 أو 422. */
export function deleteRole(id: string) {
  return apiFetch<void>(`/admin/roles/${id}`, { method: "DELETE" });
}

/** أسماء مجموعات الكتالوج كما تُعرض فوق كل مجموعة. */
export const CAPABILITY_GROUP_LABELS: Record<string, string> = {
  access: "إدارة الوصول",
  partners: "الشركاء",
  media: "الشبكة الإعلامية",
  charter: "الميثاق",
  operations: "التشغيل",
  field: "الميدان",
  contributions: "المساهمات",
  impact: "الأثر والمؤشرات",
  documents: "المستندات والملفات",
  reports: "التقارير",
  forms: "الاستمارات",
  system: "النظام",
};
