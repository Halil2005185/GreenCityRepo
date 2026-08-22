/**
 * ثوابت الهوية والتنقّل. ما هنا نصّ تحريري ثابت لا بيانات تشغيل:
 * المبادرات والبرامج والمؤشرات كلها من الـAPI، والقاعدة في PLAN.md
 * تمنع كتابة اسم مبادرة أو رقم هدف أو اسم مؤشر في الكود.
 */

export const siteConfig = {
  name: "المدن الخضراء",
  nameEn: "Green Cities",
  tagline: "نعيد الحياة للمدن",
  description:
    "مبادرة مجتمعية بيئية يقودها فريق إيفا لإعادة إحياء الغطاء النباتي في المدن السورية عبر شبكة من الشركاء والفرق الشبابية.",
  /**
   * يُقرأ وقت البناء لتوليد الروابط المطلقة في `sitemap.xml` وبطاقات
   * المشاركة. لا بد من ضبطه في الإنتاج وإلا صدرت روابط localhost.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
  locale: "ar_SY",
} as const;

/**
 * قنوات التواصل. المتروك فارغًا لا يُعرض إطلاقًا — عنوان بريد أو حساب
 * مخترَع أسوأ من غيابه، لأن الزائر يراسله ولا يصله جواب.
 *
 * TODO: املأ القيم الرسمية قبل الإطلاق.
 */
export type ContactChannels = {
  email: string;
  phone: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  x: string;
};

export const contactChannels: ContactChannels = {
  email: "",
  phone: "",
  facebook: "",
  instagram: "",
  linkedin: "",
  x: "",
};

export type NavItem = { href: string; label: string };

/** روابط الشريط العلوي. الدعوة إلى الانضمام زر مستقل لا عنصر قائمة. */
export const mainNav: NavItem[] = [
  { href: "/about", label: "عن المشروع" },
  { href: "/programs", label: "البرامج" },
  { href: "/initiatives", label: "المبادرات" },
  { href: "/impact", label: "الأثر" },
  { href: "/partners", label: "الشركاء" },
  { href: "/contact", label: "تواصل" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "المشروع",
    items: [
      { href: "/about", label: "عن المشروع" },
      { href: "/programs", label: "البرامج" },
      { href: "/initiatives", label: "المبادرات" },
      { href: "/impact", label: "الأثر وقياسه" },
    ],
  },
  {
    title: "المشاركة",
    items: [
      { href: "/partners", label: "الشراكات" },
      { href: "/join", label: "انضم إلينا" },
      { href: "/contact", label: "تواصل معنا" },
    ],
  },
];
