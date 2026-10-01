/**
 * كتالوج القدرات — الجزء الوحيد من نظام الصلاحيات الذي يبقى في الكود.
 *
 * السبب: الحراس تفحص القدرة بالاسم، فاسمها عقد برمجي. أما توزيعها على
 * الأدوار وتوزيع الأدوار على المكاتب فقرار تنظيمي متغير يعيش في القاعدة
 * (`roles.capabilities`)، حسب «نموذج البيانات الديناميكي» في PLAN.md.
 *
 * إضافة قدرة هنا تتطلب منحها لدور في البذرة أو من شاشة الأدوار، وإلا لن
 * يملكها أحد. هذا مقصود: توسيع الصلاحيات قرار صريح لا أثر جانبي.
 */

export type CapabilityGroup =
  | 'access'
  | 'partners'
  | 'media'
  | 'charter'
  | 'operations'
  | 'field'
  | 'contributions'
  | 'impact'
  | 'documents'
  | 'reports'
  | 'forms'
  | 'system'
  | 'partnerPortal'

type CapabilityDefinition = {
  readonly key: string
  readonly nameAr: string
  readonly group: CapabilityGroup
  readonly scope: 'STAFF' | 'PARTNER'
  /**
   * تسري في مكتب العضوية التي منحتها وأقسامه الفرعية لا في المنظمة كلها.
   * ما لم يُعلَّم يسري أينما حُمل، لأن بياناته لا تنتمي إلى مكتب.
   */
  readonly officeScoped?: true
  /**
   * قدرات إدارية: من يحملها يوزّع الصلاحيات أو يطّلع على ما فوق الفرق.
   * لا يمنحها ولا ينزعها إلا حامل `roles.manage` — فلا يصنع مدير فريق
   * مديرًا مثله ولا مشرفًا عامًا.
   */
  readonly tier?: 'ADMIN'
}

/**
 * الترتيب هنا هو ترتيب العرض في شاشة الأدوار، لذا احفظ التجميع المنطقي.
 * `as const satisfies` يبقي المفاتيح حرفية مع فرض شكل التعريف.
 */
