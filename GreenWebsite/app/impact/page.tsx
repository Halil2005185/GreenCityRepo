import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { ImpactMetrics } from "@/components/sections/impact-metrics";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";

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
        <div className="grid gap-4 sm:grid-cols-2">
          {METHOD.map((item) => (
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
