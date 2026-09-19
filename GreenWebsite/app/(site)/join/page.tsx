import { Building2, Sprout, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PartnershipJourney } from "@/components/sections/partnership-journey";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RevealGroup } from "@/components/ui/reveal";
import { PageHeader, Section } from "@/components/ui/section";
import { cn, revealDelay } from "@/lib/utils";

export const metadata: Metadata = {
  title: "انضم إلينا",
  description:
    "طرق المشاركة في المدن الخضراء: شراكة مؤسسية، تطوّع ميداني، أو توفير مساحة أو موارد.",
  alternates: { canonical: "/join" },
};

const PATHS = [
  {
    icon: Building2,
    title: "جهة أو مؤسسة",
    body: "شركة أو منظمة أو جهة حكومية أو جامعة تريد شراكة معلنة: نحدد معك نوع الشراكة وشكل الدعم، وتتابع مبادراتك من بوابة الشركاء.",
    href: "/partners",
    cta: "أنواع الشراكة",
  },
  {
    icon: Users,
    title: "متطوع أو فريق",
    body: "أفراد وفرق شبابية للعمل الميداني في مواقع التنفيذ: زراعة، متابعة، توثيق، وتنظيم أنشطة توعوية.",
    href: "/contact",
    cta: "تواصل معنا",
  },
  {
    icon: Sprout,
    title: "مساحة أو موارد",
    body: "أرض أو ساحة أو سطح مؤسسة يمكن أن تصبح مساحة خضراء، أو شتلات ومستلزمات وتجهيزات تدعم التنفيذ.",
    href: "/contact",
    cta: "أخبرنا عنها",
  },
];

export default function JoinPage() {
  return (
    <>
      <PageHeader
        eyebrow="انضم إلينا"
        title="لكل دور مكان في هذا العمل"
        description="لا تحتاج المشاركة ميزانية ولا خبرة سابقة بالضرورة. أخبرنا بما تستطيع تقديمه ونحدد معًا أين يصنع أثرًا."
      />

      <Section>
        <RevealGroup className="grid gap-5 lg:grid-cols-3">
          {PATHS.map((path, index) => (
            <div key={path.title} className="reveal" style={revealDelay(index)}>
              <Card className="flex h-full flex-col">
                <CardHeader className="flex-1">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
                    <path.icon className="size-5" aria-hidden />
                  </span>
                  <CardTitle>{path.title}</CardTitle>
                  <p className="text-sm leading-loose text-muted-foreground">
                    {path.body}
                  </p>
                </CardHeader>
                <CardContent>
                  <Link
                    href={path.href}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    {path.cta}
                  </Link>
                </CardContent>
              </Card>
            </div>
          ))}
        </RevealGroup>
      </Section>

      <Section
        muted
        eyebrow="ماذا بعد التواصل"
        title="مسار الشراكة"
        description="نفس المسار لكل جهة، فلا تعتمد الشراكة على معرفة شخصية بأحد."
      >
        <PartnershipJourney />
      </Section>
    </>
  );
}
