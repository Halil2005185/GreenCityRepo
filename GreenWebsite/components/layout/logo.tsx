import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * رمز الهوية (Symbol) كما اعتمده مكتب الإعلام.
 *
 * الملف المُسلَّم نقطي لا مسار متجهي، وإعادة رسمه يدويًا تُنتج «نسخة غير
 * معتمدة» يمنعها دليل الهوية صراحةً. لذلك يُستعمل الملف الأصلي قناعًا
 * (`mask`) في `globals.css` وتأتي التعبئة من CSS: صورة واحدة تخدم كل
 * السياقات، وشكل الرمز يبقى كما سُلّم بالبكسل.
 *
 * الارتفاع مطلوب في موضع الاستعمال — العنصر `span` لا صورة، فبلا ارتفاع
 * ينهار إلى صفر. والعرض يشتقّه `aspect-ratio` من أبعاد الملف.
 *
 * `aria-hidden` لأن الرمز لا يظهر إلا بجانب اسم المشروع مكتوبًا، فقراءته
 * مرتين تشويش على قارئ الشاشة.
 */
export function Logo({ className }: { className?: string }) {
  return <span aria-hidden className={cn("brand-logo", className)} />;
}

/**
 * الشعار الكامل: الرمز واسم المشروع.
 *
 * التصميم المُسلَّم يضع هنا ملف `logo.png` — الشعار الإنجليزي جاهزًا. لم
 * يُعتمد لسببين: عرضه 200 بكسل بهوامشه، فيظهر طريًا على شاشة مضاعفة
 * الكثافة عند الحجم المطلوب؛ وهو إنجليزي في موقع عربي يسمّي نفسه «المدن
 * الخضراء» في كل صفحة. والبديل هنا بنية «Primary» نفسها في دليل الهوية —
 * رمزٌ واسم — لكن بقناع 452×512 يبقى حادًّا عند أي حجم، وباسمٍ عربي.
 */
export function BrandLockup({
  className,
  symbolClassName,
}: {
  className?: string;
  symbolClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo className={cn("h-8", symbolClassName)} />
      <span className="text-base font-bold tracking-tight text-foreground">
        {siteConfig.name}
      </span>
    </span>
  );
}
