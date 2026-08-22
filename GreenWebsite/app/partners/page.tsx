import { Check } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Section } from "@/components/ui/section";
import { listPartners } from "@/lib/api/public";
import {
  PARTNERSHIP_JOURNEY,
  PARTNERSHIP_TYPES,
  SUPPORT_FORMS,
} from "@/lib/content/partnership";

export const metadata: Metadata = {
  title: "الشركاء",
  description:
    "أنواع الشراكة في المدن الخضراء وأشكال الدعم الممكنة ومسار الانضمام، والجهات الشريكة التي وافقت على إظهار اسمها.",
  alternates: { canonical: "/partners" },
};

export default async function PartnersPage() {
  /**
   * الجهات الظاهرة هنا هي من وافقت صراحة على إظهار الاسم والشعار. الموافقة
   * قرار مستقل عن الشراكة نفسها، فشريك نشط قد لا يظهر هنا عن قصد.
   */
  const partners = await listPartners();

  return (
    <>
      <PageHeader
        eyebrow="الشراكات"
        title="نعمل بشبكة لا بمفردنا"
        description="الشراكة عندنا التزام متبادل مكتوب في ميثاق المشروع: دور واضح للجهة، وشفافية في ما يُنجَز، ومتابعة لا تنتهي عند الفعالية."
      />

      <Section
        eyebrow="أنواع الشراكة"
        title="خمسة أنواع"
        description="يمكن للجهة الواحدة أن تحمل أكثر من نوع، ويرتبط نوع شراكة الفعالية بمبادرة بعينها."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PARTNERSHIP_TYPES.map((item) => (
            <Card key={item.type}>
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        muted
        eyebrow="أشكال الدعم"
        title="كيف يمكن أن تشارك جهتك"
        description="لا يشترط الدعم المالي. أكثر ما نحتاجه غالبًا خبرة أو مساحة أو أيادٍ تعمل."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORT_FORMS.map((form) => (
            <li
              key={form}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="text-sm leading-relaxed">{form}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="المسار" title="من التواصل إلى الشراكة">
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PARTNERSHIP_JOURNEY.map((step, index) => (
            <li key={step.title} className="space-y-2">
              <span className="numeric flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section muted eyebrow="شركاؤنا" title="جهات نعمل معها">
        {partners.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((partner) => (
              <li key={partner.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>{partner.nameAr}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      {partner.partnershipTypes.map((type) => (
                        <Badge key={type} tone="outline">
                          {PARTNERSHIP_TYPES.find((item) => item.type === type)
                            ?.label ?? type}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="قائمة الشركاء قيد الإعداد"
            description="نعرض الجهة هنا بعد اعتماد شراكتها وموافقتها على إظهار اسمها."
          />
        )}
      </Section>

      <CtaBand secondary={{ href: "/contact", label: "تواصل معنا" }} />
    </>
  );
}
