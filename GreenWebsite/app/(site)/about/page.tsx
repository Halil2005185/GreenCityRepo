import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "عن المشروع",
  description:
    "من نحن، ولماذا نعمل على إعادة الغطاء النباتي إلى المدن السورية، وكيف تُدار المبادرات من التخطيط إلى توثيق الأثر.",
  alternates: { canonical: "/about" },
};

const PRINCIPLES = [
  {
    title: "المدينة قبل الشجرة",
    body: "الهدف بيئة حضرية صالحة للعيش: ظل ونظافة هواء ومساحات يستعملها الناس فعلًا، لا رقمًا في تقرير.",
  },
  {
    title: "شراكة لا استعراض",
    body: "لكل جهة دور مكتوب في الميثاق: ما تقدّمه وما تتوقعه، فلا تنتهي الشراكة عند صورة الافتتاح.",
  },
  {
    title: "ما لا يُتابَع لا يُزرَع",
    body: "المتابعة بعد الزراعة — سقاية ورعاية وتقييم — جزء من خطة المبادرة لا نشاط لاحق اختياري.",
  },
  {
    title: "الشفافية في الرقم",
    body: "الأثر المعلن هو الموثَّق وحده، وكل تصحيح يُسجَّل قيدًا معاكسًا يبقى ظاهرًا في السجل.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="عن المشروع"
        title={`${siteConfig.name} — ${siteConfig.tagline}`}
        description={siteConfig.description}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">الفكرة</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              فقدت المدن السورية جزءًا كبيرًا من غطائها النباتي خلال سنوات
              الحرب، وما تبقّى منه يحتاج رعاية لا تكفيها الجهود الفردية
              المتفرقة. المدن الخضراء مشروع مجتمعي يجمع الجهات المحلية
              والمؤسسات والفرق التطوعية حول خطة واحدة: إعادة الحياة إلى
              المساحات العامة، والحفاظ عليها بعد ذلك.
            </p>
            <p className="text-base leading-relaxed text-muted-foreground">
              يقود المشروع فريق إيفا التطوعي، وينفَّذ عبر برامج متعددة، تحت
              كل برنامج مبادرات لها مواقع تنفيذ وأهداف ومؤشرات قياس خاصة بها.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">كيف تُدار المبادرة</h2>
            <ol className="space-y-4">
              {[
                "تحديد المناطق المستهدفة والشركاء المشاركين قبل اختيار المواقع.",
                "تقسيم المبادرة إلى مواقع تنفيذ، لكل موقع هدفه ومسؤوله وجدوله.",
                "تنفيذ المهام ميدانيًا مع توثيق كل خطوة بدليل.",
                "التحقق الداخلي من الأدلة قبل احتساب أي رقم في الأثر.",
                "المتابعة بعد التنفيذ وتقييم ما بقي حيًّا ومستدامًا.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="numeric mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-base leading-relaxed text-muted-foreground">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section muted eyebrow="مبادئنا" title="أربعة نلتزم بها">
        <div className="grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
