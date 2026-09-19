import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * خلفية القسم المرسومة: لوحة خضراء وراء المحتوى، فوقها حجاب بلون الخلفية.
 *
 * `next/image` لا `background-image`: الصورة تُقدَّم بمقاسات متعددة وبصيغة
 * يختارها المتصفح، وهذا يسقط مع خلفية CSS. والعنصر `aria-hidden` لأنها
 * زخرفة — لا معلومة فيها تُفوَّت على من لا يراها.
 *
 * **قاعدة لا تُخرق: النص فوق هذا المكوّن بيجٌ كامل (`text-foreground`) لا
 * `text-muted-foreground`.** في اللوحتين بكسلات أوراق مُشمسة تقارب الأبيض،
 * وتقع داخل مساحة النص لا في أطرافها وحدها. قيست أسوأ حالة عند حجاب 78%:
 * البيج 5.99:1، والنص الثانوي 3.48:1 — وهذا دون الحد. رفع الحجاب إلى 90%
 * يُنجي الثانوي لكنه يمحو اللوحة، فالتدرّج هنا بالحجم والوزن لا باللون —
 * وهو أيضًا ما يوجبه دليل الهوية: «النصوص الأساسية لا تُستخدم بدرجات
 * لونية مخففة».
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
