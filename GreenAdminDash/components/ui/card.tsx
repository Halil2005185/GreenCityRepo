import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("space-y-1.5 p-6 text-start", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-2 p-6 pt-0", className)} {...props} />
  );
}

const ALERT_VARIANTS = {
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-border bg-muted text-muted-foreground",
  // ما يستدعي الانتباه قبل فعل وليس خطأ: تحذيرات المطابقة قبل الإطلاق مثلًا.
  warning: "border-warning/40 bg-warning/10 text-foreground",
} as const;

/**
 * تنبيه نصي للأخطاء العامة فوق النماذج، وللملاحظات والتحذيرات في الصفحة.
 * الخطأ وحده `role="alert"` يقاطع قارئ الشاشة؛ الباقي `status` يُقرأ بهدوء.
 */
export function Alert({
  variant = "destructive",
  className,
  ...props
}: React.ComponentProps<"div"> & { variant?: keyof typeof ALERT_VARIANTS }) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm text-start", ALERT_VARIANTS[variant], className)}
      {...props}
    />
  );
}
