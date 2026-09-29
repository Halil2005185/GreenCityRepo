import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type InitiativeField = components["schemas"]["InitiativeField"];
export type FieldGroup = components["schemas"]["FieldGroup"];
export type FieldLeadCandidate = components["schemas"]["FieldLeadCandidate"];
export type FieldPartnerOption = components["schemas"]["FieldPartnerOption"];
export type FieldGroupMember = components["schemas"]["FieldGroupMember"];
export type FieldGroupMembers = components["schemas"]["FieldGroupMembers"];
export type FieldAddMembersResult = components["schemas"]["FieldAddMembersResult"];
export type FieldApplicantSource = components["schemas"]["FieldApplicantSource"];
export type FieldApplicant = components["schemas"]["FieldApplicant"];
export type FieldParticipant = components["schemas"]["FieldParticipant"];
export type FieldAttendanceDay = components["schemas"]["FieldAttendanceDay"];
export type FieldAttendanceImpact = components["schemas"]["FieldAttendanceImpact"];
export type FieldManagedPhoto = components["schemas"]["FieldManagedPhoto"];
export type FieldIssuedLink = components["schemas"]["FieldIssuedLink"];
export type FieldIssuedLinks = components["schemas"]["FieldIssuedLinks"];
export type FieldFeedbackForm = components["schemas"]["FieldFeedbackForm"];
export type FieldSettings = components["schemas"]["FieldSettings"];
export type FieldAnnouncements = components["schemas"]["FieldAnnouncements"];
export type FieldManagedAnnouncement =
  components["schemas"]["FieldManagedAnnouncement"];
export type AnnouncementAudience = FieldManagedAnnouncement["audience"];
export type FieldDeletionRequest = components["schemas"]["FieldDeletionRequest"];
export type FieldDeletionRequests =
  components["schemas"]["FieldDeletionRequests"];

export type FieldMemberRole = FieldGroupMember["role"];

/**
 * تسميات الدور وطريقة الحضور: قيم مجمّدة ليست حالات، فتعيش مع نوعها كما في
 * `lib/api/initiatives.ts`؛ الحالات وألوانها في `lib/status.ts`.
 */
export const MEMBER_ROLE_LABELS: Record<FieldMemberRole, string> = {
  MEMBER: "عضو",
  ASSISTANT: "مساعد القائد",
};

export const RSVP_LABELS: Record<FieldGroupMember["rsvp"], string> = {
  UNKNOWN: "لم يُجب",
  COMING: "سيحضر",
  NOT_COMING: "اعتذر",
};

export const ATTENDANCE_METHOD_LABELS: Record<
  NonNullable<FieldGroupMember["attendance"]>["method"],
  string
> = {
  LEAD_TAP: "سجّله القائد",
  WALK_IN: "حضر بلا تسجيل",
  SELF: "سجّل نفسه",
};

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ALL: "القادة والمتطوعون",
  LEADS: "القادة",
  VOLUNTEERS: "المتطوعون",
};

const base = (initiativeId: string) => `/admin/initiatives/${initiativeId}/field`;

/** معاملات الاستعلام غير الفارغة وحدها: `undefined` لا يُرسَل نصًّا. */
function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const text = search.toString();

  return text ? `?${text}` : "";
}

export function getInitiativeField(initiativeId: string) {
  return apiFetch<InitiativeField>(base(initiativeId));
}

/**
 * من يصلح قائدًا: الأعضاء الحاملون `field.lead`. مسار خاص لأن المنسّق لا
 * يحمل بالضرورة `users.view`، فدليل الفريق ليس مصدرًا هنا.
 */
export function listLeadCandidates(initiativeId: string) {
  return apiFetch<{ data: FieldLeadCandidate[] }>(
    `${base(initiativeId)}/lead-candidates`,
  ).then((response) => response.data);
}

/**
 * الجهات النشطة التي تُنسب إليها مجموعة. مسار خاص كمسار القادة: المنسّق
 * يختار من أسمائها، ولا يقرأ سجل الشركاء.
 */
export function listPartnerOptions(initiativeId: string) {
  return apiFetch<{ data: FieldPartnerOption[] }>(
    `${base(initiativeId)}/partner-options`,
  ).then((response) => response.data);
}

export type FieldGroupInput = {
  siteId: string;
  nameAr: string;
  leadUserId: string | null;
  partnerId: string | null;
  contactPhone: string | null;
  hoursPerDay: number | null;
  meetsAt: string | null;
  meetingPointAr: string | null;
  instructionsAr: string | null;
};

