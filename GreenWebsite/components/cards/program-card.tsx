import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicProgram } from "@/lib/api/types";
import { formatNumber } from "@/lib/utils";

export function ProgramCard({ program }: { program: PublicProgram }) {
  return (
    <Link
      href={`/programs/${program.slug}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="group h-full transition-colors hover:border-primary/40">
        <CardHeader>
          <CardTitle>{program.nameAr}</CardTitle>
          {program.descriptionAr && (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {program.descriptionAr}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            <span className="numeric">
              {formatNumber(program.initiativeCount)}
            </span>{" "}
            مبادرة
          </span>
          {/* السهم إلى اليسار لأن اتجاه التقدّم في RTL يسار لا يمين. */}
          <ArrowLeft
            className="size-4 text-primary transition-transform group-hover:-translate-x-1"
            aria-hidden
          />
        </CardContent>
      </Card>
    </Link>
  );
}
