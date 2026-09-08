import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type FormSummary = components["schemas"]["FormSummary"];
export type ContactRole = NonNullable<
  components["schemas"]["FormField"]["contactRole"]
>;

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  NAME: "اسم المتقدّم",
  EMAIL: "بريد المتقدّم",
  PHONE: "هاتف المتقدّم",
};

/** الدور ونوعه: الخادم يفرض هذا الاقتران، والواجهة تعرض ما يقبله. */
export const CONTACT_ROLE_TYPES: Record<ContactRole, string> = {
  NAME: "TEXT",
  EMAIL: "EMAIL",
  PHONE: "PHONE",
};
export type FormDetail = components["schemas"]["FormDetail"];
export type FormVersion = components["schemas"]["FormVersion"];
export type FormField = components["schemas"]["FormField"];
export type FieldType = FormField["type"];
export type FieldCondition = NonNullable<FormField["condition"]>;

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "نص قصير",
  LONG_TEXT: "نص طويل",
  NUMBER: "رقم",
  DATE: "تاريخ",
  BOOLEAN: "نعم / لا",
  EMAIL: "بريد إلكتروني",
  PHONE: "رقم هاتف",
  URL: "رابط",
  SINGLE_SELECT: "اختيار واحد",
  MULTI_SELECT: "اختيار متعدد",
  AREA_REF: "منطقة جغرافية",
  OFFICE_REF: "مكتب",
  PROGRAM_REF: "برنامج",
};

/** الأنواع التي تحمل خياراتها بنفسها؛ المراجع تقرأ من كتالوجها. */
export const SELECT_TYPES: readonly FieldType[] = [
  "SINGLE_SELECT",
  "MULTI_SELECT",
];

/** الأنواع التي تقبل حد أحرف. */
export const TEXT_TYPES: readonly FieldType[] = ["TEXT", "LONG_TEXT"];

export const REF_TYPES: readonly FieldType[] = [
  "AREA_REF",
  "OFFICE_REF",
  "PROGRAM_REF",
];

export const CONDITION_OP_LABELS: Record<FieldCondition["op"], string> = {
  eq: "يساوي",
  in: "من ضمن",
  notEmpty: "أُجيب عليه",
};

export type FieldInput = {
  key: string;
  labelAr: string;
  hintAr?: string | null;
  type: FieldType;
  isRequired: boolean;
  minSelections?: number | null;
  maxSelections?: number | null;
  maxLength?: number | null;
  /** يربط السؤال بعمود في ملف المتقدّم — الاسم أو البريد أو الهاتف. */
  contactRole?: ContactRole | null;
  options: Array<{ value: string; labelAr: string }>;
  condition?: FieldCondition | null;
};

export function listForms() {
  return apiFetch<{ data: FormSummary[] }>("/admin/forms").then(
    (response) => response.data,
  );
}

export function getForm(id: string) {
  return apiFetch<{ data: FormDetail }>(`/admin/forms/${id}`).then(
    (response) => response.data,
  );
}

export function createForm(input: {
  slug: string;
  nameAr: string;
  descriptionAr?: string;
  officeId?: string;
}) {
  return apiFetch<{ data: FormDetail }>("/admin/forms", {
    method: "POST",
    body: input,
  }).then((response) => response.data);
}

export function updateForm(
  id: string,
  input: {
    nameAr?: string;
    descriptionAr?: string | null;
    introJson?: FormDetail["introJson"];
    coverImageUrl?: string | null;
    officeId?: string | null;
    isAccepting?: boolean;
  },
) {
  return apiFetch<{ data: FormDetail }>(`/admin/forms/${id}`, {
    method: "PATCH",
    body: input,
  }).then((response) => response.data);
}

export function addField(formId: string, input: FieldInput) {
  return apiFetch<{ data: FormField }>(`/admin/forms/${formId}/fields`, {
    method: "POST",
    body: input,
  }).then((response) => response.data);
}

export function updateField(
  formId: string,
  fieldId: string,
  input: FieldInput,
) {
  return apiFetch<{ data: FormField }>(
    `/admin/forms/${formId}/fields/${fieldId}`,
    { method: "PATCH", body: input },
  ).then((response) => response.data);
}

