import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type FormSummary = components["schemas"]["FormSummary"];
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

  return String(value ?? "") === String(field.condition.value ?? "");
}
