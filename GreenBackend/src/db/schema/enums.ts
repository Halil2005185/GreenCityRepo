import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * الحالات وحدها enums في القاعدة، لأنها عقود يفحصها الكود وتتفرع عليها القرارات.
 * أما ما يوصّف التنظيم — المكاتب والأدوار والمؤشرات والبرامج — فصفوف في جداول،
 * حسب «نموذج البيانات الديناميكي» في PLAN.md.
 */

/** يفصل فريق إيفا عن ممثلي الشركاء. يحدد المسار `(staff)` أو `(partner)` ونطاق البيانات. */
export const userKind = pgEnum('user_kind', ['STAFF', 'PARTNER'])

export const userStatus = pgEnum('user_status', [
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
])

/** الدور يخدم نطاقًا واحدًا؛ دور فريق لا يُسند لممثل شريك والعكس. */
export const roleScope = pgEnum('role_scope', ['STAFF', 'PARTNER'])

export const membershipStatus = pgEnum('membership_status', ['ACTIVE', 'ENDED'])

/** استثناء فردي على حزمة الدور: قدرة تُضاف لصاحب العضوية أو تُنزع منه. */
export const overrideEffect = pgEnum('override_effect', ['GRANT', 'REVOKE'])

export const invitationStatus = pgEnum('invitation_status', [
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
])

export const tokenPurpose = pgEnum('token_purpose', [
  'PASSWORD_RESET',
  'EMAIL_VERIFICATION',
])

/**
 * `ROTATED` تدوير طبيعي، و`REUSE_DETECTED` استعمال رمز مُدوَّر سابقًا —
 * وهو مؤشر سرقة يُبطل عائلة الجلسة كاملة.
 */
export const sessionRevokeReason = pgEnum('session_revoke_reason', [
  'LOGOUT',
  'LOGOUT_ALL',
  'ROTATED',
  'EXPIRED',
  'PASSWORD_CHANGED',
  'ADMIN_REVOKED',
  'REUSE_DETECTED',
])

export const actorType = pgEnum('actor_type', ['USER', 'SYSTEM'])

/** يفصل ضجيج التشغيل عن الأحداث الأمنية التي تستحق تنبيهًا. */
export const auditSeverity = pgEnum('audit_severity', [
  'INFO',
  'NOTICE',
  'WARNING',
  'CRITICAL',
])

// ── الشركاء ────────────────────────────────────────────────────────────

/** فئات الجهات التي يفتح لها الميثاق باب الانضمام. */
export const organizationKind = pgEnum('organization_kind', [
  'COMPANY',
  'NGO',
  'GOVERNMENT',
  'ACADEMIC',
  'VOLUNTEER_TEAM',
  'COMMUNITY_INITIATIVE',
  'DONOR',
  'INDIVIDUAL',
  'OTHER',
])

/**
 * خط متابعة الشراكة كما في PLAN.md.
 *
 * `ON_HOLD` تجميد للتفاوض، وهو غير تعليق الشريك النشط — ذاك محور مستقل
 * على `suspendedAt`، لأن جهة نشطة معلّقة مؤقتًا ليست جهة عادت إلى
 * التفاوض.
 */
export const partnerStage = pgEnum('partner_stage', [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATION',
  'PENDING_APPROVAL',
  'ACTIVE',
  'ON_HOLD',
  'REJECTED',
  'ENDED',
])

/** أنواع الشراكة الخمسة نصًّا من الميثاق. الشريك يحمل أكثر من نوع. */
export const partnershipType = pgEnum('partnership_type', [
  'STRATEGIC',
  'EXECUTIVE',
  'TECHNICAL',
  'MEDIA',
  'EVENT',
])

export const partnershipStatus = pgEnum('partnership_status', [
  'PROPOSED',
  'APPROVED',
  'PAUSED',
  'ENDED',
])

/** أشكال المشاركة والدعم السبعة كما وردت في الميثاق. */
export const supportForm = pgEnum('support_form', [
  'MORAL_MEDIA',
  'COMMUNITY_VOLUNTEERING',
  'SPONSORSHIP_LOGISTICS',
  'TECHNICAL_ACADEMIC_EXPERTISE',
  'ENVIRONMENTAL_AWARENESS',
  'INTERNAL_SUSTAINABILITY',
  'SPACES_AND_RESOURCES',
])

export const contactStatus = pgEnum('contact_status', ['ACTIVE', 'ENDED'])

/** نوع الموافقة على الإظهار العلني — الاسم والشعار مستقلان. */
export const consentType = pgEnum('consent_type', [
  'PUBLIC_NAME',
  'PUBLIC_LOGO',
])

export const consentAction = pgEnum('consent_action', ['GRANTED', 'REVOKED'])

