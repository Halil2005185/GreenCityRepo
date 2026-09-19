import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { ImpactMetrics } from "@/components/sections/impact-metrics";
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

      <Section
        muted
        eyebrow="المنهجية"
        title="كيف نقيس"
        description="القياس جزء من تصميم النظام لا تقريرًا يُكتب في النهاية."
      >
        <RevealGroup className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {METHOD.map((item, index) => (
            <div
              key={item.title}
              className="reveal space-y-3"
              style={revealDelay(index, 80)}
            >
              <span className="numeric flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {index + 1}
              </span>
              <h3 className="text-lg font-bold leading-[1.6] text-foreground">
                {item.title}
              </h3>
              <p className="text-sm leading-loose text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </RevealGroup>
      </Section>

      <CtaBand />
    </>
  );
}
