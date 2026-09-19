import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * خلفية الشريط المرسومة: لوحة خضراء وراء المحتوى، فوقها حجاب أخضر عميق.
 *
 * يُستعمل دائمًا داخل عنصر يحمل `on-painted` — ذاك الصنف يقلب المتغيّرات
 * اللونية للشريط، وهذا يضع الصورة تحته. أحدهما بلا الآخر يعطي نصًّا فحميًّا
 * على لوحة داكنة أو أخضرَ عميقًا بلا لوحة.
 *
 * `next/image` لا `background-image`: الصورة تُقدَّم بمقاسات متعددة وبصيغة
 * يختارها المتصفح، وهذا يسقط مع خلفية CSS. والعنصر `aria-hidden` لأنها
 * زخرفة — لا معلومة فيها تُفوَّت على من لا يراها.
 *
 * الحجاب لون صلب بالشفافية لا تدرّج: حدّه الأدنى محكوم بأسطع بكسل في
 * اللوحة — وفي كلتيهما أوراق مُشمسة تقارب الأبيض تقع داخل مساحة النص لا
 * في أطرافها — والتدرّج يترك ذلك البكسل بلا حماية.
 */
const SCRIMS = {
  /** الافتراضي: اللوحة ظاهرة والبيج فوقها 5.99:1 في أسوأ بكسل. */
  default: "bg-background/[0.78]",
  /** للمساحات كثيفة النص: اللوحة أثرٌ خفيف، والبيج 7.46:1. */
  strong: "bg-background/[0.88]",
} as const;

export function Backdrop({
  src,
  priority = false,
  scrim = "default",
  className,
}: {
  src: string;
  /**
   * لصورة القسم الأول وحدها. `priority` على كل خلفية يعني تنافس الصور على
   * أول الشبكة، فتتأخر التي تُرى فعلًا.
   */
  priority?: boolean;
  scrim?: keyof typeof SCRIMS;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("absolute inset-0 -z-10 overflow-hidden", className)}>
      <Image
        src={src}
        alt=""
        fill
        sizes="100vw"
        priority={priority}
        className="object-cover object-center"
      />
      <div className={cn("absolute inset-0", SCRIMS[scrim])} />
    </div>
  );
}
