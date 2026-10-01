import type { BadgeTone } from "@/components/ui/badge";
import type { FieldDeletionRequest } from "@/lib/api/field";
import type { SubmissionStatus } from "@/lib/api/forms";
import type {
  InitiativeStatus,
  SiteStatus,
} from "@/lib/api/initiatives";
import type { Invitation } from "@/lib/api/invitations";
import type { MediaStage } from "@/lib/api/media";
import type { PartnerStage, Partnership } from "@/lib/api/partners";
import type { TeamMember } from "@/lib/api/people";
import type { AuditEntry, WorkPriority, WorkStatus } from "@/lib/api/work";

/**
 * تسمية كل حالة ولونها في مكان واحد.
 *
 * كانت كل صفحة تعرّف خريطتها (`STAGE_STYLES`، `STATUS_STYLES`...) فاختلف
 * لون الحالة نفسها بين القائمة وصفحة التفاصيل، وتكرّرت تسميات المهام في
 * ملفين. الصفحات تقرأ من هنا عبر `StatusBadge` و`statusOptions`.
 *
 * التسمية قرار تحريري لا عقد برمجي، فتبقى في الواجهة؛ القيمة وحدها من
 * الخادم.
 */
type StatusDef = { label: string; tone: BadgeTone };
type StatusMap<K extends string> = Record<K, StatusDef>;

const partnerStage = {
  NEW: { label: "جديدة", tone: "neutral" },
  CONTACTED: { label: "تم التواصل", tone: "neutral" },
  QUALIFIED: { label: "مؤهلة", tone: "accent" },
  NEGOTIATION: { label: "تفاوض", tone: "warning" },
  PENDING_APPROVAL: { label: "بانتظار الاعتماد", tone: "warning" },
  ACTIVE: { label: "نشطة", tone: "success" },
  ON_HOLD: { label: "معلّقة التفاوض", tone: "neutral" },
  REJECTED: { label: "مرفوضة", tone: "danger" },
  ENDED: { label: "منتهية", tone: "neutral" },
} satisfies StatusMap<PartnerStage>;

const partnershipStatus = {
  PROPOSED: { label: "مقترحة", tone: "neutral" },
  APPROVED: { label: "معتمدة", tone: "success" },
  PAUSED: { label: "معلّقة", tone: "warning" },
  ENDED: { label: "منتهية", tone: "neutral" },
} satisfies StatusMap<Partnership["status"]>;

const initiativeStatus = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  PLANNING: { label: "قيد التخطيط", tone: "accent" },
  ACTIVE: { label: "قيد التنفيذ", tone: "success" },
  COMPLETED: { label: "مكتملة", tone: "primary" },
  CANCELLED: { label: "ملغاة", tone: "danger" },
} satisfies StatusMap<InitiativeStatus>;

const siteStatus = {
  PLANNED: { label: "مخطط", tone: "neutral" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "primary" },
  COMPLETED: { label: "مكتمل", tone: "success" },
  CANCELLED: { label: "ملغى", tone: "danger" },
} satisfies StatusMap<SiteStatus>;

const milestoneStatus = {
  PENDING: { label: "لم تبدأ", tone: "neutral" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "primary" },
  DONE: { label: "مكتملة", tone: "success" },
  CANCELLED: { label: "ملغاة", tone: "neutral" },
} satisfies StatusMap<"PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED">;

/**
 * «متعثّرة» لا «محجوبة»: هي الكلمة التي تستعملها الرئيسية وسؤال السبب
 * («ما سبب تعثّر المهمة؟»)، فتوحّدت التسمية عليها.
 */
const workStatus = {
  TODO: { label: "لم تبدأ", tone: "neutral" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "primary" },
  BLOCKED: { label: "متعثّرة", tone: "danger" },
  IN_REVIEW: { label: "بانتظار الاعتماد", tone: "warning" },
  DONE: { label: "منجزة", tone: "success" },
  CANCELLED: { label: "ملغاة", tone: "neutral" },
} satisfies StatusMap<WorkStatus>;

const workPriority = {
  LOW: { label: "منخفضة", tone: "neutral" },
  NORMAL: { label: "عادية", tone: "neutral" },
  HIGH: { label: "عالية", tone: "warning" },
  URGENT: { label: "عاجلة", tone: "danger" },
} satisfies StatusMap<WorkPriority>;

const mediaStage = {
  NEW: { label: "جديد", tone: "neutral" },
  CONTACTED: { label: "تم التواصل", tone: "accent" },
  INTERESTED: { label: "مهتم", tone: "warning" },
  COLLABORATING: { label: "تعاون قائم", tone: "success" },
  DORMANT: { label: "خامل", tone: "neutral" },
  DECLINED: { label: "اعتذر", tone: "danger" },
} satisfies StatusMap<MediaStage>;

