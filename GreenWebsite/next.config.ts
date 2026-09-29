import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * بلا `output: "standalone"`.
   *
   * وُضع حين كان النشر مزمعًا في حاوية Docker، والموقع اليوم على Vercel
   * وهي تبني مخرجاتها بنفسها. تركه يعني مسار بناء ثانيًا لا يستعمله أحد،
   * وقد ظهر مع وجوده فشل في `onBuildComplete` عن ملف تتبّع مفقود.
   *
   * أعده إن عاد الموقع إلى حاوية، لا قبل ذلك.
   */

  /**
   * الموقع العام يقرأ الـAPI من الخادم لا من المتصفح، فلا rewrite هنا
   * بخلاف اللوحة. الفرق مقصود: اللوحة تحتاج أصلًا واحدًا لأن كوكي الجلسة
   * لا يعبر الأصول، والموقع بلا جلسة أصلًا — وإبقاء الـAPI خارج المتصفح
   * يعني أن لا سطح عام يُطلب منه شيء لم نقرر نشره.
   *
   * والتطبيق الميداني (`/app`) له جلسة، ومع ذلك بلا rewrite: ينادي الـAPI
   * من الهاتف مباشرة كما يفعل إرسال الاستمارة، كي يُحسب حدّ محاولات الدخول
   * على المُرسِل لا على خادم الموقع. الشرح في `lib/field/config.ts`.
   */

  /**
   * `/app` مدخل يُكتب ويُقال، وصفحات التطبيق كلها تحت `/app/`. السبب أن
   * نطاق المخطط وعامل الخدمة مطابقةُ بادئة: النطاق `/app/` لا يشمل `/app`
   * نفسها، والنطاق `/app` كان سيشمل كل عنوان يبدأ بهذه الأحرف.
   */
  async redirects() {
    return [{ source: "/app", destination: "/app/home", permanent: false }];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
      /**
       * التطبيق الميداني يلتقط صور الموقع ويطلب إحداثياته، فتُفتح له
       * الكاميرا والموقع الجغرافي على أصله وحده. يأتي بعد القاعدة العامة
       * لأن الإدخال الأخير يغلب عند تطابق المفتاح، فيبقى بقية الموقع مغلقًا.
       */
      {
        source: "/app/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
