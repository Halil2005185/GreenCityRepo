import { readFile } from "node:fs/promises";
import path from "node:path";

import { FIELD_ROUTES, FIELD_SCOPE } from "@/lib/field/config";

export const dynamic = "force-static";

/**
 * ما يُحفظ عند التثبيت: صفحات التطبيق كلها. هي قشور ثابتة بلا معرّف في
 * عناوينها، فالقائمة قصيرة ومعروفة، وصفحة جديدة تُضاف هنا لتُفتح بلا شبكة.
 */
const SHELLS = [
  FIELD_ROUTES.home,
  FIELD_ROUTES.attendance,
  FIELD_ROUTES.photos,
  FIELD_ROUTES.me,
  FIELD_ROUTES.link,
  FIELD_ROUTES.login,
  FIELD_ROUTES.offline,
];

/**
 * عامل الخدمة من مسار لا من `public/`: يحتاج رقم البناء، والملف الثابت لا
 * يعرفه. المسار `/app/sw.js` يجعل نطاقه الأقصى `/app/` بلا ترويسة إضافية.
 *
 * `force-static` يولّده مرة عند البناء، فرقمه ثابت بين الطلبات ويتغيّر مع
 * كل نشر — وتغيّر بايتات الملف هو ما يخبر المتصفح أن نسخة جديدة صدرت.
 */
export async function GET() {
  const source = await readFile(
    path.join(process.cwd(), "lib/field/service-worker.js"),
    "utf8",
  );

  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? `build-${Date.now()}`;

  const values: Record<string, unknown> = {
    __GC_FIELD_VERSION__: version,
    __GC_FIELD_SHELLS__: SHELLS,
    __GC_FIELD_OFFLINE__: FIELD_ROUTES.offline,
    __GC_FIELD_SCOPE__: FIELD_SCOPE,
  };

  // الرمز يُستبدل بعلامتَي تنصيصه، فتحلّ محله قيمة JavaScript صالحة.
  const body = Object.entries(values).reduce(
    (text, [token, value]) => text.replace(`"${token}"`, JSON.stringify(value)),
    source,
  );

  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // بلا تخزين: تحديث اليوم يصل اليوم، لا بعد انتهاء عمر نسخة محفوظة.
      "cache-control": "no-cache, no-store, must-revalidate",
    },
  });
}