/** كل كتابة تعيد ميدان المبادرة كاملًا، فتتحدّث القائمة بنداء واحد. */
export function createFieldGroup(initiativeId: string, body: FieldGroupInput) {
  return apiFetch<InitiativeField>(`${base(initiativeId)}/groups`, {
    method: "POST",
    body,
  });
}

export function updateFieldGroup(
  initiativeId: string,
  groupId: string,
  body: Partial<FieldGroupInput>,
) {
  return apiFetch<InitiativeField>(`${base(initiativeId)}/groups/${groupId}`, {
    method: "PATCH",
    body,
  });
}

export function deleteFieldGroup(initiativeId: string, groupId: string) {
  return apiFetch<InitiativeField>(`${base(initiativeId)}/groups/${groupId}`, {
    method: "DELETE",
  });
}

// ── الأعضاء ────────────────────────────────────────────────────────────

const members = (initiativeId: string, groupId: string) =>
  `${base(initiativeId)}/groups/${groupId}/members`;

export function listGroupMembers(initiativeId: string, groupId: string) {
  return apiFetch<FieldGroupMembers>(members(initiativeId, groupId));
}

export type FieldPersonInput = {
  fullNameAr: string;
  phone?: string;
  email?: string;
};

export type AddMembersInput = {
  formId?: string;
  submissionIds?: string[];
  participantIds?: string[];
  people?: FieldPersonInput[];
};

/** المصادر الثلاثة في طلب واحد؛ الجواب قائمة المجموعة وملخص ما جرى. */
export function addGroupMembers(
  initiativeId: string,
  groupId: string,
  body: AddMembersInput,
) {
  return apiFetch<FieldAddMembersResult>(members(initiativeId, groupId), {
    method: "POST",
    body,
  });
}

export function updateGroupMember(
  initiativeId: string,
  groupId: string,
  memberId: string,
  body: { role: FieldMemberRole },
) {
  return apiFetch<FieldGroupMembers>(
    `${members(initiativeId, groupId)}/${memberId}`,
    { method: "PATCH", body },
  );
}

export function removeGroupMember(
  initiativeId: string,
  groupId: string,
  memberId: string,
) {
  return apiFetch<FieldGroupMembers>(
    `${members(initiativeId, groupId)}/${memberId}`,
    { method: "DELETE" },
  );
}

/**
 * الاستمارات التي فيها مقبولون. مسار خاص كمسار القادة: المنسّق يرى اسم
 * الاستمارة وعدد مقبوليها، لا أسئلتها ولا بقية طلباتها.
 */
export function listApplicantSources(initiativeId: string) {
  return apiFetch<{ data: FieldApplicantSource[] }>(
    `${base(initiativeId)}/sources`,
  ).then((response) => response.data);
}

export function listApplicants(
  initiativeId: string,
  formId: string,
  search?: string,
  signal?: AbortSignal,
) {
  return apiFetch<{ data: FieldApplicant[] }>(
    `${base(initiativeId)}/applicants${query({ formId, q: search })}`,
    { ...(signal ? { signal } : {}) },
  ).then((response) => response.data);
}

export function searchParticipants(
  initiativeId: string,
  search: string,
  signal?: AbortSignal,
) {
  return apiFetch<{ data: FieldParticipant[] }>(
    `${base(initiativeId)}/participants${query({ q: search })}`,
    { ...(signal ? { signal } : {}) },
  ).then((response) => response.data);
}

// ── الروابط الشخصية ────────────────────────────────────────────────────

/**
 * رابط لكل متطوع، يعود **في هذا الجواب وحده**: الخادم يحفظ بصمته لا نصّه.
 * توليد جديد يُبطل رابطه السابق في المبادرة.
 */
export function createLinks(
  initiativeId: string,
  body: {
    groupId?: string;
    participantIds?: string[];
    ttlDays?: number;
    email?: boolean;
  },
) {
  return apiFetch<FieldIssuedLinks>(`${base(initiativeId)}/links`, {
    method: "POST",
    body,
  });
}

export function revokeLinks(initiativeId: string, participantIds: string[]) {
  return apiFetch<{ initiativeId: string; revoked: number }>(
    `${base(initiativeId)}/links/revoke`,
    { method: "POST", body: { participantIds } },
  );
}

