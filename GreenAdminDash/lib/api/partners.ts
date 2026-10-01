import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type PartnerSummary = components["schemas"]["PartnerSummary"];
export type PartnerDetail = components["schemas"]["PartnerDetail"];
export type Partnership = components["schemas"]["Partnership"];
export type PartnerContact = components["schemas"]["PartnerContact"];
export type CharterVersion = components["schemas"]["CharterVersion"];
export type PartnerSelf = components["schemas"]["PartnerSelf"];

export type PartnerStage = PartnerSummary["stage"];
export type PartnershipType = Partnership["type"];

/** المراحل التي ينقلها مكتب العلاقات؛ الباقي قرارات لها مساراتها. */
export const PIPELINE_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "NEGOTIATION",
  "PENDING_APPROVAL",
  "ON_HOLD",
] as const satisfies readonly PartnerStage[];

/**
 * التسميات العربية للقيم المجمّدة تعيش في الواجهة لا في القاعدة، والحالات
 * منها (المرحلة، حالة الشراكة) في `lib/status.ts` مع ألوانها.
 *
 * أنواع الشراكة وحدها هنا: نص الميثاق، والخادم يتفرّع عليها. نوع الجهة
 * وأشكال الدعم وطريقة الإقرار صارت تعريفات نظام تأتي بأسمائها من القاعدة.
 */
export const PARTNERSHIP_TYPE_LABELS: Record<PartnershipType, string> = {
  STRATEGIC: "شريك استراتيجي",
  EXECUTIVE: "شريك تنفيذي",
  TECHNICAL: "شريك تقني",
  MEDIA: "شريك إعلامي",
  EVENT: "شريك فعالية ونشاط",
};

// ── نداءات الإدارة ─────────────────────────────────────────────────────

export type PartnerFilters = {
  stage?: string;
  q?: string;
  contactPriorityId?: string;
  engagementHorizonId?: string;
  relationshipTypeId?: string;
  channelId?: string;
  staleDays?: number;
};

export function listPartners(filters: PartnerFilters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;

    params.set(key, String(value));
  }

  const query = params.toString();

  return apiFetch<{ data: PartnerSummary[] }>(
    `/admin/partners${query ? `?${query}` : ""}`,
  ).then((response) => response.data);
}

export function getPartner(id: string) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}`);
}

export function createPartner(body: {
  legalNameAr: string;
  displayNameAr?: string;
  organizationKindId: string;
  websiteUrl?: string;
  summaryAr?: string;
  supportFormIds: string[];
  internalNotesAr?: string;
  contactPriorityId?: string;
  engagementHorizonId?: string;
  relationshipTypeId?: string;
  mediaChannelIds?: string[];
}) {
  return apiFetch<PartnerDetail>("/admin/partners", {
    method: "POST",
    body,
  });
}

/** `null` يمسح الحقل و`undefined` يتركه، فالجسم غير مقيّد بنوع صارم. */
export function updatePartner(id: string, body: Record<string, unknown>) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}`, {
    method: "PATCH",
    body,
  });
}

export function changeStage(id: string, stage: string, noteAr?: string) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/stage`, {
    method: "POST",
    body: noteAr ? { stage, noteAr } : { stage },
  });
}

export function addContact(
  id: string,
  body: {
    fullNameAr: string;
    jobTitleAr?: string;
    email?: string;
    phone?: string;
    isPrimary: boolean;
  },
) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/contacts`, {
    method: "POST",
    body,
  });
}

export function addPartnership(id: string, type: PartnershipType) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/partnerships`, {
    method: "POST",
    body: { type },
  });
}

export function updatePartnership(
  id: string,
  partnershipId: string,
  status: "APPROVED" | "PAUSED" | "ENDED",
) {
  return apiFetch<PartnerDetail>(
    `/admin/partners/${id}/partnerships/${partnershipId}`,
    { method: "PATCH", body: { status } },
  );
}

export function recordConsent(
  id: string,
  consentType: "PUBLIC_NAME" | "PUBLIC_LOGO",
  action: "GRANTED" | "REVOKED",
) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/consent`, {
    method: "POST",
    body: { consentType, action },
  });
}

export function recordAcknowledgement(
  id: string,
  body: {
    methodId: string;
    acknowledgedByNameAr: string;
    acknowledgedByTitleAr?: string;
    noteAr?: string;
  },
) {
  return apiFetch<PartnerDetail>(
    `/admin/partners/${id}/charter-acknowledgements`,
    { method: "POST", body },
  );
}

export function activatePartner(id: string) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/activate`, {
    method: "POST",
  });
}

export function suspendPartner(id: string, suspensionReasonAr: string) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/suspend`, {
    method: "POST",
    body: { suspensionReasonAr },
  });
}

export function restorePartner(id: string) {
  return apiFetch<PartnerDetail>(`/admin/partners/${id}/restore`, {
    method: "POST",
  });
}

// ── الميثاق ────────────────────────────────────────────────────────────

export function listCharterVersions() {
  return apiFetch<{ data: CharterVersion[] }>("/admin/charter/versions").then(
    (response) => response.data,
  );
}

export function createCharterVersion(body: {
  version: string;
  titleAr: string;
  summaryAr?: string;
  bodyAr: string;
  principlesAr: string[];
  commitmentsAr: string[];
}) {
  return apiFetch<CharterVersion>("/admin/charter/versions", {
    method: "POST",
    body,
  });
}

/** بلا تاريخ يسري الإصدار فور النشر؛ التاريخ يؤجّل سريانه أو يسنده. */
export function publishCharterVersion(id: string, effectiveFrom?: string) {
  return apiFetch<CharterVersion>(`/admin/charter/versions/${id}/publish`, {
    method: "POST",
    body: effectiveFrom ? { effectiveFrom } : {},
  });
}

// ── بوابة الشريك ───────────────────────────────────────────────────────

export type PartnerFieldTeam = components["schemas"]["PartnerFieldTeam"];

/** فرق الجهة في الميدان بأعدادها — لا أسماء ولا وسائل تواصل. */
export function getMyFieldTeams() {
  return apiFetch<{ data: PartnerFieldTeam[] }>("/partner/me/field-teams").then(
    (response) => response.data,
  );
}

export function getMyOrganization() {
  return apiFetch<PartnerSelf>("/partner/me");
}

/** تحرير ممثل الجهة لملفها العلني — المسار قائم في الـAPI ولم تكن له واجهة. */
export function updateMyOrganization(body: {
  displayNameAr?: string;
  nameEn?: string;
  websiteUrl?: string;
  summaryAr?: string;
}) {
  return apiFetch<PartnerSelf>("/partner/me", { method: "PATCH", body });
}

export function updateMyDisplayConsent(body: {
  publicNameConsent?: boolean;
  publicLogoConsent?: boolean;
}) {
  return apiFetch<PartnerSelf>("/partner/me/display-consent", {
    method: "PATCH",
    body,
  });
}
