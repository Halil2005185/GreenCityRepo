import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type MediaContactSummary =
  components["schemas"]["MediaContactSummary"];
export type MediaContactDetail = components["schemas"]["MediaContactDetail"];
export type MediaInteraction =
  components["schemas"]["MediaContactInteraction"];
export type MediaFollowUp = components["schemas"]["MediaFollowUp"];

export type MediaStage = MediaContactSummary["stage"];
export type ContactPriority = MediaContactSummary["priority"];
export type EngagementHorizon = NonNullable<MediaContactSummary["horizon"]>;
export type InteractionKind = MediaInteraction["kind"];

/**
 * التسميات العربية للقيم المجمّدة تعيش في الواجهة لا في القاعدة — القاعدة
 * نفسها المتبعة في سجل الشركاء. المفردات المتغيّرة (شكل العمل، نوع
 * العلاقة) تأتي من المرجعيات لا من هنا.
 */
export const MEDIA_STAGE_LABELS: Record<MediaStage, string> = {
  NEW: "جديد",
  CONTACTED: "تم التواصل",
  INTERESTED: "مهتم",
  COLLABORATING: "تعاون قائم",
  DORMANT: "خامل",
  DECLINED: "اعتذر",
};

/** ترتيب العرض هو ترتيب الخط: من لم يُكلَّم بعد أولًا، والاعتذار آخرًا. */
export const MEDIA_STAGES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "COLLABORATING",
  "DORMANT",
  "DECLINED",
] as const satisfies readonly MediaStage[];

export const PRIORITY_LABELS: Record<ContactPriority, string> = {
  HIGH: "عالية",
  MEDIUM: "متوسطة",
  LOW: "منخفضة",
};

export const HORIZON_LABELS: Record<EngagementHorizon, string> = {
  LONG_TERM: "مدى طويل",
  SHORT_TERM: "مدى قصير",
  ONE_OFF: "تعاون لمرة",
};

export const INTERACTION_KIND_LABELS: Record<InteractionKind, string> = {
  NOTE: "ملاحظة",
  CALL: "مكالمة",
  EMAIL: "بريد",
  MEETING: "اجتماع",
  MESSAGE: "رسالة",
  DOCUMENT_REQUEST: "طلب مستند",
  STAGE_CHANGE: "تغيير مرحلة",
};

/** ما يسجّله المستخدم يدويًا؛ `STAGE_CHANGE` يكتبه النظام وحده. */
export const LOGGABLE_KINDS = [
  "CALL",
  "MESSAGE",
  "EMAIL",
  "MEETING",
  "NOTE",
  "DOCUMENT_REQUEST",
] as const satisfies readonly InteractionKind[];

export type MediaFilters = {
  stage?: string;
  priority?: string;
  horizon?: string;
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
  priority?: ContactPriority;
  horizon?: EngagementHorizon;
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
    kind: InteractionKind;
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
