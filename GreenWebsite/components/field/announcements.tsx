import { Megaphone } from "lucide-react";

import type { FieldAnnouncement } from "@/lib/field/api";
import { formatAge } from "@/lib/field/labels";

/** ما يُعرض مفتوحًا؛ ما قبله يُطوى تحته فلا يدفع الموعد والمكان إلى أسفل. */
const OPEN = 2;

/**
 * إعلانات المنسّق، الأحدث أولًا، فوق كل ما في الصفحة: ما تغيّر — موعد أو
 * مكان — يُقرأ قبل الموعد والمكان اللذين تحته.
 *
 * تظهر لكل من يفتح التطبيق، فعّل الإشعارات أم لم يفعّلها: الإشعار وسيلة
 * إيصال، والإعلان هنا.
 */
export function Announcements({
  items,
}: {
  items: readonly FieldAnnouncement[] | undefined;
}) {
  if (!items || items.length === 0) return null;

  const open = items.slice(0, OPEN);
  const folded = items.slice(OPEN);

  return (
    <section
      aria-label="إعلانات المنسّق"
      className="rounded-xl border border-accent-ink/25 bg-card p-4 shadow-sm"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold text-accent-ink">
        <Megaphone className="size-4 shrink-0" aria-hidden />
        من المنسّق
      </h2>

      <ul className="mt-3 space-y-4">
        {open.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>

      {folded.length > 0 ? (
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            إعلانات سابقة (<span className="numeric">{folded.length}</span>)
          </summary>
          <ul className="mt-3 space-y-4">
            {folded.map((item) => (
              <Item key={item.id} item={item} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Item({ item }: { item: FieldAnnouncement }) {
  return (
    <li>
      <p className="text-base font-bold leading-snug text-foreground">
        {item.titleAr}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm leading-loose text-foreground">
        {item.bodyAr}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {[item.groupNameAr, formatAge(item.createdAt)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}
