import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type InitiativeField = components["schemas"]["InitiativeField"];
export type FieldGroup = components["schemas"]["FieldGroup"];
export type FieldLeadCandidate = components["schemas"]["FieldLeadCandidate"];

const base = (initiativeId: string) => `/admin/initiatives/${initiativeId}/field`;

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

export type FieldGroupInput = {
  siteId: string;
  nameAr: string;
  leadUserId: string | null;
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
