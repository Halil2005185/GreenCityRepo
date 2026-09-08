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
}

/**
 * الترتيب هنا هو ترتيب العرض في شاشة الأدوار، لذا احفظ التجميع المنطقي.
 * `as const satisfies` يبقي المفاتيح حرفية مع فرض شكل التعريف.
 */
export const CAPABILITY_CATALOG = [
  // ── إدارة الوصول ─────────────────────────────────────────────────────
  { key: 'users.view', nameAr: 'عرض المستخدمين', group: 'access', scope: 'STAFF' },
  { key: 'users.manage', nameAr: 'إدارة المستخدمين وتعطيلهم', group: 'access', scope: 'STAFF' },
  { key: 'invitations.manage', nameAr: 'إرسال الدعوات وإلغاؤها', group: 'access', scope: 'STAFF' },
  { key: 'roles.manage', nameAr: 'إدارة الأدوار وقدراتها', group: 'access', scope: 'STAFF' },
  { key: 'offices.manage', nameAr: 'إدارة المكاتب والأقسام', group: 'access', scope: 'STAFF' },

  // ── الشركاء ──────────────────────────────────────────────────────────
  { key: 'partners.view', nameAr: 'عرض سجل الشركاء', group: 'partners', scope: 'STAFF' },
  { key: 'partners.manage', nameAr: 'إنشاء الشركاء وتعديل ملفاتهم', group: 'partners', scope: 'STAFF' },
  {
    key: 'partners.approve',
    nameAr: 'اعتماد الشراكة النهائي',
    group: 'partners',
    scope: 'STAFF',
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
    nameAr: 'إدارة مرجعيات العلاقات — وسائل الإعلام وأنواع العلاقة',
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
  { key: 'audit.view', nameAr: 'الاطلاع على سجل التدقيق', group: 'system', scope: 'STAFF' },

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
