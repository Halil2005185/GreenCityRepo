import type { NextConfig } from "next";

/**
 * عنوان الـAPI في التطوير. في الإنتاج يوجّه Nginx `/api` إلى Express على
 * الأصل نفسه، فلا يُستعمل هذا المتغير.
 */
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  // صورة نشر مستقلة لا تحمل node_modules كاملة داخل حاوية Docker.
  output: "standalone",

  /**
   * ملفات `*.dev.tsx` صفحات في التطوير وحده (صفحة عرض المكوّنات
   * `/dashboard/kit`). في البناء الإنتاجي لا يعرفها Next أصلًا، فالمسار
   * يعيد 404 حقيقية وكودها خارج الحزمة. `notFound()` داخل الصفحة لا يكفي:
   * `AppShell` لا يرسم الصفحة على الخادم، فكانت تصل «غير موجودة» بحالة 200.
   */
  pageExtensions:
    process.env.NODE_ENV === "production"
      ? ["tsx", "ts", "jsx", "js"]
      : ["dev.tsx", "tsx", "ts", "jsx", "js"],

  /**
   * يجعل اللوحة والـAPI على أصل واحد أثناء التطوير.
   *
   * هذا ليس ترفًا: كوكي التحديث `SameSite=Strict` لا يُرسل عبر الأصول،
   * فبدون هذا التمرير لا تعمل الجلسة محليًا أصلًا. وهو أيضًا ما يلغي
   * الحاجة إلى CORS ويبقي عنوان الـAPI خارج المتصفح.
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // طبقة ثانية بعد `robots` في الميتاداتا: هذه تغطي الاستجابات
          // غير الـHTML أيضًا، وتلك لا تصل إليها.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
