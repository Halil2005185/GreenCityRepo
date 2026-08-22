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
   */
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
    ];
  },
};

export default nextConfig;
