import type { Metadata, Viewport } from "next";

import { FieldRoot } from "@/components/field/field-root";
import {
  FIELD_APP_NAME,
  FIELD_APP_SHORT_NAME,
  FIELD_ROUTES,
  FIELD_SCOPE,
} from "@/lib/field/config";

/**
 * مجموعة التطبيق الميداني: كل ما تحت `/app`.
 *
 * مجموعة ثالثة بجانب `(site)` و`(form)` لأن قشرتها غير قشرتيهما، ولأن ما
 * يخصها — المخطط، وعامل الخدمة، ومقاس العرض الذي يغطي حواف الجهاز — يجب
 * ألا يصل صفحة من الموقع. المخطط مربوط من هنا وحده: من ثبّت من صفحة خارج
 * هذه المجموعة لا يثبّت شيئًا، فلا مخطط هناك.
 */
export const metadata: Metadata = {
  title: {
    default: FIELD_APP_NAME,
    template: `%s · ${FIELD_APP_SHORT_NAME}`,
  },
  description:
    "تطبيق قادة المجموعات والمتطوعين في حملات المدن الخضراء. يُفتح من الهاتف في موقع التنفيذ.",
  applicationName: FIELD_APP_NAME,
  manifest: `${FIELD_SCOPE}manifest.webmanifest`,
  /**
   * iOS لا يقرأ من المخطط كل شيء: بهذه الوسوم يُفتح المثبَّت من Safari بلا
   * شريط عنوان، وبشريط حالة يمتد تحته رأس التطبيق الأخضر.
   */
  appleWebApp: {
    capable: true,
    title: FIELD_APP_SHORT_NAME,
    statusBarStyle: "black-translucent",
  },
  // أداة عمل خلف دخول، لا صفحة تُفهرَس.
  robots: { index: false, follow: false },
  alternates: { canonical: FIELD_ROUTES.home },
};

export const viewport: Viewport = {
  themeColor: "#103900",
  colorScheme: "light",
  /**
   * `cover` يمدّ الصفحة تحت نتوء الشاشة وشريط الإيماءات، فيبلغ رأس التطبيق
   * وشريط تبويبه الحافتين؛ والحشو بـ`safe-area-inset-*` يبقي المحتوى خارجهما.
   */
  viewportFit: "cover",
};

export default function FieldLayout({ children }: LayoutProps<"/">) {
  return <FieldRoot>{children}</FieldRoot>;
}
