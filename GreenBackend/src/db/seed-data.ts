import {
  type Capability,
  STAFF_CAPABILITIES,
} from '../modules/access/capabilities.js'

/**
 * بيانات البذرة الأولى — الهيكل التنظيمي كما ورد في ملف GCT ومحضر 02-08.
 *
 * هذه قيم ابتدائية لا ثوابت نظام: تُحرَّر لاحقًا من شاشات المكاتب
 * والأدوار دون migration. وجودها هنا يعني «من أين يبدأ النظام» لا
 * «ما يستطيع النظام تمثيله».
 */

export type OfficeSeed = {
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string
  displayOrder: number
  parentSlug?: string
}

export const OFFICE_SEEDS: readonly OfficeSeed[] = [
  {
    slug: 'general-admin',
    nameAr: 'الإدارة العامة',
    nameEn: 'General Administration',
    descriptionAr: 'قيادة المشروع والقرارات الاستراتيجية واعتماد الشراكات.',
    displayOrder: 10,
  },
  {
    slug: 'relations',
    nameAr: 'مكتب العلاقات والشراكات',
    nameEn: 'Relations & Partnerships',
    descriptionAr: 'بناء العلاقات مع الشركاء والجهات الداعمة ومتابعة الاتفاقيات.',
    displayOrder: 20,
  },
  {
    slug: 'operations',
    nameAr: 'مكتب العمليات والتوسع',
    nameEn: 'Operations & Expansion',
    descriptionAr: 'إدارة تنفيذ المبادرات والفرق الميدانية ومتابعة التنفيذ.',
    displayOrder: 30,
  },
  // القسمان الفرعيان وردا في المحضر: «تنظيم عمل قسمي الهندسات والتنفيذ».
  {
    slug: 'operations-engineering',
    nameAr: 'قسم الهندسات',
    nameEn: 'Engineering Unit',
    descriptionAr: 'التصاميم والتصورات الهندسية للحدائق والساحات ومداخل المدن.',
    displayOrder: 31,
    parentSlug: 'operations',
  },
  {
    slug: 'operations-execution',
    nameAr: 'قسم التنفيذ',
    nameEn: 'Execution Unit',
    descriptionAr: 'التنفيذ الميداني في مواقع المبادرات.',
    displayOrder: 32,
    parentSlug: 'operations',
  },
  {
    slug: 'admin-finance',
    nameAr: 'مكتب الإدارة والمالية',
    nameEn: 'Administration & Finance',
    descriptionAr: 'الموارد والوثائق والمالية وتنسيق الاجتماعات ومحاضرها.',
    displayOrder: 40,
  },
  /**
   * مكتب مستقل لا قسم تحت `admin-finance`.
   *
   * المكتب هو وحدة الإسناد في `work_items.scope_id` و`follow_up_office_id`،
   * فجعل شؤون الفريق قسمًا فرعيًا يخلط مهامها بمهام المالية في كل تقرير.
   */
  {
    slug: 'people',
    nameAr: 'مكتب شؤون الفريق',
    nameEn: 'People & HR',
    descriptionAr:
      'استقطاب المتطوعين وفرزهم، وعضويات الفريق وأدواره، ومتابعة انتظام العمل.',
    displayOrder: 45,
  },
  {
    slug: 'media',
    nameAr: 'مكتب الإعلام والاتصال',
    nameEn: 'Media & Communication',
    descriptionAr: 'الهوية الإعلامية والمحتوى والنشر والتوثيق.',
    displayOrder: 50,
  },
  {
    slug: 'tech',
    nameAr: 'المكتب التقني',
    nameEn: 'Technology Office',
    descriptionAr: 'البنية الرقمية والأنظمة وقواعد البيانات والدعم التقني لجميع المكاتب.',
    displayOrder: 60,
  },
]

export type RoleSeed = {
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string
  scope: 'STAFF' | 'PARTNER'
  displayOrder: number
  /** `null` تعني «كل قدرات الفريق»، وتُزامَن مع الكتالوج في كل تشغيل. */
  capabilities: readonly Capability[] | null
}

