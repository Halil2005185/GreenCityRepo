import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { ProgramsGrid } from "@/components/sections/programs-grid";
import { PageHeader, Section } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "البرامج",
  description:
    "برامج المدن الخضراء: كل برنامج مظلة لمبادرات متعددة، ولكل مبادرة مواقع تنفيذ وأهداف خاصة بها.",
  alternates: { canonical: "/programs" },
};

export default function ProgramsPage() {
  return (
    <>
      <PageHeader
        eyebrow="البرامج"
        title="برامج المشروع"
        description="البرنامج مظلة طويلة المدى، والمبادرة عمل محدد تحته له بدايته ونهايته ومواقعه. هذا ما يجعل إطلاق مبادرة جديدة قرارًا تشغيليًا لا مشروعًا جديدًا من الصفر."
      />

      <Section>
        <ProgramsGrid />
      </Section>

      <CtaBand />
    </>
  );
}
