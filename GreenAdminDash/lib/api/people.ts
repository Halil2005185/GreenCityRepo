import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type TeamMember = components["schemas"]["TeamMember"];
export type TeamMembership = components["schemas"]["TeamMembership"];
export type TeamMembershipDetail = components["schemas"]["TeamMembershipDetail"];
/**
 * المخطط المولَّد يمدّ `TeamMember` بـ`allOf`، فتصير العضويات تقاطع
 * مصفوفتين يضيع فيه النوع المفصّل عند `filter`. يُعرَّف هنا صراحةً.
 */
export type TeamMemberDetail = Omit<TeamMember, "memberships"> & {
  memberships: TeamMembershipDetail[];
};
export type TeamCandidate = components["schemas"]["TeamCandidate"];

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

/**
 * لكل عضوية حزمة دورها واستثناءاتها وقدراتها الفعلية، و`canManage`/
 * `canCustomize` من منظور المستخدم الحالي — قرار الخادم نفسه، فلا تعيد
 * الواجهة كتابة قواعد التفويض.
 */
export function getPerson(id: string) {
  return apiFetch<{ data: TeamMemberDetail }>(`/admin/people/${id}`).then(
    (response) => response.data,
  );
}

/** زملاء يُضمّون إلى فريق — الاسم والبريد وحدهما، بحرفين على الأقل. */
export function searchCandidates(q: string, signal?: AbortSignal) {
  return apiFetch<{ data: TeamCandidate[] }>(
    `/admin/people/candidates?q=${encodeURIComponent(q)}`,
    signal ? { signal } : {},
  ).then((response) => response.data);
}

/**
 * يستبدل الاستثناءات الفردية للعضوية بما يُرسَل: `grants` فوق حزمة الدور،
 * و`revokes` منها.
 */
export function setMembershipCapabilities(
  userId: string,
  membershipId: string,
  input: { grants: string[]; revokes: string[] },
) {
  return apiFetch<{ data: { effective: string[] } }>(
    `/admin/people/${userId}/memberships/${membershipId}/capabilities`,
    { method: "PUT", body: input },
  );
}

/**
 * عضوية إضافية لعضو قائم — لمن يدير الفريق المقصود. لا تُنهي عضوياته
 * الحالية ولا تصير رئيسية.
 */
export function addMembership(userId: string, input: { officeId: string; roleId: string }) {
  return apiFetch<{ data: { id: string } }>(`/admin/people/${userId}/memberships`, {
    method: "POST",
    body: input,
  });
}

/** تعديل مكتب أو دور عضوية نشطة قائمة؛ تسقط معه استثناءاتها الفردية. */
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

/** إنهاء عضوية نشطة — سحب صلاحيتها دون حذف سجلها. */
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
