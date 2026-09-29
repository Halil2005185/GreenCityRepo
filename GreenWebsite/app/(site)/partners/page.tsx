import { Check } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/sections/cta-band";
import { PartnershipJourney } from "@/components/sections/partnership-journey";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RevealGroup } from "@/components/ui/reveal";
import { PageHeader, Section } from "@/components/ui/section";
import { listPartners } from "@/lib/api/public";
import {
  PARTNERSHIP_TYPES,
  SUPPORT_FORMS,
} from "@/lib/content/partnership";
import { revealDelay } from "@/lib/utils";

export const metadata: Metadata = {
  title: "الشركاء",
  description:
    "أنواع الشراكة في المدن الخضراء وأشكال الدعم الممكنة ومسار الانضمام، والجهات الشريكة التي وافقت على إظهار اسمها.",
  alternates: { canonical: "/partners" },
};

export default async function PartnersPage() {
  /**
   * الجهات الظاهرة هنا هي من وافقت صراحة على إظهار الاسم والشعار.
   * الموافقة قرار مستقل عن الشراكة نفسها، فشريك نشط قد لا يظهر هنا عن قصد.
   */
  const partners = await listPartners();

  return (
    <>
      <PageHeader
        eyebrow="الشراكات"
        title="نعمل بشبكة لا بمفردنا"
        description="الشراكة عندنا التزام متبادل مكتوب في ميثاق المشروع: دور واضح للجهة، وشفافية في ما يُنجَز، ومتابعة لا تنتهي عند الفعالية."
      />

      {/* أنواع الشراكة */}
      <Section
        eyebrow="أنواع الشراكة"
        eyebrowClassName="text-[var(--brand-brown)]"
        title="خمسة أنواع"
        titleClassName="text-[var(--brand-deep-green)]"
        description="يمكن للجهة الواحدة أن تحمل أكثر من نوع، ويرتبط نوع شراكة الفعالية بمبادرة بعينها."
      >
        <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PARTNERSHIP_TYPES.map((item, index) => (
            <div
              key={item.type}
              className="reveal"
              style={revealDelay(index)}
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-[var(--brand-deep-green)]">
                    {item.label}
                  </CardTitle>

                  <p className="text-sm leading-loose text-muted-foreground">
                    {item.description}
                  </p>
                </CardHeader>
              </Card>
            </div>
          ))}
        </RevealGroup>
      </Section>

      {/* أشكال الدعم */}
      <Section
        muted
        eyebrow="أشكال الدعم"
        eyebrowClassName="text-[var(--brand-brown)]"
        title="كيف يمكن أن تشارك جهتك"
        titleClassName="text-[var(--brand-deep-green)]"
        description="لا يشترط الدعم المالي. أكثر ما نحتاجه غالبًا خبرة أو مساحة أو أيادٍ تعمل."
      >
        <RevealGroup>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORT_FORMS.map((form, index) => (
              <li
                key={form}
                className="reveal flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                style={revealDelay(index)}
              >
                <Check
                  className="mt-1 size-4 shrink-0 text-accent-ink"
                  aria-hidden
                />
                <span className="text-sm leading-loose text-foreground">
                  {form}
                </span>
              </li>
            ))}
          </ul>
        </RevealGroup>
      </Section>

      {/* مسار الشراكة */}
      <Section
        eyebrow="المسار"
        title="من التواصل إلى الشراكة"
        backdrop
        className="relative overflow-hidden"
      >
        <PartnershipJourney />
      </Section>

      {/* الشركاء */}
      <Section
        muted
        eyebrow="شركاؤنا"
        eyebrowClassName="text-[var(--brand-brown)]"
        title="جهات نعمل معها"
        titleClassName="text-[var(--brand-deep-green)]"
      >
        {partners.length > 0 ? (
          <RevealGroup>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {partners.map((partner, index) => (
                <li
                  key={partner.id}
                  className="reveal"
                  style={revealDelay(index)}
                >
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="text-[var(--brand-deep-green)]">
                        {partner.nameAr}
                      </CardTitle>

                      <div className="flex flex-wrap gap-2">
                        {partner.partnershipTypes.map((type) => (
                          <Badge key={type} tone="outline">
                            {PARTNERSHIP_TYPES.find(
                              (item) => item.type === type,
                            )?.label ?? type}
                          </Badge>
                        ))}
                      </div>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          </RevealGroup>
        ) : (
          <EmptyState
            title="قائمة الشركاء قيد الإعداد"
            description="نعرض الجهة هنا بعد اعتماد شراكتها وموافقتها على إظهار اسمها."
          />
        )}
      </Section>

      <CtaBand
        secondary={{
          href: "/contact",
          label: "تواصل معنا",
        }}
      />
    </>
  );
}