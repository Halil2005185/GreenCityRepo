import {
  buttonVariants as siteButtonVariants,
} from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "link";
type Size = "sm" | "default" | "lg";

/**
 * زر التطبيق الميداني: زر الموقع في المتصفح، وزر التطبيق من الأيقونة.
 *
 * في المتصفح الصفحة بتصميم الموقع، فالزر زره كما هو — وما يتغيّر فيه هناك
 * يتبعه هنا. وفي وضع التطبيق للتصميم هويته: الأخضر الحيوي تعبئةً للفعل
 * الأساسي، يُقرأ في الشمس على خلفية البيج. لذلك تُكتب ألوان وضع التطبيق هنا
 * صريحةً بالمتغيّر `app:`، ولا تُترك لما يُكتب في زر الموقع.
 */
const APP_LOOK: Record<Variant, string> = {
  default:
    "app:bg-primary app:text-primary-foreground app:hover:bg-primary/85",
  secondary:
    "app:bg-secondary app:text-secondary-foreground app:hover:bg-accent",
  outline:
    "app:border-input app:bg-foreground/5 app:text-foreground app:hover:bg-foreground app:hover:text-background",
  ghost: "app:text-foreground app:hover:bg-primary/10",
  link: "app:text-accent-ink",
};

export function buttonVariants({
  variant = "default",
  size = "default",
}: { variant?: Variant | null; size?: Size | null } = {}) {
  const chosen = variant ?? "default";

  return cn(
    siteButtonVariants({ variant: chosen, size: size ?? "default" }),
    APP_LOOK[chosen],
  );
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
