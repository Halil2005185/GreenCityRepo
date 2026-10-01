/**
 * قيم البداية لتعريفات النظام.
 *
 * نقطة انطلاق لا قائمة نهائية: الفريق يضيف ويعطّل ويعيد التسمية من
 * «الإعدادات ← تعريفات النظام» دون migration. لذلك تُبذر قيم التعريف حين
 * يُنشأ التعريف نفسه فقط — لو أُدرج الناقص في كل نشر لعادت قيمة حذفها
 * الفريق قصدًا في النشر التالي.
 *
 * الرموز المنقولة من enums هي قيم الـenum نفسها، وعليها بُني ترحيل البيانات
 * في `drizzle/*_system_lookups`. والمنقولة من مرجعيتي العلاقات هي الـslug
 * القديم بأحرف كبيرة وشرطة سفلية.
 */

export type LookupSeed = {
  code: string
  nameAr: string
  nameEn?: string
  descriptionAr?: string
}

export const ORGANIZATION_KIND_SEEDS: readonly LookupSeed[] = [
  { code: 'COMPANY', nameAr: 'شركة', nameEn: 'Company' },
  { code: 'NGO', nameAr: 'جمعية أو منظمة أهلية', nameEn: 'NGO' },
  { code: 'GOVERNMENT', nameAr: 'جهة حكومية أو بلدية', nameEn: 'Government' },
  { code: 'ACADEMIC', nameAr: 'جهة أكاديمية', nameEn: 'Academic' },
  { code: 'VOLUNTEER_TEAM', nameAr: 'فريق تطوعي', nameEn: 'Volunteer team' },
  {
    code: 'COMMUNITY_INITIATIVE',
    nameAr: 'مبادرة مجتمعية',
    nameEn: 'Community initiative',
  },
  { code: 'DONOR', nameAr: 'جهة مانحة', nameEn: 'Donor' },
  { code: 'INDIVIDUAL', nameAr: 'فرد', nameEn: 'Individual' },
  { code: 'OTHER', nameAr: 'أخرى', nameEn: 'Other' },
]

/** أشكال المشاركة والدعم السبعة كما وردت في الميثاق. */
export const SUPPORT_FORM_SEEDS: readonly LookupSeed[] = [
  { code: 'MORAL_MEDIA', nameAr: 'الدعم المعنوي والإعلامي' },
  { code: 'COMMUNITY_VOLUNTEERING', nameAr: 'المشاركة المجتمعية والتطوعية' },
  { code: 'SPONSORSHIP_LOGISTICS', nameAr: 'الرعاية أو الدعم اللوجستي' },
  {
    code: 'TECHNICAL_ACADEMIC_EXPERTISE',
    nameAr: 'تقديم الخبرات الفنية أو الأكاديمية',
  },
  { code: 'ENVIRONMENTAL_AWARENESS', nameAr: 'دعم الأنشطة البيئية والتوعوية' },
  {
    code: 'INTERNAL_SUSTAINABILITY',
    nameAr: 'تبني مبادرات استدامة داخل المؤسسة',
  },
  { code: 'SPACES_AND_RESOURCES', nameAr: 'توفير مساحات أو موارد' },
]

/** الترتيب هنا ترتيب الأهمية، وعليه يُفرز دفتر الإعلاميين. */
export const CONTACT_PRIORITY_SEEDS: readonly LookupSeed[] = [
  { code: 'HIGH', nameAr: 'عالية', nameEn: 'High' },
  { code: 'MEDIUM', nameAr: 'متوسطة', nameEn: 'Medium' },
  { code: 'LOW', nameAr: 'منخفضة', nameEn: 'Low' },
]

export const ENGAGEMENT_HORIZON_SEEDS: readonly LookupSeed[] = [
  { code: 'LONG_TERM', nameAr: 'مدى طويل', nameEn: 'Long term' },
  { code: 'SHORT_TERM', nameAr: 'مدى قصير', nameEn: 'Short term' },
  { code: 'ONE_OFF', nameAr: 'تعاون لمرة', nameEn: 'One-off' },
]

export const INTERACTION_KIND_SEEDS: readonly LookupSeed[] = [
  { code: 'CALL', nameAr: 'مكالمة', nameEn: 'Call' },
  { code: 'MESSAGE', nameAr: 'رسالة', nameEn: 'Message' },
  { code: 'EMAIL', nameAr: 'بريد', nameEn: 'Email' },
  { code: 'MEETING', nameAr: 'اجتماع', nameEn: 'Meeting' },
  { code: 'NOTE', nameAr: 'ملاحظة', nameEn: 'Note' },
  { code: 'DOCUMENT_REQUEST', nameAr: 'طلب مستند', nameEn: 'Document request' },
  { code: 'STAGE_CHANGE', nameAr: 'تغيير مرحلة', nameEn: 'Stage change' },
]

