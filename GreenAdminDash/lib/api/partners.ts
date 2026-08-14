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
export type OrganizationKind = PartnerSummary["organizationKind"];
export type SupportForm = PartnerDetail["supportForms"][number];

/**
 * التسميات العربية للقيم المجمّدة تعيش في الواجهة لا في القاعدة.
 *
 * إضافة قيمة إلى enum في الخادم تعني تعديل هذه القوائم أيضًا — وهو
 * مقصود: القيمة عقد برمجي، ونصها العربي قرار تحريري.
 */
export const STAGE_LABELS: Record<PartnerStage, string> = {
  NEW: "جديدة",
  CONTACTED: "تم التواصل",
  QUALIFIED: "مؤهلة",
  NEGOTIATION: "تفاوض",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  ACTIVE: "نشطة",
  ON_HOLD: "معلّقة التفاوض",
  REJECTED: "مرفوضة",
  ENDED: "منتهية",
};

/** المراحل التي ينقلها مكتب العلاقات؛ الباقي قرارات لها مساراتها. */
export const PIPELINE_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "NEGOTIATION",
  "PENDING_APPROVAL",
  "ON_HOLD",
] as const satisfies readonly PartnerStage[];

export const ORGANIZATION_KIND_LABELS: Record<OrganizationKind, string> = {
  COMPANY: "شركة",
  NGO: "جمعية أو منظمة أهلية",
  GOVERNMENT: "جهة حكومية أو بلدية",
  ACADEMIC: "جهة أكاديمية",
  VOLUNTEER_TEAM: "فريق تطوعي",
  COMMUNITY_INITIATIVE: "مبادرة مجتمعية",
  DONOR: "جهة مانحة",
  INDIVIDUAL: "فرد",
  OTHER: "أخرى",
};

export const PARTNERSHIP_TYPE_LABELS: Record<PartnershipType, string> = {
  STRATEGIC: "شريك استراتيجي",
  EXECUTIVE: "شريك تنفيذي",
  TECHNICAL: "شريك تقني",
  MEDIA: "شريك إعلامي",
  EVENT: "شريك فعالية ونشاط",
};

export const PARTNERSHIP_STATUS_LABELS: Record<Partnership["status"], string> = {
  PROPOSED: "مقترحة",
  APPROVED: "معتمدة",
  PAUSED: "معلّقة",
  ENDED: "منتهية",
};

/** أشكال المشاركة والدعم السبعة كما وردت في الميثاق. */
export const SUPPORT_FORM_LABELS: Record<SupportForm, string> = {
  MORAL_MEDIA: "الدعم المعنوي والإعلامي",
  COMMUNITY_VOLUNTEERING: "المشاركة المجتمعية والتطوعية",
  SPONSORSHIP_LOGISTICS: "الرعاية أو الدعم اللوجستي",
  TECHNICAL_ACADEMIC_EXPERTISE: "تقديم الخبرات الفنية أو الأكاديمية",
  ENVIRONMENTAL_AWARENESS: "دعم الأنشطة البيئية والتوعوية",
  INTERNAL_SUSTAINABILITY: "تبني مبادرات استدامة داخل المؤسسة",
  SPACES_AND_RESOURCES: "توفير مساحات أو موارد",
};

export const ACKNOWLEDGEMENT_METHOD_LABELS = {
  IN_PERSON: "حضوريًا",
  EMAIL: "بالبريد الإلكتروني",
  PORTAL: "عبر البوابة",
  DOCUMENT: "بمستند موقّع",
} as const;

// ── نداءات الإدارة ─────────────────────────────────────────────────────

export function listPartners(filters: { stage?: string; q?: string } = {}) {
  const params = new URLSearchParams();

  if (filters.stage) params.set("stage", filters.stage);
  if (filters.q) params.set("q", filters.q);

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
  organizationKind: OrganizationKind;
  websiteUrl?: string;
  summaryAr?: string;
  supportForms: SupportForm[];
  internalNotesAr?: string;
}) {
  return apiFetch<PartnerDetail>("/admin/partners", {
    method: "POST",
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
    method: keyof typeof ACKNOWLEDGEMENT_METHOD_LABELS;
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

export function publishCharterVersion(id: string) {
  return apiFetch<CharterVersion>(`/admin/charter/versions/${id}/publish`, {
    method: "POST",
    body: {},
  });
}

// ── بوابة الشريك ───────────────────────────────────────────────────────

export function getMyOrganization() {
  return apiFetch<PartnerSelf>("/partner/me");
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