export const CAPABILITY_CATALOG = [
  // ── إدارة الوصول ─────────────────────────────────────────────────────
  { key: 'users.view', nameAr: 'عرض المستخدمين', group: 'access', scope: 'STAFF' },
  { key: 'users.manage', nameAr: 'إدارة المستخدمين وتعطيلهم', group: 'access', scope: 'STAFF', tier: 'ADMIN' },
  { key: 'invitations.manage', nameAr: 'إرسال الدعوات وإلغاؤها', group: 'access', scope: 'STAFF', tier: 'ADMIN' },
  { key: 'roles.manage', nameAr: 'إدارة الأدوار وقدراتها', group: 'access', scope: 'STAFF', tier: 'ADMIN' },
  { key: 'offices.manage', nameAr: 'إدارة المكاتب والأقسام', group: 'access', scope: 'STAFF', tier: 'ADMIN' },
  {
    key: 'team.manage',
    nameAr: 'إدارة أعضاء الفريق وصلاحياتهم',
    group: 'access',
    scope: 'STAFF',
    officeScoped: true,
    tier: 'ADMIN',
  },
  { key: 'team.all', nameAr: 'إدارة أعضاء كل الفرق', group: 'access', scope: 'STAFF', tier: 'ADMIN' },

  // ── الشركاء ──────────────────────────────────────────────────────────
  { key: 'partners.view', nameAr: 'عرض سجل الشركاء', group: 'partners', scope: 'STAFF' },
  { key: 'partners.manage', nameAr: 'إنشاء الشركاء وتعديل ملفاتهم', group: 'partners', scope: 'STAFF' },
  {
    key: 'partners.approve',
    nameAr: 'اعتماد الشراكة النهائي',
    group: 'partners',
    scope: 'STAFF',
    tier: 'ADMIN',
  },
  { key: 'partners.consent.manage', nameAr: 'إدارة موافقات الإظهار', group: 'partners', scope: 'STAFF' },
  { key: 'partners.notes.view', nameAr: 'الاطلاع على ملاحظات إيفا الداخلية', group: 'partners', scope: 'STAFF' },

  // ── الشبكة الإعلامية ─────────────────────────────────────────────────
  //
  // قدرات مستقلة عن `partners.*` لا مشتقة منها: مكتب الإعلام يحتاج دفتر
  // صنّاع المحتوى ولا يحتاج ملفات الشراكات ولا موافقات الإظهار، ومن يقرأ
  // سجل الشركاء لا يلزم أن يرى أرقام هواتف الإعلاميين وملاحظاتهم.
  { key: 'media.view', nameAr: 'عرض الشبكة الإعلامية', group: 'media', scope: 'STAFF' },
  { key: 'media.manage', nameAr: 'إضافة صنّاع المحتوى وتعديل ملفاتهم', group: 'media', scope: 'STAFF' },
  {
    key: 'media.notes.view',
    nameAr: 'الاطلاع على الملاحظات الداخلية للشبكة الإعلامية',
    group: 'media',
    scope: 'STAFF',
  },
  {
    key: 'relations.taxonomy.manage',
    nameAr: 'إدارة تعريفات العلاقات — أشكال العمل الإعلامي وأنواع العلاقة والأولوية',
    group: 'media',
    scope: 'STAFF',
  },

  // ── الميثاق ──────────────────────────────────────────────────────────
  { key: 'charter.manage', nameAr: 'إدارة إصدارات الميثاق', group: 'charter', scope: 'STAFF' },
  { key: 'charter.acknowledgements.record', nameAr: 'تسجيل إقرارات الميثاق', group: 'charter', scope: 'STAFF' },

  // ── التشغيل ──────────────────────────────────────────────────────────
  { key: 'programs.manage', nameAr: 'إدارة البرامج', group: 'operations', scope: 'STAFF' },
  { key: 'initiatives.view', nameAr: 'عرض المبادرات ومواقعها', group: 'operations', scope: 'STAFF' },
  { key: 'initiatives.manage', nameAr: 'إنشاء المبادرات والمواقع وتعديلها', group: 'operations', scope: 'STAFF' },
  { key: 'initiatives.launch', nameAr: 'بدء تنفيذ المبادرة وإغلاقها', group: 'operations', scope: 'STAFF' },
  {
    key: 'initiatives.notes.view',
    nameAr: 'الاطلاع على ملاحظات المبادرة الداخلية',
    group: 'operations',
    scope: 'STAFF',
  },
  { key: 'work.view', nameAr: 'عرض المهام', group: 'operations', scope: 'STAFF' },
  { key: 'work.manage', nameAr: 'إنشاء المهام وإسنادها', group: 'operations', scope: 'STAFF' },
  {
    key: 'work.approve',
    nameAr: 'اعتماد إنجاز المهام',
    group: 'operations',
    scope: 'STAFF',
  },
  { key: 'meetings.manage', nameAr: 'إدارة الاجتماعات ومحاضرها', group: 'operations', scope: 'STAFF' },
  { key: 'geo.manage', nameAr: 'إدارة المناطق الجغرافية', group: 'operations', scope: 'STAFF' },

  // ── الميدان ──────────────────────────────────────────────────────────
  //
  // قدرتان لا واحدة: قائد المجموعة يسجّل من الموقع ما يخص مجموعته وحدها،
  // والمنسّق يكوّن المجموعات ويسمّي قادتها. ولا تُشتقّان من `work.*` ولا
  // `impact.*`: قائد متطوع من خارج الفريق يُدخل عدد الأشجار من موقعه، ولا
  // يصير بذلك ممن يسجّلون قيود الأثر في اللوحة أو يديرون المهام.
  {
    key: 'field.lead',
    nameAr: 'قيادة مجموعة ميدانية والتسجيل من موقعها',
    group: 'field',
    scope: 'STAFF',
  },
  {
    key: 'field.manage',
    nameAr: 'تكوين المجموعات الميدانية وتسمية قادتها',
    group: 'field',
    scope: 'STAFF',
  },

  // ── المساهمات والأثر ─────────────────────────────────────────────────
  { key: 'contributions.view', nameAr: 'عرض مساهمات الشركاء', group: 'contributions', scope: 'STAFF' },
  { key: 'contributions.manage', nameAr: 'تسجيل المساهمات وتعديل حالتها', group: 'contributions', scope: 'STAFF' },
  {
    key: 'contributions.verify',
    nameAr: 'التحقق من المساهمة واحتسابها',
    group: 'contributions',
    scope: 'STAFF',
  },
  { key: 'contributions.value.view', nameAr: 'الاطلاع على القيم المالية التقديرية', group: 'contributions', scope: 'STAFF' },
  { key: 'metrics.manage', nameAr: 'إدارة كتالوج المؤشرات', group: 'impact', scope: 'STAFF' },
  { key: 'impact.view', nameAr: 'عرض الأثر والأهداف', group: 'impact', scope: 'STAFF' },
  { key: 'impact.manage', nameAr: 'تسجيل قيود الأثر وعكسها', group: 'impact', scope: 'STAFF' },

  // ── المستندات والملفات ───────────────────────────────────────────────
  { key: 'files.upload', nameAr: 'رفع الملفات', group: 'documents', scope: 'STAFF' },
  { key: 'files.manage', nameAr: 'إدارة مكتبة الملفات', group: 'documents', scope: 'STAFF' },
  { key: 'documents.confidential.view', nameAr: 'الاطلاع على المستندات والاتفاقيات', group: 'documents', scope: 'STAFF' },

  // ── الاستمارات ───────────────────────────────────────────────────────
  //
  // مفهوم جديد لا مرادف له في الكتالوج، بخلاف دليل الفريق الذي استعمل
  // `users.view` القائمة. وفصل `publish` عن `manage` مقصود: من يصوغ
  // الأسئلة ليس بالضرورة من يفتح الاستمارة على العالم.
  { key: 'forms.view', nameAr: 'عرض الاستمارات وأسئلتها', group: 'forms', scope: 'STAFF' },
  { key: 'forms.manage', nameAr: 'إنشاء الاستمارات وتحرير أسئلتها', group: 'forms', scope: 'STAFF' },
  { key: 'forms.publish', nameAr: 'نشر إصدار من الاستمارة وفتح الاستقبال', group: 'forms', scope: 'STAFF' },

  // ── التقارير والنظام ─────────────────────────────────────────────────
  { key: 'reports.view', nameAr: 'عرض التقارير', group: 'reports', scope: 'STAFF' },
  { key: 'reports.manage', nameAr: 'إنشاء التقارير ونشرها', group: 'reports', scope: 'STAFF' },
  { key: 'audit.view', nameAr: 'الاطلاع على سجل التدقيق', group: 'system', scope: 'STAFF', tier: 'ADMIN' },
  // قيم كل تعريف يحرّرها أيضًا من يعدّل سجلاته (`lookups.registry.ts`)؛ هذه
  // لمن يدير التعريفات كلها من «الإعدادات».
  { key: 'lookups.manage', nameAr: 'إدارة تعريفات النظام وقيمها', group: 'system', scope: 'STAFF' },

  // ── بوابة الشريك ─────────────────────────────────────────────────────
  { key: 'partner.profile.manage', nameAr: 'تحديث ملف الجهة وبيانات الاتصال', group: 'partnerPortal', scope: 'PARTNER' },
  { key: 'partner.consent.manage', nameAr: 'إدارة موافقة إظهار الاسم والشعار', group: 'partnerPortal', scope: 'PARTNER' },
  { key: 'partner.work.update', nameAr: 'تحديث حالة المهام وإضافة التعليقات', group: 'partnerPortal', scope: 'PARTNER' },
  { key: 'partner.evidence.upload', nameAr: 'رفع أدلة التنفيذ', group: 'partnerPortal', scope: 'PARTNER' },
  { key: 'partner.contributions.submit', nameAr: 'تقديم مساهمة للمراجعة', group: 'partnerPortal', scope: 'PARTNER' },
  { key: 'partner.impact.submit', nameAr: 'تقديم سجل ميداني أو أثر للمراجعة', group: 'partnerPortal', scope: 'PARTNER' },
  { key: 'partner.reports.view', nameAr: 'الاطلاع على التقارير المسموح بها', group: 'partnerPortal', scope: 'PARTNER' },
] as const satisfies readonly CapabilityDefinition[]