// ── إعدادات الميدان ────────────────────────────────────────────────────

export function listFeedbackForms(initiativeId: string) {
  return apiFetch<{ data: FieldFeedbackForm[] }>(
    `${base(initiativeId)}/feedback-forms`,
  ).then((response) => response.data);
}

export type FieldSettingsInput = {
  feedbackFormId: string | null;
  certificatesEnabled: boolean;
  certificateSignerNameAr: string | null;
  certificateSignerTitleAr: string | null;
};

export function updateFieldSettings(
  initiativeId: string,
  body: FieldSettingsInput,
) {
  return apiFetch<InitiativeField>(`${base(initiativeId)}/settings`, {
    method: "PUT",
    body,
  });
}

// ── الإعلانات ──────────────────────────────────────────────────────────

export function listAnnouncements(initiativeId: string) {
  return apiFetch<FieldAnnouncements>(`${base(initiativeId)}/announcements`);
}

/**
 * الإعلان يظهر في التطبيق لكل من يفتحه، ويُرسَل إشعارًا لمن فعّل الإشعارات.
 * الإشعار لا يُستردّ بعد إرساله.
 */
export function createAnnouncement(
  initiativeId: string,
  body: {
    groupId?: string;
    audience: AnnouncementAudience;
    titleAr: string;
    bodyAr: string;
  },
) {
  return apiFetch<FieldAnnouncements>(`${base(initiativeId)}/announcements`, {
    method: "POST",
    body,
  });
}

export function deleteAnnouncement(initiativeId: string, announcementId: string) {
  return apiFetch<FieldAnnouncements>(
    `${base(initiativeId)}/announcements/${announcementId}`,
    { method: "DELETE" },
  );
}

// ── طلبات حذف البيانات ─────────────────────────────────────────────────

const deletionRequests = (initiativeId: string) =>
  `${base(initiativeId)}/deletion-requests`;

export function listDeletionRequests(initiativeId: string) {
  return apiFetch<FieldDeletionRequests>(deletionRequests(initiativeId));
}

/**
 * يمحو بيانات المشارك حيث كانت ويبقي حضوره عددًا. لا يُتراجع عنه: الخادم لا
 * يحفظ نسخة قبل المحو.
 */
export function approveDeletionRequest(initiativeId: string, requestId: string) {
  return apiFetch<FieldDeletionRequests>(
    `${deletionRequests(initiativeId)}/${requestId}/approve`,
    { method: "POST" },
  );
}

export function rejectDeletionRequest(
  initiativeId: string,
  requestId: string,
  body: { noteAr: string },
) {
  return apiFetch<FieldDeletionRequests>(
    `${deletionRequests(initiativeId)}/${requestId}/reject`,
    { method: "POST", body },
  );
}

// ── الحضور ─────────────────────────────────────────────────────────────

export function getAttendanceSummary(initiativeId: string) {
  return apiFetch<{ data: FieldAttendanceDay[] }>(
    `${base(initiativeId)}/attendance`,
  ).then((response) => response.data);
}

/**
 * حضور يومٍ قيدَ أثر على المؤشر المختار — قيد لكل موقع، غير موثَّق. يلزمه
 * `impact.manage` مع `field.manage`.
 */
export function recordAttendanceImpact(
  initiativeId: string,
  body: { metricId: string; day: string },
) {
  return apiFetch<FieldAttendanceImpact>(
    `${base(initiativeId)}/attendance/impact`,
    { method: "POST", body },
  );
}

// ── الصور ──────────────────────────────────────────────────────────────

export function listFieldPhotos(
  initiativeId: string,
  filters: { siteId?: string; groupId?: string } = {},
) {
  return apiFetch<{ data: FieldManagedPhoto[] }>(
    `${base(initiativeId)}/photos${query(filters)}`,
  ).then((response) => response.data);
}

export function updateFieldPhoto(
  initiativeId: string,
  photoId: string,
  body: { publicUseAllowed?: boolean; captionAr?: string | null },
) {
  return apiFetch<FieldManagedPhoto>(
    `${base(initiativeId)}/photos/${photoId}`,
    { method: "PATCH", body },
  );
}

/** تُمحى من التخزين أيضًا، لا من المعرض وحده. */
export function deleteFieldPhoto(initiativeId: string, photoId: string) {
  return apiFetch<void>(`${base(initiativeId)}/photos/${photoId}`, {
    method: "DELETE",
  });
}
