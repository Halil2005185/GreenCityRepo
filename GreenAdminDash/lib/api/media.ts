import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type MediaContactSummary =
  components["schemas"]["MediaContactSummary"];
export type MediaContactDetail = components["schemas"]["MediaContactDetail"];
export type MediaInteraction =
  components["schemas"]["MediaContactInteraction"];
export type MediaFollowUp = components["schemas"]["MediaFollowUp"];

export type MediaStage = MediaContactSummary["stage"];

/** ترتيب العرض هو ترتيب الخط: من لم يُكلَّم بعد أولًا، والاعتذار آخرًا. */
export const MEDIA_STAGES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "COLLABORATING",
  "DORMANT",
  "DECLINED",
] as const satisfies readonly MediaStage[];

export type MediaFilters = {
  stage?: string;
  priorityId?: string;
  horizonId?: string;
  channelId?: string;
  relationshipTypeId?: string;
  q?: string;
  staleDays?: number;
  hasOpenFollowUp?: boolean;
};

export function listMediaContacts(filters: MediaFilters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;

    params.set(key, String(value));
  }

  const query = params.toString();

  return apiFetch<{ data: MediaContactSummary[] }>(
    `/admin/media/contacts${query ? `?${query}` : ""}`,
  ).then((response) => response.data);
}

export function getMediaContact(id: string) {
  return apiFetch<MediaContactDetail>(`/admin/media/contacts/${id}`);
}

export function listFollowUps(options: { withinDays?: number; mine?: boolean } = {}) {
  const params = new URLSearchParams();

  if (options.withinDays !== undefined) {
    params.set("withinDays", String(options.withinDays));
  }

  if (options.mine) params.set("mine", "true");

  const query = params.toString();

  return apiFetch<{ data: MediaFollowUp[] }>(
    `/admin/media/follow-ups${query ? `?${query}` : ""}`,
  ).then((response) => response.data);
}

export type MediaContactInput = {
  fullNameAr: string;
  nameEn?: string;
  jobTitleAr?: string;
  email?: string;
  phone?: string;
  profileUrl?: string;
  outletNameAr?: string;
  partnerId?: string;
  stage?: MediaStage;
  priorityId?: string;
  horizonId?: string;
  relationshipTypeId?: string;
  channelIds?: string[];
  accountManagerId?: string;
  lastContactAt?: string;
  internalNotesAr?: string;
};

export function createMediaContact(body: MediaContactInput) {
  return apiFetch<MediaContactDetail>("/admin/media/contacts", {
    method: "POST",
    body,
  });
}

/** `null` يمسح الحقل، و`undefined` يتركه — لذلك النوع يقبل الاثنين. */
export function updateMediaContact(
  id: string,
  body: Record<string, unknown>,
) {
  return apiFetch<MediaContactDetail>(`/admin/media/contacts/${id}`, {
    method: "PATCH",
    body,
  });
}

export function changeMediaStage(id: string, stage: MediaStage, noteAr?: string) {
  return apiFetch<MediaContactDetail>(`/admin/media/contacts/${id}/stage`, {
    method: "POST",
    body: noteAr ? { stage, noteAr } : { stage },
  });
}

export function recordMediaInteraction(
  id: string,
  body: {
    kindId: string;
    summaryAr: string;
    bodyAr?: string;
    occurredAt?: string;
    dueAt?: string;
  },
) {
  return apiFetch<MediaContactDetail>(
    `/admin/media/contacts/${id}/interactions`,
    { method: "POST", body },
  );
}

export function setFollowUpCompletion(
  id: string,
  interactionId: string,
  completed: boolean,
) {
  return apiFetch<MediaContactDetail>(
    `/admin/media/contacts/${id}/interactions/${interactionId}`,
    { method: "PATCH", body: { completed } },
  );
}
