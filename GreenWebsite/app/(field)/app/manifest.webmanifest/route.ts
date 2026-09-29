import type { MetadataRoute } from "next";

import {
  FIELD_APP_NAME,
  FIELD_APP_SHORT_NAME,
  FIELD_ROUTES,
  FIELD_SCOPE,
} from "@/lib/field/config";

export const dynamic = "force-static";

/**
 * مخطط التطبيق في نطاقه لا في جذر الموقع.
 *
 * اصطلاح Next (`app/manifest.ts`) يخدم الجذر وحده، ومخطط في الجذر يجعل
 * الموقع كله تطبيقًا: من ثبّت من صفحة الاستمارة يفتح أيقونته على الصفحة
 * الرئيسية. هنا النطاق `/app/` وحده، والمخطط مربوط من تخطيط `(field)` فقط،
 * فلا يُعرض التثبيت إلا من صفحات التطبيق.
 */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: FIELD_SCOPE,
    name: FIELD_APP_NAME,
    short_name: FIELD_APP_SHORT_NAME,
    description:
      "تطبيق قادة المجموعات والمتطوعين في حملات المدن الخضراء: ورقة اليوم، والحضور، والأعداد، والصور من الموقع.",
    lang: "ar",
    dir: "rtl",
    scope: FIELD_SCOPE,
    // الاستعلام يميّز الفتح من الأيقونة في السجلات، ولا يغيّر الصفحة.
    start_url: `${FIELD_ROUTES.home}?source=pwa`,
    display: "standalone",
    orientation: "portrait",
    // شاشة البداية: البيج خلفيةً، والأخضر العميق شريطَ حالة.
    background_color: "#fef0e7",
    theme_color: "#103900",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/app-icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
