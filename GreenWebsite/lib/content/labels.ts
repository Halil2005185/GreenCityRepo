import type { InitiativeStatus, SiteStatus } from "@/lib/api/types";

/**
 * الحالات وحدها ثابتة في الكود لأن الحراس في الباك‌اند يفحصونها؛ أما
 * أسماء المبادرات والمؤشرات والمناطق فتأتي من القاعدة. الترجمة هنا
 * عرض لا تعريف.
 */
export const INITIATIVE_STATUS_LABELS: Record<InitiativeStatus, string> = {
  DRAFT: "مسودة",
  PLANNING: "قيد التخطيط",
  ACTIVE: "جارية",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  PLANNED: "مخطَّط",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
};

/** نغمة الشارة تتبع الحالة: الجاري يُبرَز، والملغى يخفت. */
export const INITIATIVE_STATUS_TONES: Record<
  InitiativeStatus,
  "primary" | "success" | "muted"
> = {
  DRAFT: "muted",
  PLANNING: "muted",
  ACTIVE: "primary",
  COMPLETED: "success",
  CANCELLED: "muted",
};
