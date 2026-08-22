import { InitiativeCard } from "@/components/cards/initiative-card";
import { EmptyState } from "@/components/ui/empty-state";
import { listInitiatives } from "@/lib/api/public";

export async function InitiativesGrid({
  programSlug,
  limit,
}: {
  programSlug?: string;
  limit?: number;
}) {
  const initiatives = await listInitiatives({ programSlug, limit });

  if (initiatives.length === 0) {
    return (
      <EmptyState
        title="لا مبادرات منشورة بعد"
        description="تُنشر المبادرة هنا بعد إطلاقها رسميًا وتحديد مواقع تنفيذها."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {initiatives.map((initiative) => (
        <InitiativeCard key={initiative.id} initiative={initiative} />
      ))}
    </div>
  );
}
