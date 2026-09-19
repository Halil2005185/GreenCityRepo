import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicInitiativeSummary } from "@/lib/api/types";
import {
  INITIATIVE_STATUS_LABELS,
  INITIATIVE_STATUS_TONES,
} from "@/lib/content/labels";
import { formatDate } from "@/lib/utils";

export function InitiativeCard({
  initiative,
}: {
  initiative: PublicInitiativeSummary;
}) {
  /**
   * المبادرة قد تُنشأ قبل أن يُختار لها slug، فتُعرض بلا رابط تفصيل بدل
   * توليد رابط مكسور من المعرّف.
   */
  const href = initiative.slug ? `/initiatives/${initiative.slug}` : null;

  const body = (
    <Card className="h-full transition-colors hover:border-primary/60 hover:bg-surface-strong">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={INITIATIVE_STATUS_TONES[initiative.status]}>
            {INITIATIVE_STATUS_LABELS[initiative.status]}
          </Badge>
          <Badge tone="outline">{initiative.programNameAr}</Badge>
          {initiative.season && <Badge tone="muted">{initiative.season}</Badge>}
        </div>
        <CardTitle>{initiative.nameAr}</CardTitle>
        {initiative.descriptionAr && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {initiative.descriptionAr}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {initiative.areaNamesAr.length > 0 && (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{initiative.areaNamesAr.join("، ")}</span>
          </p>
        )}
        {initiative.startsAt && (
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            <span>تبدأ {formatDate(initiative.startsAt)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (!href) return body;

  return (
    <Link
      href={href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {body}
    </Link>
  );
}
