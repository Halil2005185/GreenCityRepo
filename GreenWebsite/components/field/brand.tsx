import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * شعار رأس التطبيق في المتصفح: رمز الهوية واسم المشروع بالعربية.
 *
 * مكوّن للتطبيق لا شعار الموقع: رأس الموقع لوحة مرسومة يعلوها شعار فاتح،
 * ورأس التطبيق سطح فاتح يُقرأ في الشمس — الشعار الفاتح عليه لا يُرى. والرمز
 * هنا قناع CSS (`brand-logo` في `globals.css`) يأخذ لونه من `--logo`، فيبقى
 * حادًّا عند أي كثافة، ولا يمرّ بمحسِّن الصور فيُحفظ مع القشرة ويظهر بلا
 * شبكة.
 */
export function FieldBrand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span aria-hidden className="brand-logo h-8" />
      <span className="text-base font-bold tracking-tight text-foreground">
        {siteConfig.name}
      </span>
    </span>
  );
}