/** من نفّذ الموافقة: مكتب العلاقات أم الشريك من بوابته. */
export const consentSource = pgEnum('consent_source', [
  'ADMIN',
  'PARTNER_SELF',
])

/** نوع التواصل في سجل المتابعة. */
export const interactionKind = pgEnum('interaction_kind', [
  'NOTE',
  'CALL',
  'EMAIL',
  'MEETING',
  'MESSAGE',
  'DOCUMENT_REQUEST',
  'STAGE_CHANGE',
])

/** كيف وصل الإقرار بالميثاق — الورقي والحضوري مقبولان مثل البوابة. */
export const acknowledgementMethod = pgEnum('acknowledgement_method', [
  'IN_PERSON',
  'EMAIL',
  'PORTAL',
  'DOCUMENT',
])

// ── الشبكة الإعلامية وتصنيف العلاقات ───────────────────────────────────

/**
 * خط متابعة الشخص الإعلامي، أخف من `partner_stage` عمدًا.
 *
 * لا بوابة اعتماد فيه ولا إقرار ميثاق: صانع المحتوى فرد نتواصل معه، لا
 * جهة تُعتمد شراكتها. لذلك تنتهي السلسلة عند «تعاون قائم» بلا `ACTIVE`
 * يحتاج توقيع المدير العام.
 *
 * `DORMANT` انقطاع لا رفض: من تعاون معنا مرة ثم غاب يبقى في الشبكة
 * ويُعاد تنشيطه، بخلاف `DECLINED` الذي اعتذر صراحةً.
 */
export const mediaContactStage = pgEnum('media_contact_stage', [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'COLLABORATING',
  'DORMANT',
  'DECLINED',
])

/** أولوية التواصل — من نبدأ به حين يضيق الوقت. */
export const contactPriority = pgEnum('contact_priority', [
  'HIGH',
  'MEDIUM',
  'LOW',
])

/**
 * أفق العلاقة، محور مستقل عن الأولوية لا درجة أخرى منها.
 *
 * صحفي نحتاج تغطيته غدًا أولويته عالية وأفقه `ONE_OFF`، وأكاديمي لن
 * نراسله هذا الشهر أولويته منخفضة وأفقه `LONG_TERM`. دمج المحورين في
 * سلّم واحد يخسر أحدهما، ومكتب العلاقات طلبهما معًا.
 */
export const engagementHorizon = pgEnum('engagement_horizon', [
  'LONG_TERM',
  'SHORT_TERM',
  'ONE_OFF',
])

// ── الجغرافيا والتشغيل ─────────────────────────────────────────────────

/**
 * مستويات التسلسل الجغرافي.
 *
 * جدول واحد ذاتي المرجعية بدل جدول لكل مستوى: المشروع يعمل اليوم على
 * مستوى المحافظة، ومبادرة ترميم منطقة محروقة قد تُحدَّد على مستوى الحي.
 * فصلها جداولَ يجعل كل عمق جديد migration وكودًا.
 */
export const areaLevel = pgEnum('area_level', [
  'GOVERNORATE',
  'CITY',
  'DISTRICT',
  'NEIGHBORHOOD',
])

/**
 * نوعا التشجير. كلاهما نقطة على الخريطة نفسها، والفرق في من نفّذ وبأي ثقل.
 *
 * `CAMPAIGN` حملة يقودها الفريق: مواقع متعددة وأهداف ومراحل ومهام.
 * `GREEN_POINT` فعل واحد نفّذه شخص أو شركة أو مؤسسة ووثّقناه: موقع واحد
 * بلا خطة عمل ولا أهداف — توثيق لا إدارة.
 */
export const initiativeKind = pgEnum('initiative_kind', [
  'CAMPAIGN',
  'GREEN_POINT',
])

/** من نفّذ النقطة الخضراء، حين لا يكون شريكًا مسجّلًا. */
export const contributorKind = pgEnum('contributor_kind', [
  'INDIVIDUAL',
  'COMPANY',
  'INSTITUTION',
  'SCHOOL',
  'VOLUNTEER_TEAM',
  'OTHER',
])

export const initiativeStatus = pgEnum('initiative_status', [
  'DRAFT',
  'PLANNING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
])

export const siteStatus = pgEnum('site_status', [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
])

/**
 * سياسة مطابقة مجموع أهداف المواقع لهدف المبادرة.
 *
 * كانت في الخطة الأولى قاعدة ثابتة «المجموع = 100». صارت سياسة لأن
 * المبادرات تختلف: حملة بأهداف موزعة بدقة تحتاج `STRICT`، ومبادرة
 * لا مركزية مثل Green Point لا معنى فيها للمطابقة أصلًا.
 */
export const targetRollup = pgEnum('target_rollup', [
  'STRICT',
  'ADVISORY',
  'NONE',
])

/** طريقة تجميع قيم المؤشر عبر القيود. */
export const metricAggregation = pgEnum('metric_aggregation', [
  'SUM',
  'MAX',
  'LATEST',
])

