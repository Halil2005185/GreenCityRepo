/**
 * أشكال البيانات التي يقرأها الموقع العام. أسماء الحقول مطابقة لتمثيلات
 * `GreenBackend` (`Program`, `InitiativeSummary`, `ScopeMetricProgress`)
 * حتى لا تُترجم الأسماء بين طرفين.
 *
 * هذا الملف مؤقت: حين تصدر مسارات `/api/public/*` في العقد، يُولَّد بدلًا
 * منه `types.gen.ts` من `openapi.json` كما في اللوحة، ويُحذف هذا.
 * الاختلاف عن تمثيلات اللوحة مقصود: العلني لا يحمل معرّفات المسؤولين ولا
 * الملاحظات الداخلية ولا القيم غير الموثَّقة.
 */

export type InitiativeStatus =
  | "DRAFT"
  | "PLANNING"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type SiteStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type PartnershipType =
  | "STRATEGIC"
  | "EXECUTIVE"
  | "TECHNICAL"
  | "MEDIA"
  | "EVENT";

export type PublicProgram = {
  id: string;
  slug: string;
  nameAr: string;
  descriptionAr: string | null;
  initiativeCount: number;
};

export type PublicMetricProgress = {
  metricId: string;
  metricSlug: string;
  metricNameAr: string;
  unitAr: string;
  decimals: number;
  /** الهدف المعلن. `null` يعني مؤشرًا يُقاس ولا يُوعَد برقم فيه. */
  target: number | null;
  /** القيود الموثَّقة وحدها. غير الموثَّق لا يظهر للعامة إطلاقًا. */
  actual: number;
  percent: number | null;
};

export type PublicInitiativeSummary = {
  id: string;
  slug: string | null;
  nameAr: string;
  programId: string;
  programSlug: string;
  programNameAr: string;
  descriptionAr: string | null;
  coverImageUrl: string | null;
  season: string | null;
  status: InitiativeStatus;
  startsAt: string | null;
  endsAt: string | null;
  areaNamesAr: string[];
  siteCount: number;
};

export type PublicInitiativeSite = {
  id: string;
  nameAr: string;
  areaNameAr: string | null;
  status: SiteStatus;
  lat: number | null;
  lng: number | null;
};

export type PublicInitiative = PublicInitiativeSummary & {
  storyAr: string | null;
  metrics: PublicMetricProgress[];
  sites: PublicInitiativeSite[];
};

export type PublicPartner = {
  id: string;
  nameAr: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  partnershipTypes: PartnershipType[];
};

/** مجاميع الأثر المعلنة على مستوى المشروع كله. */
export type PublicImpactSummary = {
  metrics: PublicMetricProgress[];
  updatedAt: string | null;
};

/** أنواع الأسئلة كما يعرّفها الخادم — الترتيب نفسه في `form_field_type`. */
export type PublicFormFieldType =
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "DATE"
  | "BOOLEAN"
  | "EMAIL"
  | "PHONE"
  | "URL"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "AREA_REF"
  | "OFFICE_REF"
  | "PROGRAM_REF";

export type PublicFormField = {
  key: string;
  labelAr: string;
  hintAr: string | null;
  type: PublicFormFieldType;
  isRequired: boolean;
  /** حقل البريد الذي تصله نسخة الطلب — به تعرف الصفحة متى تعرض خيار النسخة. */
  isContactEmail: boolean;
  minSelections: number | null;
  maxSelections: number | null;
  maxLength: number | null;
  options: Array<{ value: string; labelAr: string }>;
  condition: {
    fieldKey: string;
    op: "eq" | "in" | "notEmpty";
    value?: unknown;
  } | null;
};

export type PublicForm = {
  slug: string;
  nameAr: string;
  descriptionAr: string | null;
  isAccepting: boolean;
  version: number;
  fields: PublicFormField[];
};
