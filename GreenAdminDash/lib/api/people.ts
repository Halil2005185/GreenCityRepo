import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type TeamMember = components["schemas"]["TeamMember"];
export type TeamMembership = components["schemas"]["TeamMembership"];

export type ListPeopleFilters = {
  officeId?: string | undefined;
  status?: TeamMember["status"] | undefined;
  q?: string | undefined;
};

export function listPeople(filters: ListPeopleFilters = {}) {
  const query = new URLSearchParams();

  if (filters.officeId) query.set("officeId", filters.officeId);
  if (filters.status) query.set("status", filters.status);
  if (filters.q) query.set("q", filters.q);

  const suffix = query.size > 0 ? `?${query}` : "";

  return apiFetch<{ data: TeamMember[] }>(`/admin/people${suffix}`).then(
    (response) => response.data,
  );
}

export function getPerson(id: string) {
  return apiFetch<{ data: TeamMember }>(`/admin/people/${id}`).then(
    (response) => response.data,
  );
}

/**
 * عضوية إضافية لعضو قائم — `roles.manage`. لا تُنهي عضوياته الحالية ولا
 * تصير رئيسية.
 */
export function addMembership(userId: string, input: { officeId: string; roleId: string }) {
  return apiFetch<{ data: { id: string } }>(`/admin/people/${userId}/memberships`, {
    method: "POST",
    body: input,
  });
}

/** تعديل مكتب أو دور عضوية نشطة قائمة — `roles.manage`. */
export function updateMembership(
  userId: string,
  membershipId: string,
  input: { officeId?: string; roleId?: string },
) {
  return apiFetch<{ data: { id: string } }>(
    `/admin/people/${userId}/memberships/${membershipId}`,
    { method: "PATCH", body: input },
  );
}

/** إنهاء عضوية نشطة — سحب صلاحيتها دون حذف سجلها — `roles.manage`. */
export function endMembership(userId: string, membershipId: string) {
  return apiFetch<void>(`/admin/people/${userId}/memberships/${membershipId}/end`, {
    method: "POST",
  });
}

/** العضوية النشطة الرئيسية — ما يُعرض بجانب الاسم في الدليل. */
export function primaryMembership(member: TeamMember) {
  return (
    member.memberships.find(
      (membership) => membership.isPrimary && membership.status === "ACTIVE",
    ) ??
    member.memberships.find((membership) => membership.status === "ACTIVE") ??
    null
  );
}
