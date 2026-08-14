/**
 * بيانات التشغيل المرجعية: الجغرافيا والبرامج والمؤشرات والقوالب.
 *
 * كلها قيم ابتدائية تُحرَّر لاحقًا من الشاشات دون migration. وجودها هنا
 * يعني «من أين يبدأ النظام» لا «ما يستطيع تمثيله».
 */

export type GovernorateSeed = {
  slug: string
  nameAr: string
  nameEn: string
  centerLat: number
  centerLng: number
  /** رمز ISO في ملف الحدود، وهو ما يربط الصف بمضلّعه. */
  iso: string
}

/**
 * المحافظات السورية الأربع عشرة.
 *
 * ملف الفريق التنفيذي يذكر هدف «ألف شجرة في 13 محافظة». نبذر الأربع عشرة
 * كاملة لأن الجدول مرجع جغرافي لا قائمة أهداف؛ تحديد المحافظات المستهدفة
 * قرار يُسجَّل على المبادرة نفسها في `initiative_areas`.
 */
export const GOVERNORATE_SEEDS: readonly GovernorateSeed[] = [
  { slug: 'dimashq', nameAr: 'دمشق', nameEn: 'Damascus', centerLat: 33.5138, centerLng: 36.2765, iso: 'SYR-DI' },
  { slug: 'rif-dimashq', nameAr: 'ريف دمشق', nameEn: 'Rif Dimashq', centerLat: 33.5167, centerLng: 36.7, iso: 'SYR-RD' },
  { slug: 'halab', nameAr: 'حلب', nameEn: 'Aleppo', centerLat: 36.2021, centerLng: 37.1343, iso: 'SYR-HL' },
  { slug: 'homs', nameAr: 'حمص', nameEn: 'Homs', centerLat: 34.7324, centerLng: 36.7137, iso: 'SYR-HI' },
  { slug: 'hama', nameAr: 'حماة', nameEn: 'Hama', centerLat: 35.1318, centerLng: 36.7578, iso: 'SYR-HM' },
  { slug: 'lattakia', nameAr: 'اللاذقية', nameEn: 'Latakia', centerLat: 35.5196, centerLng: 35.7915, iso: 'SYR-LA' },
  { slug: 'tartus', nameAr: 'طرطوس', nameEn: 'Tartus', centerLat: 34.889, centerLng: 35.8866, iso: 'SYR-TA' },
  { slug: 'idlib', nameAr: 'إدلب', nameEn: 'Idlib', centerLat: 35.9306, centerLng: 36.6339, iso: 'SYR-ID' },
  { slug: 'deir-ez-zor', nameAr: 'دير الزور', nameEn: 'Deir ez-Zor', centerLat: 35.3359, centerLng: 40.1408, iso: 'SYR-DY' },
  { slug: 'raqqa', nameAr: 'الرقة', nameEn: 'Raqqa', centerLat: 35.9594, centerLng: 39.0141, iso: 'SYR-RA' },
  { slug: 'hasakah', nameAr: 'الحسكة', nameEn: 'Al-Hasakah', centerLat: 36.5024, centerLng: 40.7477, iso: 'SYR-HA' },
  { slug: 'daraa', nameAr: 'درعا', nameEn: 'Daraa', centerLat: 32.6189, centerLng: 36.1021, iso: 'SYR-DR' },
  { slug: 'suwayda', nameAr: 'السويداء', nameEn: 'As-Suwayda', centerLat: 32.7094, centerLng: 36.5694, iso: 'SYR-SU' },
  { slug: 'quneitra', nameAr: 'القنيطرة', nameEn: 'Quneitra', centerLat: 33.1256, centerLng: 35.8244, iso: 'SYR-QU' },
]

export type ProgramSeed = {
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string
  defaultTargetRollup: 'STRICT' | 'ADVISORY' | 'NONE'
  displayOrder: number
}

/**
 * برنامج واحد فقط الآن: التشجير.
 *
 * تحته نوعان من المبادرات — حملة يقودها الفريق، ونقطة خضراء ينفّذها شخص
 * أو جهة ونوثّقها — والتمييز بينهما حقل `kind` على المبادرة لا برنامج
 * مستقل، لأنهما يظهران على الخريطة نفسها ويختلفان في الثقل لا في النوع.
 *
 * «مهندسو المدن» و«فرق المدن» طريقة عملهما مختلفة كليًّا، وستُبنى لاحقًا
 * بشكلها الخاص. بذرُهما الآن كبرنامجين يوحي بأن النظام يديرهما وهو لا يفعل.
 */
export const PROGRAM_SEEDS: readonly ProgramSeed[] = [
  {
    slug: 'tree-planting',
    nameAr: 'التشجير',
    nameEn: 'Tree Planting',
    descriptionAr:
      'حملات التشجير وإحياء المساحات الخضراء، والنقاط الخضراء التي ينفّذها الأفراد والمؤسسات وتُوثَّق ضمن الشبكة.',
    // أهداف الحملات موزَّعة على المواقع بدقة، فالمطابقة صارمة. والنقطة
    // الخضراء تُنشأ بسياسة NONE لأنها توثيق لا خطة.
    defaultTargetRollup: 'STRICT',
    displayOrder: 10,
  },
]

export type MetricSeed = {
  slug: string
  nameAr: string
  nameEn: string
  unitAr: string
  aggregation: 'SUM' | 'MAX' | 'LATEST'
  decimals: number
  descriptionAr?: string
  displayOrder: number
}

