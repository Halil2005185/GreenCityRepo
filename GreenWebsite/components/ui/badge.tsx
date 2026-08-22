import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  muted: "bg-muted text-muted-foreground",
  outline: "border border-border text-muted-foreground",
} as const;

export function Badge({
  tone = "muted",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
