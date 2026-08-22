import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type WorkItemSummary = components["schemas"]["WorkItemSummary"];
export type AuditEntry = components["schemas"]["AuditEntry"];

export type WorkStatus = WorkItemSummary["status"];
export type WorkPriority = WorkItemSummary["priority"];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  TODO: "لم تبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  BLOCKED: "محجوبة",
  IN_REVIEW: "بانتظار الاعتماد",
  DONE: "منجزة",
  CANCELLED: "ملغاة",
};

export const PRIORITY_LABELS: Record<WorkPriority, string> = {
  LOW: "منخفضة",
  NORMAL: "عادية",
  HIGH: "عالية",
  URGENT: "عاجلة",
};

/** الحالات التي يعني الانتقال إليها أن العمل ما زال حيًّا. */
export const OPEN_STATUSES: readonly WorkStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
];

export function listTasks(
  filters: {
    mine?: boolean;
    overdue?: boolean;
    unassigned?: boolean;
    officeId?: string;
    /** مهام عضو بعينه — يُستعمل في ملفه ضمن دليل الفريق. */
    assigneeUserId?: string;
    status?: readonly WorkStatus[];
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.mine) params.set("mine", "true");
  if (filters.overdue) params.set("overdue", "true");
  if (filters.unassigned) params.set("unassigned", "true");
  if (filters.officeId) params.set("officeId", filters.officeId);
  if (filters.assigneeUserId)
    params.set("assigneeUserId", filters.assigneeUserId);
  for (const status of filters.status ?? []) params.append("status", status);

  const query = params.toString();

  return apiFetch<{ data: WorkItemSummary[] }>(
    `/admin/work/tasks${query ? `?${query}` : ""}`,
  ).then((response) => response.data);
}

/** التقاط مهمة بلا مُسنَد إليه — يستعمل مسار التعديل نفسه. */
export function assignTask(taskId: string, assigneeUserId: string) {
  return apiFetch(`/admin/work/tasks/${taskId}`, {
    method: "PATCH",
    body: { assigneeUserId },
  });
}

export function changeTaskStatus(
  taskId: string,
  status: WorkStatus,
  blockedReasonAr?: string,
) {
  return apiFetch(`/admin/work/tasks/${taskId}/status`, {
    method: "POST",
    body: blockedReasonAr ? { status, blockedReasonAr } : { status },
  });
}

export const AUDIT_SEVERITY_LABELS = {
  INFO: "عادي",
  NOTICE: "ملحوظ",
  WARNING: "تنبيه",
  CRITICAL: "حرج",
} as const;

export function listAuditLogs(
  filters: { severity?: string; q?: string; before?: string } = {},
) {
  const params = new URLSearchParams();

  if (filters.severity) params.set("severity", filters.severity);
  if (filters.q) params.set("q", filters.q);
  if (filters.before) params.set("before", filters.before);

  const query = params.toString();

  return apiFetch<{ data: AuditEntry[]; nextBefore: string | null }>(
    `/admin/audit-logs${query ? `?${query}` : ""}`,
  );
}