export const ACKNOWLEDGEMENT_METHOD_SEEDS: readonly LookupSeed[] = [
  { code: 'IN_PERSON', nameAr: 'حضوريًا', nameEn: 'In person' },
  { code: 'EMAIL', nameAr: 'بالبريد الإلكتروني', nameEn: 'Email' },
  { code: 'PORTAL', nameAr: 'عبر البوابة', nameEn: 'Portal' },
  { code: 'DOCUMENT', nameAr: 'بمستند موقّع', nameEn: 'Signed document' },
]

export const CONTRIBUTOR_KIND_SEEDS: readonly LookupSeed[] = [
  { code: 'INDIVIDUAL', nameAr: 'فرد', nameEn: 'Individual' },
  { code: 'COMPANY', nameAr: 'شركة', nameEn: 'Company' },
  { code: 'INSTITUTION', nameAr: 'مؤسسة', nameEn: 'Institution' },
  { code: 'SCHOOL', nameAr: 'مدرسة أو جامعة', nameEn: 'School or university' },
  { code: 'VOLUNTEER_TEAM', nameAr: 'فريق تطوعي', nameEn: 'Volunteer team' },
  { code: 'OTHER', nameAr: 'أخرى', nameEn: 'Other' },
]

/**
 * مفردات مكتب العلاقات. الأمثلة التي ذكرها المكتب — «هاد بشتغل سؤال
 * شارع» — موجودة هنا حرفيًا لأنها لغته هو، والتصنيف الذي لا يُسمّى بلغة
 * مستعمِله لا يُستعمل.
 */
export const MEDIA_CHANNEL_SEEDS: readonly LookupSeed[] = [
  {
    code: 'STREET_INTERVIEW',
    nameAr: 'سؤال شارع',
    nameEn: 'Street interviews',
    descriptionAr: 'مقابلات ميدانية قصيرة مع المارّة في الشارع.',
  },
  {
    code: 'REPORTAGE',
    nameAr: 'ريبورتاج وتقارير ميدانية',
    nameEn: 'Reportage',
    descriptionAr: 'تقرير مصوّر من الموقع يجمع مشاهد ومقابلات وتعليقًا.',
  },
  {
    code: 'SHORT_CONTENT',
    nameAr: 'محتوى قصير (ريلز وتيك توك)',
    nameEn: 'Short-form content',
  },
  { code: 'PODCAST', nameAr: 'بودكاست وحوارات', nameEn: 'Podcast' },
  { code: 'PHOTOGRAPHY', nameAr: 'تصوير فوتوغرافي', nameEn: 'Photography' },
  { code: 'VIDEOGRAPHY', nameAr: 'تصوير وإنتاج مرئي', nameEn: 'Videography' },
  { code: 'EDITING', nameAr: 'مونتاج وإخراج', nameEn: 'Editing' },
  { code: 'DESIGN', nameAr: 'تصميم جرافيك وموشن', nameEn: 'Design & motion' },
  {
    code: 'PRESS_WRITING',
    nameAr: 'صحافة مكتوبة ومقالات',
    nameEn: 'Press writing',
  },
  { code: 'TV_RADIO', nameAr: 'تلفزيون وإذاعة', nameEn: 'TV & radio' },
  {
    code: 'SOCIAL_PAGE',
    nameAr: 'صفحة أو حساب تواصل اجتماعي',
    nameEn: 'Social page',
    descriptionAr: 'من يملك جمهورًا على منصة بعينها وينشر عليها.',
  },
  { code: 'VOICEOVER', nameAr: 'تعليق صوتي', nameEn: 'Voice-over' },
]

export const RELATIONSHIP_TYPE_SEEDS: readonly LookupSeed[] = [
  {
    code: 'VOLUNTEER',
    nameAr: 'تعاون تطوعي',
    nameEn: 'Volunteer collaboration',
    descriptionAr: 'يعمل معنا دون مقابل، انطلاقًا من قناعته بالمشروع.',
  },
  {
    code: 'COVERAGE',
    nameAr: 'تغطية إعلامية',
    nameEn: 'Media coverage',
    descriptionAr: 'يغطّي فعالياتنا وينشر عنها عبر منصّته.',
  },
  {
    code: 'BARTER',
    nameAr: 'تبادل منفعة',
    nameEn: 'Barter',
    descriptionAr: 'خدمة مقابل خدمة أو ظهور مقابل محتوى.',
  },
  { code: 'PAID', nameAr: 'تعاون مدفوع', nameEn: 'Paid engagement' },
  {
    code: 'HOSTING',
    nameAr: 'استضافة',
    nameEn: 'Hosting',
    descriptionAr: 'يستضيف فريقنا في برنامجه أو مساحته.',
  },
  { code: 'ADVISORY', nameAr: 'استشارة وتوجيه', nameEn: 'Advisory' },
  {
    code: 'INSTITUTIONAL',
    nameAr: 'علاقة مؤسسية',
    nameEn: 'Institutional',
    descriptionAr: 'العلاقة مع الجهة لا مع الشخص، وتبقى بعد تغيّر ممثّلها.',
  },
  {
    code: 'PERSONAL',
    nameAr: 'علاقة شخصية',
    nameEn: 'Personal',
    descriptionAr: 'معرفة شخصية بأحد أعضاء الفريق تُبنى عليها الثقة.',
  },
]
