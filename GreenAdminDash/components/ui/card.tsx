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

/** تنبيه نصي للأخطاء العامة فوق النماذج. */
export function Alert({
  variant = "destructive",
  className,
  ...props
}: React.ComponentProps<"div"> & { variant?: "destructive" | "info" }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-3 py-2 text-sm text-start",
        variant === "destructive"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
