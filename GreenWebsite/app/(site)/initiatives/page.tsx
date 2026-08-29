import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { InitiativesGrid } from "@/components/sections/initiatives-grid";
import { PageHeader, Section } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "المبادرات",
  description:
    "المبادرات المنشورة في المدن الخضراء: مواقع التنفيذ والمناطق والأهداف وحالة كل مبادرة.",
  alternates: { canonical: "/initiatives" },
};

export default function InitiativesPage() {
  return (
    <>
      <PageHeader
        eyebrow="المبادرات"
        title="المبادرات"
        description="لكل مبادرة برنامج تنتمي إليه، ومناطق تعمل فيها، ومواقع تنفيذ لها أهدافها. تظهر هنا بعد إطلاقها رسميًا."
      />

      <Section>
        <InitiativesGrid />
      </Section>

      <CtaBand />
    </>
  );
}
