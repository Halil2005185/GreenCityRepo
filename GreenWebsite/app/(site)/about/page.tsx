import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { PageHeader, Section, SectionHeading } from "@/components/ui/section";
import { RevealGroup } from "@/components/ui/reveal";
import { revealDelay } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "عن المشروع",
  description:
    "من نحن، ولماذا نعمل على إعادة الغطاء النباتي إلى المدن السورية، وكيف تُدار المبادرات من التخطيط إلى توثيق الأثر.",
  alternates: { canonical: "/about" },
};

const IDEA = [
  "فقدت المدن السورية جزءًا كبيرًا من غطائها النباتي خلال سنوات الحرب، وما تبقّى منه يحتاج رعاية لا تكفيها الجهود الفردية المتفرقة.",
  "المدن الخضراء مشروع مجتمعي يجمع الجهات المحلية والمؤسسات والفرق التطوعية حول خطة واحدة: إعادة الحياة إلى المساحات العامة، والحفاظ عليها بعد ذلك.",
  "يقود المشروع فريق إيفا التطوعي، ويُنفَّذ عبر برامج متعددة، تحت كل برنامج مبادرات لها مواقع تنفيذ وأهداف ومؤشرات قياس خاصة بها.",
];

const PROCESS = [
  "تحديد المناطق المستهدفة والشركاء المشاركين قبل اختيار المواقع.",
  "تقسيم المبادرة إلى مواقع تنفيذ، لكل موقع هدفه ومسؤوله وجدوله.",
  "تنفيذ المهام ميدانيًا مع توثيق كل خطوة بدليل.",
  "التحقق الداخلي من الأدلة قبل احتساب أي رقم في الأثر.",
  "المتابعة بعد التنفيذ وتقييم ما بقي حيًّا ومستدامًا.",
];

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
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="space-y-6">
            <SectionHeading title="الفكرة" />
            <div className="space-y-5">
              {IDEA.map((paragraph) => (
                <p
                  key={paragraph}
                  className="max-w-[58ch] text-base leading-loose text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading title="كيف تُدار المبادرة" />

            {/*
              الخط الواصل يُرسم قطعةً بين كل دائرتين لا شريطًا مطلقًا
              يُوضَع بإزاحة محسوبة: الإزاحة تُقاس بالبكسل من حافة بعينها
              فتنكسر عند انعكاس الاتجاه أو تغيّر حجم الدائرة.
            */}
            <RevealGroup>
              <ol className="space-y-0">
                {PROCESS.map((step, index) => (
                  <li
                    key={step}
                    className="reveal flex gap-5 pb-7 last:pb-0"
                    style={revealDelay(index, 80)}
                  >
                    <div className="flex flex-col items-center">
                      <span className="numeric flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {index + 1}
                      </span>
                      {index < PROCESS.length - 1 && (
                        <span aria-hidden className="mt-2 w-px flex-1 bg-border" />
                      )}
                    </div>
                    <p className="flex-1 pt-1 text-base leading-loose text-muted-foreground">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </RevealGroup>
          </div>
        </div>
      </Section>

      <Section muted eyebrow="مبادئنا" title="أربعة نلتزم بها">
        <RevealGroup className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((principle, index) => (
            <div
              key={principle.title}
              className="reveal space-y-3"
              style={revealDelay(index, 80)}
            >
              <span className="numeric flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {index + 1}
              </span>
              <h3 className="text-lg font-bold leading-[1.6] text-foreground">
                {principle.title}
              </h3>
              <p className="text-sm leading-loose text-muted-foreground">
                {principle.body}
              </p>
            </div>
          ))}
        </RevealGroup>
      </Section>

      <CtaBand />
    </>
  );
}
