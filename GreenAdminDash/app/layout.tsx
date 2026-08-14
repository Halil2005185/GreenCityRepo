import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";

import { AppProviders } from "@/components/providers";

import "./globals.css";

/**
 * `next/font` يستضيف الخط ذاتيًا وقت البناء: لا طلب إلى خوادم Google وقت
 * التشغيل، فلا تسرّب لعناوين المستخدمين ولا قفزة تخطيط عند تحميل الخط.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "لوحة المدن الخضراء",
    template: "%s · لوحة المدن الخضراء",
  },
  description: "نظام تشغيل المبادرات والشراكات — فريق إيفا",
  /**
   * اللوحة كلها خلف تسجيل دخول ولا قيمة لفهرستها. `noindex, nofollow`
   * على الجذر يغطي كل مسار تحتها، فلا يعتمد الأمر على تذكّر إضافتها في
   * كل صفحة جديدة.
   */
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fdfa" },
    { media: "(prefers-color-scheme: dark)", color: "#14201a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={plexArabic.variable}>
      <body className="min-h-dvh font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
