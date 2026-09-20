import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";

import { siteConfig } from "@/lib/site";

import "./globals.css";

/**
 * `next/font` يستضيف الخط ذاتيًا وقت البناء: لا طلب إلى خوادم Google وقت
 * التشغيل، فلا تسرّب لعناوين الزوار ولا قفزة تخطيط عند تحميل الخط.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  /**
   * الأساس المطلق شرط صحة روابط Open Graph وsitemap: الروابط النسبية
   * تُشارَك مكسورة على المنصات الخارجية.
   */
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  /**
   * لون واحد لأن السمة واحدة، وهو لون الشريط العلوي لا لون الصفحة: هذا ما
   * يصبغ شريط المتصفح على الهاتف، وهو ملاصق للشريط فيبدو امتدادًا له.
   *
   * و`colorScheme: "light"` ليست تكرارًا: بها يرسم المتصفح ما لا نملكه —
   * شريط التمرير، ومنتقي التاريخ، والتعبئة التلقائية في الاستمارة — فاتحًا،
   * فلا يظهر حقلٌ داكن وسط صفحة بيج عند من ضبط نظامه على الوضع الداكن.
   */
  themeColor: "#103900",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={plexArabic.variable}>
      {/*
        الجذر يحمل اللغة والاتجاه والخط فقط. القشرة — الشريط والتذييل —
        في `(site)`، وصفحة الاستمارة في `(form)` بلا قشرة.
      */}
      <body className="font-sans">{children}</body>
    </html>
  );
}
