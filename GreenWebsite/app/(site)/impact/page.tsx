import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { ImpactMetrics } from "@/components/sections/impact-metrics";
import { Backdrop } from "@/components/ui/backdrop";
import { RevealGroup } from "@/components/ui/reveal";
import { PageHeader, Section } from "@/components/ui/section";
import { revealDelay } from "@/lib/utils";

export const metadata: Metadata = {
  title: "الأثر",
  description:
    "كيف نقيس أثر المدن الخضراء ونوثّقه: مؤشرات معتمدة، وأدلة ميدانية، وتحقق داخلي قبل إعلان أي رقم.",
  alternates: { canonical: "/impact" },
};

const METHOD = [
  {
    title: "المؤشر يُعرَّف أولًا",
    body: "لكل مبادرة مؤشراتها ووحدات قياسها من كتالوج معتمد. مبادرة تُقاس بالمتر المربع لا تُجبَر على العدّ بالشجرة.",
  },
  {
    title: "الدليل قبل الرقم",
    body: "كل مساهمة أو إنجاز ميداني يُرفع بدليله. الرقم بلا دليل يبقى معلَّقًا ولا يدخل أي مجموع.",
  },
  {
    title: "التحقق مسؤولية داخلية",
    body: "الجهة المنفِّذة لا تعتمد إنجاز نفسها: التحقق من الأدلة يتم داخل فريق المشروع قبل الاحتساب.",
  },
  {
    title: "التصحيح لا المحو",
    body: "الخطأ يُصحَّح بقيد معاكس يبقى في السجل. لا يُحذف رقم أُعلن، ولا يتغير تاريخ بأثر رجعي.",
  },
];

export default function ImpactPage() {
  return (
    <>
      <PageHeader
        eyebrow="الأثر"
        title="ما أنجزناه — موثَّقًا"
        description="نعلن ما تحققنا منه فقط. الأرقام أدناه مجاميع القيود الموثَّقة على مستوى المشروع، وتتحدّث تلقائيًا مع كل تحقق جديد."
      />

      <Section>
        <ImpactMetrics />
      </Section>

      <Section className="relative my-20 overflow-hidden">
        <Backdrop src="/bg/sectionNew.png"/>

        <div className="relative z-10">
          <div className="mb-10 space-y-4">
            <p className="text-sm font-medium text-[var(--brand-warm-beige)] ">
              المنهجية
            </p>

            <h2 className="text-2xl font-bold tracking-tight text-[var(--brand-warm-beige)] lg:text-3xl">
              كيف نقيس
            </h2>

            <p className="text-base leading-loose text-[var(--brand-warm-beige)]">
              القياس جزء من تصميم النظام لا تقريرًا يُكتب في النهاية.
            </p>
          </div>

          <RevealGroup className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {METHOD.map((item, index) => (
              <div
                key={item.title}
                className="reveal space-y-3"
                style={revealDelay(index, 80)}
              >
                <span className="numeric flex size-10 items-center justify-center rounded-full bg-accent-ink/40 text-sm font-bold text-[var(--brand-life-green)]">
                  {index + 1}
                </span>

                <h3 className="text-lg font-bold leading-[1.6] text-[var(--brand-warm-beige)]">
                  {item.title}
                </h3>

                <p className="text-sm font-extralight leading-loose text-[var(--brand-warm-beige)]">
                  {item.body}
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