/**
 * `FIELD_ENTRY` قيد أدخله قائد مجموعة من موقع التنفيذ. مصدر مستقل لا
 * `STAFF_ENTRY`: رقم يُكتب واقفًا بين الأشجار غير رقم يُكتب من مكتب بعد
 * مراجعة، والمنسّق الذي يتحقق يحتاج أن يعرف أيهما أمامه.
 */
export const impactSource = pgEnum('impact_source', [
  'STAFF_ENTRY',
  'PARTNER_SUBMISSION',
  'CONTRIBUTION',
  'FIELD_ENTRY',
])

export const workItemStatus = pgEnum('work_item_status', [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
])

export const workItemPriority = pgEnum('work_item_priority', [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
])

export const milestoneStatus = pgEnum('milestone_status', [
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
])

/** القالب يولّد مرحلة أو مهمة عند إنشاء مبادرة تحت البرنامج. */
export const templateKind = pgEnum('template_kind', ['MILESTONE', 'TASK'])

// ── الميدان ────────────────────────────────────────────────────────────

/** المساعد ينوب عن القائد في مجموعته؛ العضو ينفّذ. */
export const fieldMemberRole = pgEnum('field_member_role', [
  'MEMBER',
  'ASSISTANT',
])

/**
 * طلب حذف البيانات: قائم حتى يقرر المنسّق. التراجع عنه يحذف صفّه، فلا حال
 * له هنا؛ وما نُفّذ لا يعود.
 */
export const deletionRequestStatus = pgEnum('deletion_request_status', [
  'PENDING',
  'DONE',
  'REJECTED',
])

/** تأكيد الحضور المسبق. `UNKNOWN` لم يُجب بعد — وهو غير «لن يحضر». */
export const fieldRsvp = pgEnum('field_rsvp', [
  'UNKNOWN',
  'COMING',
  'NOT_COMING',
])

/**
 * كيف سُجّل الحضور: نقرة القائد على اسم في قائمته، أو شخص جاء بلا تسجيل
 * فأضافه القائد، أو تسجيل المتطوع نفسه عند نقطة اللقاء.
 */
export const attendanceMethod = pgEnum('attendance_method', [
  'LEAD_TAP',
  'WALK_IN',
  'SELF',
])

/**
 * لمن الإعلان الميداني: قادة المجموعات، أو متطوعوها، أو الجميع. موعد تغيّر
 * يهمّ الجميع، و«أحضروا المعاول من المستودع» يهمّ القادة وحدهم.
 */
export const fieldAnnouncementAudience = pgEnum('field_announcement_audience', [
  'ALL',
  'LEADS',
  'VOLUNTEERS',
])

/**
 * حالة رسالة الصادر.
 *
 * `SENDING` ليست زينة: بدونها لا يعرف العامل التالي أن رسالة التُقطت
 * وانهار من التقطها، فتبقى معلّقة إلى الأبد أو تُرسل مرتين.
 */
export const outboxStatus = pgEnum('outbox_status', [
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
])

// ── استمارات الانضمام ──────────────────────────────────────────────────
//
// النوع مجموعة مغلقة لا نص حر: الخادم يتحقق من الإجابة حسب النوع، فنوع
// لا يعرفه الكود لا يمكن التحقق منه أصلًا. راجع «الحدود الأربعة» في
// PLAN.md قبل التوسيع.
export const formFieldType = pgEnum('form_field_type', [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'EMAIL',
  'PHONE',
  'URL',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  // مراجع إلى كتالوجات النظام: تربط الاستمارة بالبيانات بدل أن تجاورها.
  'AREA_REF',
  'OFFICE_REF',
  'PROGRAM_REF',
])

/** ثلاث عمليات لا أكثر — الحد الرابع في PLAN.md. */
export const formConditionOp = pgEnum('form_condition_op', [
  'eq',
  'in',
  'notEmpty',
])

export const formVersionStatus = pgEnum('form_version_status', [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
])

/**
 * حالات الطلب — enum في الكود لا سير عمل قابل للتحرير، كما `partner_stage`
 * و`initiative_status`. الحد الثالث في PLAN.md.
 */
export const submissionStatus = pgEnum('submission_status', [
  'NEW',
  'IN_REVIEW',
  'ACCEPTED',
  'REJECTED',
])

/**
 * دور الحقل في التواصل. يُعرَّف صراحةً لا بالاتفاق على أسماء المفاتيح:
 * استمارة تسمّي حقلها `mail` بدل `email` تكسر أي اصطلاح صامت، ويصير
 * الطلب بلا بريد يُراسَل عليه دون أن يشتكي شيء.
 */
export const fieldContactRole = pgEnum('field_contact_role', [
  'NAME',
  'EMAIL',
  'PHONE',
])
