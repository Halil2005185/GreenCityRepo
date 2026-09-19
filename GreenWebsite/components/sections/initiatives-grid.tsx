import { InitiativeCard } from "@/components/cards/initiative-card";
import { EmptyState } from "@/components/ui/empty-state";
import { RevealGroup, revealDelay } from "@/components/ui/reveal";
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
    <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {initiatives.map((initiative, index) => (
        <div key={initiative.id} className="reveal" style={revealDelay(index)}>
          <InitiativeCard initiative={initiative} />
        </div>
      ))}
    </RevealGroup>
  );
}