export const ROLE_SEEDS: readonly RoleSeed[] = [
  {
    slug: 'GENERAL_ADMIN',
    nameAr: 'المدير العام',
    nameEn: 'General Director',
    descriptionAr:
      'كل الصلاحيات. الاعتماد النهائي للشراكات محصور به وحده حسب المحضر.',
    scope: 'STAFF',
    displayOrder: 10,
    capabilities: null,
  },
  {
    slug: 'RELATIONSHIPS',
    nameAr: 'مسؤول العلاقات والشراكات',
    nameEn: 'Relations Lead',
    descriptionAr:
      'يجهّز ملف الشراكة ويتابع الاتفاقيات والموافقات — دون اعتمادها نهائيًا.',
    scope: 'STAFF',
    displayOrder: 20,
    capabilities: [
      'partners.view',
      'partners.manage',
      'partners.consent.manage',
      'partners.notes.view',
      'media.view',
      'media.manage',
      'media.notes.view',
      // مفردات التصنيف يكتبها من يستعملها يوميًا، لا المدير العام.
      'relations.taxonomy.manage',
      'charter.acknowledgements.record',
      'documents.confidential.view',
      'contributions.view',
      'initiatives.view',
      'work.view',
      'meetings.manage',
      'files.upload',
      'reports.view',
    ],
  },
  {
    slug: 'OPERATIONS',
    nameAr: 'مسؤول العمليات والتوسع',
    nameEn: 'Operations Lead',
    descriptionAr:
      'يدير المبادرات والمواقع والمهام. اعتماد إنجاز المهام والتحقق من المساهمات محصور بالعمليات.',
    scope: 'STAFF',
    displayOrder: 30,
    capabilities: [
      'programs.manage',
      'initiatives.view',
      'initiatives.manage',
      'initiatives.launch',
      'initiatives.notes.view',
      'geo.manage',
      'work.view',
      'work.manage',
      'work.approve',
      'contributions.view',
      'contributions.manage',
      'contributions.verify',
      'impact.view',
      'impact.manage',
      'partners.view',
      'meetings.manage',
      'files.upload',
      'reports.view',
    ],
  },
  {
    slug: 'ADMIN_FINANCE',
    nameAr: 'مسؤول الإدارة والمالية',
    nameEn: 'Administration & Finance Lead',
    descriptionAr:
      'الوثائق والسجلات والقيم التقديرية ومحاضر الاجتماعات والتقارير.',
    scope: 'STAFF',
    displayOrder: 40,
    capabilities: [
      'documents.confidential.view',
      'contributions.view',
      'contributions.value.view',
      'meetings.manage',
      'partners.view',
      'initiatives.view',
      'work.view',
      'impact.view',
      'reports.view',
      'reports.manage',
      'files.upload',
      'files.manage',
    ],
  },
  {
    slug: 'PEOPLE',
    nameAr: 'مسؤول شؤون الفريق',
    nameEn: 'People Lead',
    descriptionAr:
      'دليل الفريق والعضويات والدعوات، واستقبال طلبات الانضمام وفرزها.',
    scope: 'STAFF',
    displayOrder: 45,
    capabilities: [
      'users.view',
      'users.manage',
      // مسؤول الفريق هو من يدعو المقبولين، فالدعوة أداته لا امتياز إضافي.
      'invitations.manage',
      'forms.view',
      'forms.manage',
      'forms.publish',
      'work.view',
      'work.manage',
      'meetings.manage',
      'initiatives.view',
      'reports.view',
    ],
  },
  {
    slug: 'MEDIA',
    nameAr: 'مسؤول الإعلام والاتصال',
    nameEn: 'Media Lead',
    descriptionAr: 'الهوية الإعلامية والمحتوى والتوثيق البصري للمبادرات.',
    scope: 'STAFF',
    displayOrder: 50,
    capabilities: [
      'files.upload',
      'files.manage',
      'initiatives.view',
      'work.view',
      'work.manage',
      'partners.view',
      'media.view',
      'media.manage',
      'media.notes.view',
      'impact.view',
      'reports.view',
    ],
  },
  {
    slug: 'TECH',
    nameAr: 'مسؤول القسم التقني',
    nameEn: 'Technology Lead',
    descriptionAr:
      'يدير الحسابات والأدوار والمكاتب والمؤشرات والنظام. لا يعتمد قرارات تشغيلية أو تجارية، ولا يرى القيم المالية ولا الاتفاقيات.',
    scope: 'STAFF',
    displayOrder: 60,
    capabilities: [
      'users.view',
      'users.manage',
      'invitations.manage',
      'roles.manage',
      'offices.manage',
      'audit.view',
      'metrics.manage',
      'geo.manage',
      'files.upload',
      'files.manage',
      'initiatives.view',
      'work.view',
      'partners.view',
      'impact.view',
      'reports.view',
    ],
  },
  {
    slug: 'MEMBER',
    nameAr: 'عضو فريق',
    nameEn: 'Team Member',
    descriptionAr:
      'عضو بلا منصب قيادي: يرى ما يخص عمله ويرفع الملفات دون اعتماد شيء.',
    scope: 'STAFF',
    displayOrder: 90,
    capabilities: ['initiatives.view', 'work.view', 'files.upload'],
  },

  // أدوار بوابة الشريك — تُبذَر الآن وتُستعمل مع جدول `partners` لاحقًا.
  {
    slug: 'PARTNER_ADMIN',
    nameAr: 'مسؤول الجهة الشريكة',
    nameEn: 'Partner Administrator',
    descriptionAr: 'يمثل الجهة ويدير ملفها وموافقاتها ومساهماتها.',
    scope: 'PARTNER',
    displayOrder: 10,
    capabilities: [
      'partner.profile.manage',
      'partner.consent.manage',
      'partner.work.update',
      'partner.evidence.upload',
      'partner.contributions.submit',
      'partner.impact.submit',
      'partner.reports.view',
    ],
  },
  {
    slug: 'PARTNER_CONTRIBUTOR',
    nameAr: 'مساهم من الجهة الشريكة',
    nameEn: 'Partner Contributor',
    descriptionAr: 'ينفذ المهام ويرفع الأدلة ويقدّم المساهمات دون اعتمادها.',
    scope: 'PARTNER',
    displayOrder: 20,
    capabilities: [
      'partner.work.update',
      'partner.evidence.upload',
      'partner.contributions.submit',
      'partner.impact.submit',
    ],
  },
  {
    slug: 'PARTNER_VIEWER',
    nameAr: 'مطّلع من الجهة الشريكة',
    nameEn: 'Partner Viewer',
    descriptionAr: 'اطلاع فقط على ما يخص جهته.',
    scope: 'PARTNER',
    displayOrder: 30,
    capabilities: ['partner.reports.view'],
  },
]

/**
 * قدرة جديدة تُضاف للكتالوج تصل المدير العام تلقائيًا في التشغيل التالي،
 * فلا يبقى الحساب الوحيد الذي يفترض أنه يملك كل شيء ناقصًا بصمت.
 */
export function resolveSeedCapabilities(role: RoleSeed): readonly Capability[] {
  return role.capabilities ?? STAFF_CAPABILITIES
}
