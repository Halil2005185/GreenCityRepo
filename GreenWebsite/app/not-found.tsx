import { SiteShell } from "@/components/layout/site-shell";
import { NotFoundContent } from "@/components/sections/not-found-content";

/**
 * صفحة «غير موجود» في الجذر: هي ما يصله كل رابط لا يطابق مسارًا أصلًا.
 *
 * وجودها ليس تكرارًا لِـ`(site)/not-found.tsx`: تلك تخدم `notFound()`
 * المستدعاة داخل المجموعة وحدها، والرابط المكسور لا يدخل أي مجموعة فلا
 * تصله. بدون هذا الملف يعرض Next صفحته الافتراضية — بالإنجليزية، وبلا
 * شريط ولا تذييل، وبألوان تتبع سمة نظام التشغيل لا سمة الموقع.
 *
 * القشرة تُستدعى هنا صراحةً لأن تخطيط `(site)` لا يعلو هذا الملف.
 */
export default function NotFound() {
  return (
    <SiteShell>
      <NotFoundContent />
    </SiteShell>
  );
}
