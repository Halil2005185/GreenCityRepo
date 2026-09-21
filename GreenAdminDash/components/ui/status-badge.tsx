import { Badge } from "@/components/ui/badge";
import { type StatusKind, type StatusValue, statusDef } from "@/lib/status";

/** شارة حالة بتسميتها ولونها من `lib/status.ts` — شكل واحد في كل الصفحات. */
export function StatusBadge<K extends StatusKind>({
  kind,
  value,
  className,
}: {
  kind: K;
  value: StatusValue<K>;
  className?: string;
}) {
  const { label, tone } = statusDef(kind, value);

  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
