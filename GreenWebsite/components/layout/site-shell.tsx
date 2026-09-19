import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { BackToTop } from "@/components/ui/back-to-top";

/**
 * قشرة الموقع: شريط التنقّل والتذييل وما بينهما.
 *
 * مكوّن لا تخطيط، لأن مَن يحتاجها اثنان لا واحد: تخطيط `(site)`، وصفحة
 * «غير موجود» في الجذر — وتلك تقع خارج كل مجموعة، فلا يصلها تخطيط
 * `(site)` ولو كان الشكل واحدًا.
 *
 * وليست في تخطيط الجذر لأن صفحة الاستمارة تعيش بلا قشرة: مَن فتح رابط
 * تسجيل جاء ليملأ استمارة لا ليتصفّح، والشريط والتذييل يعرضان عليه سبعة
 * مسارات للمغادرة قبل أن يبدأ.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* أول ما يصله التركيز: تخطّي شريط التنقل إلى المحتوى. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        تخطَّ إلى المحتوى
      </a>

      <SiteHeader />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />

      {/* هنا مرة واحدة لا في كل صفحة — القشرة هي ما يعلو الصفحات جميعًا. */}
      <BackToTop />
    </div>
  );
}
