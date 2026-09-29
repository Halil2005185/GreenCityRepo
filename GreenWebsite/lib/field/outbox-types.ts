/**
 * ما يُسجَّل في الميدان وينتظر الإرسال.
 *
 * كل فعل صف بمعرّفه (`clientId`) يولّده الهاتف لحظة الفعل، ويُرسَل معه.
 * الخادم يعيد النتيجة الأولى حين يتكرر المعرّف، فإعادة الإرسال بعد انقطاع
 * آمنة مهما تكررت.
 */
type Base = {
  clientId: string;
  /** صاحب الفعل. الطابور يُرسَل باسم من سجّله، لا باسم من دخل بعده. */
  ownerId: string;
  groupId: string;
  createdAt: number;
  attempts: number;
  /**
   * `pending` ينتظر الشبكة ويُعاد من تلقائه. `failed` رفضه الخادم لسبب لن
   * يتغيّر بالتكرار، فيقف حتى يقرر صاحبه: يعيده أو يسقطه.
   */
  status: "pending" | "failed";
  lastError: string | null;
  /** وصف يقرؤه القائد في قائمة ما لم يُرسَل: «حضور هبة الأحمد». */
  label: string;
};

export type AttendanceItem = Base & {
  kind: "attendance";
  payload: { participantId: string; checkedInAt: string };
};

export type WalkInItem = Base & {
  kind: "walk-in";
  payload: { fullNameAr: string; phone?: string; checkedInAt: string };
};

export type UndoItem = Base & {
  kind: "attendance-undo";
  payload: {
    participantId: string;
    /** معرّف الخادم إن عُرف، وإلا معرّف المُرسِل الذي سُجّل به الحضور. */
    attendanceId?: string;
    attendanceClientId?: string;
  };
};

export type ImpactItem = Base & {
  kind: "impact";
  payload: {
    metricId: string;
    value: number;
    occurredAt: string;
    noteAr?: string;
  };
};

export type PhotoItem = Base & {
  kind: "photo";
  payload: {
    contentType: string;
    sizeBytes: number;
    taskId?: string;
    location?: { lat: number; lng: number };
    takenAt: string;
    captionAr?: string;
    hasPeople: boolean;
    peopleConsent: boolean;
  };
  /**
   * رابط الصورة بعد رفعها. يُحفظ قبل التسجيل: إن انقطعت الشبكة بين
   * الخطوتين لا تُرفع الصورة مرة ثانية، بل تُسجَّل بما رُفع.
   */
  uploadedUrl?: string;
};

export type TaskStatusItem = Base & {
  kind: "task-status";
  payload: {
    taskId: string;
    status: "IN_PROGRESS" | "BLOCKED" | "DONE";
    blockedReasonAr?: string;
  };
};

export type TaskCommentItem = Base & {
  kind: "task-comment";
  payload: { taskId: string; bodyAr: string };
};

export type SiteStatusItem = Base & {
  kind: "site-status";
  payload: { status: "IN_PROGRESS" | "COMPLETED" };
};

/**
 * تأكيد الحضور من بطاقة المتطوع. `groupId` هنا مجموعة العضوية، كبقية
 * الأفعال، فيُعرف أي بطاقة يمسّها.
 */
export type RsvpItem = Base & {
  kind: "rsvp";
  payload: { memberId: string; coming: boolean };
};

/** ما يسجّله القائد على ورقة مجموعته. */
export type SheetItem = Exclude<OutboxItem, RsvpItem>;

export type OutboxItem =
  | RsvpItem
  | AttendanceItem
  | WalkInItem
  | UndoItem
  | ImpactItem
  | PhotoItem
  | TaskStatusItem
  | TaskCommentItem
  | SiteStatusItem;

/** ما يكتبه المستدعي؛ البقية يملؤها الطابور. */
export type OutboxDraft = OutboxItem extends infer Item
  ? Item extends OutboxItem
    ? Pick<Item, "kind" | "payload" | "groupId" | "label">
    : never
  : never;

/** بادئة المعرّفات المحلية في الورقة: صف لم يعرف الخادم به بعد. */
export const PENDING_PREFIX = "pending:";

export const pendingId = (clientId: string) => `${PENDING_PREFIX}${clientId}`;

export const clientIdOf = (id: string) =>
  id.startsWith(PENDING_PREFIX) ? id.slice(PENDING_PREFIX.length) : null;
