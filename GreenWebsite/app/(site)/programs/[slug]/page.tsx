import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaBand } from "@/components/sections/cta-band";
import { InitiativesGrid } from "@/components/sections/initiatives-grid";
import { PageHeader, Section } from "@/components/ui/section";
import { getProgram } from "@/lib/api/public";

export async function generateMetadata({
  params,
}: PageProps<"/programs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgram(slug);

  if (!program) return { title: "برنامج غير موجود" };

  return {
    title: program.nameAr,
    description: program.descriptionAr ?? undefined,
    alternates: { canonical: `/programs/${program.slug}` },
  };
}

export default async function ProgramPage({
  params,
}: PageProps<"/programs/[slug]">) {
  const { slug } = await params;
  const program = await getProgram(slug);

  /**
   * الـslug مجهول للموقع حتى يسأل الـAPI، فلا `generateStaticParams` هنا:
   * الصفحة تُبنى عند أول طلب ثم تُخزَّن. برنامج جديد يظهر دون إعادة نشر.
   */
  if (!program) notFound();

  return (
    <>
      <PageHeader
        eyebrow="برنامج"
        title={program.nameAr}
        description={program.descriptionAr ?? undefined}
      />

      <Section
        title="مبادرات البرنامج"
        description="المبادرات المنشورة تحت هذا البرنامج."
      >
        <InitiativesGrid programSlug={program.slug} />
      </Section>

      <CtaBand />
    </>
  );
}
