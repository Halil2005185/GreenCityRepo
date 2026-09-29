import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { Backdrop } from "@/components/ui/backdrop";
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

      {/* الفكرة + كيف تُدار المبادرة */}
      <Section className="relative my-20 overflow-hidden ">
        <Backdrop src="/bg/sectionNew.png" />

        <div className="relative z-10 grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          {/* الفكرة */}
          <div className="space-y-6">
            <SectionHeading title="الفكرة" />
            <div className="space-y-5">
              {IDEA.map((paragraph) => (
                <p
                  key={paragraph}
                  className="max-w-[58ch] text-base leading-loose text-white/90"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* كيف تُدار المبادرة */}
          <div className="space-y-6">
            <SectionHeading title="كيف تُدار المبادرة" />
            <RevealGroup>
              <ol className="space-y-0">
                {PROCESS.map((step, index) => (
                  <li key={step} className="relative flex gap-5 pb-7 last:pb-0">
                    {/* الرقم + الخط */}
                    <div className="relative flex w-8 shrink-0 flex-col items-center">
                      {/* الرقم */}
                      <span
                        className="timeline-number numeric relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                        style={
                          {
                            "--number-delay": `${index * 700}ms`,
                          } as React.CSSProperties
                        }
                      >
                        {index + 1}
                      </span>
                      {/* الخط */}
                      {index !== PROCESS.length - 1 && (
                        <span
                          aria-hidden
                          className="timeline-step-line mt-1 w-px flex-1 origin-top bg-primary"
                          style={
                            {
                              "--line-delay": `${index * 700 + 700}ms`,
                            } as React.CSSProperties
                          }
                        />
                      )}
                    </div>
                    {/* النص */}
                    <p
                      className="timeline-text flex-1 pt-1 text-base leading-loose text-white/90"
                      style={
                        {
                          "--text-delay": `${index * 700}ms`,
                        } as React.CSSProperties
                      }
                    >
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </RevealGroup>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="مبادئنا"
        title="أربعة نلتزم بها"
        backdrop
        className="relative my-20 overflow-hidden"
      >
        <Backdrop className="" src="/bg/sectionNew.png" />
        <div className="relative z-10">
          <RevealGroup className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((principle, index) => (
              <div
                key={principle.title}
                className="reveal space-y-3"
                style={revealDelay(index, 80)}
              >
                <span className="numeric flex size-10 items-center justify-center rounded-full bg-accent-ink/10 text-sm font-bold text-accent-ink">
                  {index + 1}
                </span>
                <h3 className="text-lg font-bold leading-loose text-[var(--brand-warm-beige)]">
                  {principle.title}
                </h3>
                <p className="text-medium leading-loose text-muted-foreground">
                  {principle.body}
                </p>
              </div>
            ))}
          </RevealGroup>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