export type Capability = (typeof CAPABILITY_CATALOG)[number]['key']

export const ALL_CAPABILITIES: readonly Capability[] = CAPABILITY_CATALOG.map(
  (definition) => definition.key,
)

export const STAFF_CAPABILITIES: readonly Capability[] = CAPABILITY_CATALOG
  .filter((definition) => definition.scope === 'STAFF')
  .map((definition) => definition.key)

export const PARTNER_CAPABILITIES: readonly Capability[] = CAPABILITY_CATALOG
  .filter((definition) => definition.scope === 'PARTNER')
  .map((definition) => definition.key)

const CAPABILITY_KEYS = new Set<string>(ALL_CAPABILITIES)

export function isCapability(value: string): value is Capability {
  return CAPABILITY_KEYS.has(value)
}

const DEFINITIONS: readonly CapabilityDefinition[] = CAPABILITY_CATALOG

export const ADMIN_CAPABILITIES: readonly Capability[] = DEFINITIONS.filter(
  (definition) => definition.tier === 'ADMIN',
).map((definition) => definition.key as Capability)

const ADMIN_KEYS = new Set<string>(ADMIN_CAPABILITIES)

const OFFICE_SCOPED_KEYS = new Set<string>(
  DEFINITIONS.filter((definition) => definition.officeScoped).map(
    (definition) => definition.key,
  ),
)