export function deleteField(formId: string, fieldId: string) {
  return apiFetch<void>(`/admin/forms/${formId}/fields/${fieldId}`, {
    method: "DELETE",
  });
}

export function reorderFields(formId: string, keys: string[]) {
  return apiFetch<{ data: FormField[] }>(
    `/admin/forms/${formId}/fields/reorder`,
    { method: "POST", body: { keys } },
  ).then((response) => response.data);
}

/**
 * تقييم شرط الظهور على إجابات المعاينة.
 *
 * نسخة الواجهة تخدم العرض وحده — الخادم يعيد التقييم عند الاستقبال، لأن
 * حقلًا مخفيًا وصلته إجابة يجب أن يُرفض مهما فعل المتصفح.
 */
export function isFieldVisible(
  field: FormField,
  answers: Record<string, unknown>,
) {
  if (!field.condition) return true;

  const value = answers[field.condition.fieldKey];

  if (field.condition.op === "notEmpty") {
    return Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && value !== "";
  }

  if (field.condition.op === "in") {
    const allowed = field.condition.value as unknown as string[];

    return Array.isArray(value)
      ? value.some((item) => allowed.includes(String(item)))
      : allowed.includes(String(value));
  }

  // `eq` على إجابة متعددة تعني «اختار هذا الخيار» لا «اختاره وحده».
  // يطابق `isVisible` في الخادم حرفًا بحرف — وهو المرجع عند الاستقبال.
  if (Array.isArray(value)) {
    return value.map(String).includes(String(field.condition.value ?? ""));
  }

  return String(value ?? "") === String(field.condition.value ?? "");
}

/** يجمّد المسوّدة ويفتح التالية بنسخة من أسئلتها. */
export function publishForm(id: string) {
  return apiFetch<{ data: FormDetail }>(`/admin/forms/${id}/publish`, {
    method: "POST",
  }).then((response) => response.data);
}

// ── الطلبات ────────────────────────────────────────────────────────────

export type SubmissionSummary = components["schemas"]["FormSubmissionSummary"];
export type SubmissionDetail = components["schemas"]["FormSubmissionDetail"];
export type SubmissionStatus = SubmissionSummary["status"];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  NEW: "جديد",
  IN_REVIEW: "قيد المراجعة",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
};

/** مرشّح على إجابة سؤال: مفتاح السؤال والقيمة المطلوبة. */
export type AnswerFilter = { key: string; value: string };

export function listSubmissions(
  formId: string,
  filters: {
    status?: SubmissionStatus | undefined;
    q?: string | undefined;
    before?: string | undefined;
    answers?: AnswerFilter[] | undefined;
  } = {},
) {
  const query = new URLSearchParams();

  if (filters.status) query.set("status", filters.status);
  if (filters.q) query.set("q", filters.q);
  if (filters.before) query.set("before", filters.before);

  // تتكرّر في العنوان وتُجمع بـ«و» على الخادم: كل مرشّح يضيّق النتيجة.
  for (const answer of filters.answers ?? []) {
    query.append("answer", `${answer.key}:${answer.value}`);
  }

  const suffix = query.size > 0 ? `?${query}` : "";

  return apiFetch<{ data: SubmissionSummary[]; nextBefore: string | null }>(
    `/admin/forms/${formId}/submissions${suffix}`,
  );
}

export function getSubmission(formId: string, submissionId: string) {
  return apiFetch<{ data: SubmissionDetail }>(
    `/admin/forms/${formId}/submissions/${submissionId}`,
  ).then((response) => response.data);
}

/** نقل الحالة يعيد الطلب كاملًا، فتُحدَّث الشاشة بما حفظه الخادم لا بما افترضته. */
export function setSubmissionStatus(
  formId: string,
  submissionId: string,
  status: SubmissionStatus,
) {
  return apiFetch<{ data: SubmissionDetail }>(
    `/admin/forms/${formId}/submissions/${submissionId}`,
    { method: "PATCH", body: { status } },
  ).then((response) => response.data);
}