/**
 * كتالوج المؤشرات الأول.
 *
 * لاحظ اختلاف طرق التجميع: الأشجار المزروعة تُجمع، بينما «الشجرة الحيّة»
 * قياسٌ يُعاد كل موسم فيؤخذ الأحدث لا مجموع القياسات — جمعها يضاعف
 * الرقم مع كل جولة حصر.
 */
export const METRIC_SEEDS: readonly MetricSeed[] = [
  {
    slug: 'trees-planted',
    nameAr: 'شجرة مزروعة',
    nameEn: 'Trees planted',
    unitAr: 'شجرة',
    aggregation: 'SUM',
    decimals: 0,
    displayOrder: 10,
  },
  {
    slug: 'saplings-planted',
    nameAr: 'شتلة مزروعة',
    nameEn: 'Saplings planted',
    unitAr: 'شتلة',
    aggregation: 'SUM',
    decimals: 0,
    displayOrder: 20,
  },
  {
    slug: 'trees-surviving',
    nameAr: 'شجرة حيّة',
    nameEn: 'Surviving trees',
    unitAr: 'شجرة',
    aggregation: 'LATEST',
    decimals: 0,
    descriptionAr:
      'نتيجة آخر جولة حصر لا مجموع الجولات — الجمع يضاعف الرقم مع كل قياس.',
    displayOrder: 30,
  },
  {
    slug: 'volunteers-participated',
    nameAr: 'متطوع مشارك',
    nameEn: 'Volunteers participated',
    unitAr: 'متطوع',
    aggregation: 'SUM',
    decimals: 0,
    displayOrder: 40,
  },
  {
    slug: 'volunteer-hours',
    nameAr: 'ساعة تطوع',
    nameEn: 'Volunteer hours',
    unitAr: 'ساعة',
    aggregation: 'SUM',
    decimals: 1,
    displayOrder: 50,
  },
  {
    slug: 'green-area',
    nameAr: 'مساحة خضراء مُحياة',
    nameEn: 'Green area restored',
    unitAr: 'م²',
    aggregation: 'SUM',
    decimals: 2,
    displayOrder: 60,
  },
]

export type TemplateSeed = {
  titleAr: string
  descriptionAr?: string
  dueOffsetDays: number
  officeSlug?: string
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  tasks?: readonly Omit<TemplateSeed, 'tasks'>[]
}

/**
 * خطة تشغيل حملة تشجير — تُكتب مرة وتبدأ بها كل حملة جاهزة.
 *
 * `dueOffsetDays` إزاحة عن تاريخ بدء المبادرة: السالب تحضير قبل الموسم،
 * والموجب متابعة بعده. القالب لا يحمل تواريخ مطلقة تتقادم.
 */
export const TREE_PLANTING_TEMPLATE: readonly TemplateSeed[] = [
  {
    titleAr: 'التحضير والتنسيق',
    dueOffsetDays: -30,
    officeSlug: 'operations',
    tasks: [
      {
        titleAr: 'تحديد مواقع التنفيذ والحصول على الموافقات المحلية',
        dueOffsetDays: -30,
        officeSlug: 'operations',
        priority: 'HIGH',
      },
      {
        titleAr: 'تأمين الشتلات والمستلزمات',
        dueOffsetDays: -21,
        officeSlug: 'operations',
        priority: 'HIGH',
      },
      {
        titleAr: 'التنسيق مع الشركاء المنفذين',
        dueOffsetDays: -21,
        officeSlug: 'relations',
      },
    ],
  },
  {
    titleAr: 'الحشد والإعلام',
    dueOffsetDays: -14,
    officeSlug: 'media',
    tasks: [
      {
        titleAr: 'إطلاق الحملة الإعلامية',
        dueOffsetDays: -14,
        officeSlug: 'media',
      },
      {
        titleAr: 'فتح تسجيل المتطوعين',
        dueOffsetDays: -10,
        officeSlug: 'operations',
      },
    ],
  },
  {
    titleAr: 'التنفيذ الميداني',
    dueOffsetDays: 0,
    officeSlug: 'operations',
    tasks: [
      {
        titleAr: 'يوم الزراعة',
        dueOffsetDays: 0,
        officeSlug: 'operations',
        priority: 'URGENT',
      },
      {
        titleAr: 'توثيق الصور قبل وبعد',
        dueOffsetDays: 1,
        officeSlug: 'media',
      },
    ],
  },
  {
    titleAr: 'المتابعة والري',
    dueOffsetDays: 30,
    officeSlug: 'operations',
    tasks: [
      {
        titleAr: 'جدولة الري والمتابعة الدورية',
        dueOffsetDays: 7,
        officeSlug: 'operations',
      },
      {
        titleAr: 'حصر نسبة الأشجار الحيّة',
        dueOffsetDays: 60,
        officeSlug: 'operations',
      },
    ],
  },
  {
    titleAr: 'التقرير والأثر',
    dueOffsetDays: 45,
    officeSlug: 'admin-finance',
    tasks: [
      {
        titleAr: 'تسجيل قيود الأثر النهائية',
        dueOffsetDays: 45,
        officeSlug: 'operations',
      },
      {
        titleAr: 'إعداد تقرير الحملة للشركاء',
        dueOffsetDays: 50,
        officeSlug: 'admin-finance',
      },
    ],
  },
]
