/**
 * مفردات البداية لمرجعيات مكتب العلاقات.
 *
 * نقطة انطلاق لا قائمة نهائية: المكتب يضيف ويعطّل من شاشة المرجعيات دون
 * migration، وهذا ما يميّزها عن أنواع الشراكة الخمس المجمّدة في الكود
 * لأنها نصّ الميثاق.
 *
 * الأمثلة التي ذكرها المكتب — «هاد بشتغل سؤال شارع» — موجودة هنا حرفيًا
 * لأنها لغته هو، والتصنيف الذي لا يُسمّى بلغة مستعمِله لا يُستعمل.
 */

export type CatalogSeed = {
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr?: string
  displayOrder: number
}

export const MEDIA_CHANNEL_SEEDS: readonly CatalogSeed[] = [
  {
    slug: 'street-interview',
    nameAr: 'سؤال شارع',
    nameEn: 'Street interviews',
    descriptionAr: 'مقابلات ميدانية قصيرة مع المارّة في الشارع.',
    displayOrder: 10,
  },
  {
    slug: 'reportage',
    nameAr: 'ريبورتاج وتقارير ميدانية',
    nameEn: 'Reportage',
    descriptionAr: 'تقرير مصوّر من الموقع يجمع مشاهد ومقابلات وتعليقًا.',
    displayOrder: 20,
  },
  {
    slug: 'short-content',
    nameAr: 'محتوى قصير (ريلز وتيك توك)',
    nameEn: 'Short-form content',
    displayOrder: 30,
  },
  {
    slug: 'podcast',
    nameAr: 'بودكاست وحوارات',
    nameEn: 'Podcast',
    displayOrder: 40,
  },
  {
    slug: 'photography',
    nameAr: 'تصوير فوتوغرافي',
    nameEn: 'Photography',
    displayOrder: 50,
  },
  {
    slug: 'videography',
    nameAr: 'تصوير وإنتاج مرئي',
    nameEn: 'Videography',
    displayOrder: 60,
  },
  {
    slug: 'editing',
    nameAr: 'مونتاج وإخراج',
    nameEn: 'Editing',
    displayOrder: 70,
  },
  {
    slug: 'design',
    nameAr: 'تصميم جرافيك وموشن',
    nameEn: 'Design & motion',
    displayOrder: 80,
  },
  {
    slug: 'press-writing',
    nameAr: 'صحافة مكتوبة ومقالات',
    nameEn: 'Press writing',
    displayOrder: 90,
  },
  {
    slug: 'tv-radio',
    nameAr: 'تلفزيون وإذاعة',
    nameEn: 'TV & radio',
    displayOrder: 100,
  },
  {
    slug: 'social-page',
    nameAr: 'صفحة أو حساب تواصل اجتماعي',
    nameEn: 'Social page',
    descriptionAr: 'من يملك جمهورًا على منصة بعينها وينشر عليها.',
    displayOrder: 110,
  },
  {
    slug: 'voiceover',
    nameAr: 'تعليق صوتي',
    nameEn: 'Voice-over',
    displayOrder: 120,
  },
]

export const RELATIONSHIP_TYPE_SEEDS: readonly CatalogSeed[] = [
  {
    slug: 'volunteer',
    nameAr: 'تعاون تطوعي',
    nameEn: 'Volunteer collaboration',
    descriptionAr: 'يعمل معنا دون مقابل، انطلاقًا من قناعته بالمشروع.',
    displayOrder: 10,
  },
  {
    slug: 'coverage',
    nameAr: 'تغطية إعلامية',
    nameEn: 'Media coverage',
    descriptionAr: 'يغطّي فعالياتنا وينشر عنها عبر منصّته.',
    displayOrder: 20,
  },
  {
    slug: 'barter',
    nameAr: 'تبادل منفعة',
    nameEn: 'Barter',
    descriptionAr: 'خدمة مقابل خدمة أو ظهور مقابل محتوى.',
    displayOrder: 30,
  },
  {
    slug: 'paid',
    nameAr: 'تعاون مدفوع',
    nameEn: 'Paid engagement',
    displayOrder: 40,
  },
  {
    slug: 'hosting',
    nameAr: 'استضافة',
    nameEn: 'Hosting',
    descriptionAr: 'يستضيف فريقنا في برنامجه أو مساحته.',
    displayOrder: 50,
  },
  {
    slug: 'advisory',
    nameAr: 'استشارة وتوجيه',
    nameEn: 'Advisory',
    displayOrder: 60,
  },
  {
    slug: 'institutional',
    nameAr: 'علاقة مؤسسية',
    nameEn: 'Institutional',
    descriptionAr: 'العلاقة مع الجهة لا مع الشخص، وتبقى بعد تغيّر ممثّلها.',
    displayOrder: 70,
  },
  {
    slug: 'personal',
    nameAr: 'علاقة شخصية',
    nameEn: 'Personal',
    descriptionAr: 'معرفة شخصية بأحد أعضاء الفريق تُبنى عليها الثقة.',
    displayOrder: 80,
  },
]
