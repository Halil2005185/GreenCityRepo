import Link from "next/link";

import { Logo } from "@/components/layout/logo";

/**
 * صفحة الاستمارة وحدها: الشعار ثم الاستمارة، بلا شريط تنقّل ولا تذييل.
 *
 * مَن فتح رابط تسجيل جاء ليملأ استمارة لا ليتصفّح، وكل رابط مغادرة على
 * الشاشة يزيد احتمال ألا يُكملها. ويبقى الشعار وحده — لأن استمارةً بلا
 * هوية تُقرأ صيدًا للبيانات لا دعوةً من جهة معروفة — وهو رابط إلى الموقع
 * لمن أراد أن يتأكد ممن يسأله.
 */
export default function FormLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo className="h-8" />
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