const NAMES_AR = new Map<string, string>(
  DEFINITIONS.map((definition) => [definition.key, definition.nameAr]),
)

/** الاسم العربي للقدرة في رسائل الخطأ؛ القدرة الميتة تُعرض بمفتاحها. */
export function capabilityNameAr(value: string): string {
  return NAMES_AR.get(value) ?? value
}

export function isAdminCapability(value: Capability): boolean {
  return ADMIN_KEYS.has(value)
}

export function isOfficeScoped(value: Capability): boolean {
  return OFFICE_SCOPED_KEYS.has(value)
}

/**
 * القدرة العامة المقابلة لكل قدرة مقيّدة بمكتب: من يحملها تسري قدرته
 * المقيّدة في كل المكاتب. المدير العام يحملها كلها لأنه يحمل الكتالوج.
 */
export const ORG_WIDE_COUNTERPART: Partial<Record<Capability, Capability>> = {
  'team.manage': 'team.all',
}

export type CapabilityOverride = {
  capability: string
  effect: 'GRANT' | 'REVOKE'
}

/**
 * قدرات عضوية واحدة: حزمة دورها مع ما مُنح لصاحبها فيها وناقص ما نُزع.
 * القدرة الميتة — في الدور أو في الاستثناء — تُتجاهل كما في `loadAuthContext`.
 */
export function effectiveCapabilities(
  roleCapabilities: readonly string[],
  overrides: readonly CapabilityOverride[],
): Capability[] {
  const result = new Set<Capability>()

  for (const value of roleCapabilities) {
    if (isCapability(value)) result.add(value)
  }

  for (const override of overrides) {
    if (!isCapability(override.capability)) continue

    if (override.effect === 'GRANT') result.add(override.capability)
    else result.delete(override.capability)
  }

  return [...result].sort()
}

/**
 * يُستدعى قبل حفظ أي دور. قدرة غير معروفة تعني إما خطأً مطبعيًا أو قدرة
 * حُذفت من الكود وبقيت في القاعدة — وكلاهما يجب أن يُرفض لا أن يُتجاهل
 * بصمت، لأن دورًا يحمل قدرة ميتة يبدو أقوى مما هو.
 */
export function assertKnownCapabilities(values: readonly string[]): Capability[] {
  const unknown = values.filter((value) => !isCapability(value))

  if (unknown.length > 0) {
    throw new Error(`Unknown capabilities: ${unknown.join(', ')}`)
  }

  return values as Capability[]
}

/** الدور لا يخلط النطاقين: دور فريق لا يحمل قدرة بوابة شريك والعكس. */
export function capabilitiesMatchScope(
  scope: 'STAFF' | 'PARTNER',
  values: readonly Capability[],
): boolean {
  const allowed = new Set<string>(
    scope === 'STAFF' ? STAFF_CAPABILITIES : PARTNER_CAPABILITIES,
  )

  return values.every((value) => allowed.has(value))
}
