import { ProgramCard } from "@/components/cards/program-card";
import { EmptyState } from "@/components/ui/empty-state";
import { listPrograms } from "@/lib/api/public";

export async function ProgramsGrid({ limit }: { limit?: number }) {
  const programs = await listPrograms();
  const shown = limit ? programs.slice(0, limit) : programs;

  if (shown.length === 0) {
    return (
      <EmptyState
        title="البرامج قيد الإعداد"
        description="نعمل على نشر برامج المشروع ومبادراتها تباعًا."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((program) => (
        <ProgramCard key={program.id} program={program} />
      ))}
    </div>
  );
}