const userStatus = {
  ACTIVE: { label: "نشط", tone: "success" },
  SUSPENDED: { label: "موقوف", tone: "warning" },
  DISABLED: { label: "معطّل", tone: "neutral" },
} satisfies StatusMap<TeamMember["status"]>;

const membershipStatus = {
  ACTIVE: { label: "نشطة", tone: "success" },
  ENDED: { label: "منتهية", tone: "neutral" },
} satisfies StatusMap<TeamMember["memberships"][number]["status"]>;

const invitationStatus = {
  PENDING: { label: "معلّقة", tone: "warning" },
  ACCEPTED: { label: "مقبولة", tone: "success" },
  REVOKED: { label: "ملغاة", tone: "neutral" },
  EXPIRED: { label: "منتهية", tone: "neutral" },
} satisfies StatusMap<Invitation["status"]>;

const submissionStatus = {
  NEW: { label: "جديد", tone: "primary" },
  IN_REVIEW: { label: "قيد المراجعة", tone: "warning" },
  ACCEPTED: { label: "مقبول", tone: "success" },
  REJECTED: { label: "مرفوض", tone: "danger" },
} satisfies StatusMap<SubmissionStatus>;

const deletionRequestStatus = {
  PENDING: { label: "ينتظر القرار", tone: "warning" },
  DONE: { label: "نُفّذ", tone: "neutral" },
  REJECTED: { label: "رُفض", tone: "danger" },
} satisfies StatusMap<FieldDeletionRequest["status"]>;

const auditSeverity = {
  INFO: { label: "عادي", tone: "neutral" },
  NOTICE: { label: "ملحوظ", tone: "primary" },
  WARNING: { label: "تنبيه", tone: "warning" },
  CRITICAL: { label: "حرج", tone: "danger" },
} satisfies StatusMap<AuditEntry["severity"]>;

const formAccepting = {
  OPEN: { label: "مفتوح", tone: "success" },
  CLOSED: { label: "مغلق", tone: "neutral" },
} satisfies StatusMap<"OPEN" | "CLOSED">;

const charterState = {
  CURRENT: { label: "الساري", tone: "success" },
  PUBLISHED: { label: "منشور", tone: "neutral" },
  DRAFT: { label: "مسودة", tone: "warning" },
} satisfies StatusMap<"CURRENT" | "PUBLISHED" | "DRAFT">;

const pointKind = {
  CAMPAIGN: { label: "حملة تشجير", tone: "primary" },
  GREEN_POINT: { label: "نقطة خضراء", tone: "info" },
} satisfies StatusMap<"CAMPAIGN" | "GREEN_POINT">;

const catalogState = {
  ACTIVE: { label: "مفعّل", tone: "success" },
  INACTIVE: { label: "معطّل", tone: "neutral" },
} satisfies StatusMap<"ACTIVE" | "INACTIVE">;

const consent = {
  GRANTED: { label: "ممنوحة", tone: "success" },
  NOT_GRANTED: { label: "غير ممنوحة", tone: "neutral" },
} satisfies StatusMap<"GRANTED" | "NOT_GRANTED">;

export const STATUS = {
  partnerStage,
  partnershipStatus,
  initiativeStatus,
  siteStatus,
  milestoneStatus,
  workStatus,
  workPriority,
  mediaStage,
  userStatus,
  membershipStatus,
  invitationStatus,
  submissionStatus,
  deletionRequestStatus,
  auditSeverity,
  formAccepting,
  charterState,
  pointKind,
  catalogState,
  consent,
} as const;

export type StatusKind = keyof typeof STATUS;
export type StatusValue<K extends StatusKind> = keyof (typeof STATUS)[K] & string;

export function statusDef<K extends StatusKind>(
  kind: K,
  value: StatusValue<K>,
): StatusDef {
  const map = STATUS[kind] as Record<string, StatusDef>;

  // قيمة جديدة من الخادم لم تُترجم بعد تُعرض كما هي بدل أن تُسقط الصفحة.
  return map[value] ?? { label: value, tone: "neutral" };
}

export function statusLabel<K extends StatusKind>(
  kind: K,
  value: StatusValue<K>,
) {
  return statusDef(kind, value).label;
}

/**
 * خيارات لقائمة اختيار أو رقائق مرشح، بترتيب الخريطة أو بالترتيب المعطى
 * (مراحل خط المتابعة مثلًا).
 */
export function statusOptions<K extends StatusKind>(
  kind: K,
  values?: readonly StatusValue<K>[],
) {
  const keys = values ?? (Object.keys(STATUS[kind]) as StatusValue<K>[]);

  return keys.map((value) => ({ value, label: statusLabel(kind, value) }));
}
