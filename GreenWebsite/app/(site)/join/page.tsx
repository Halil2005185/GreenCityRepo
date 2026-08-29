import { Building2, Sprout, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";
import { PARTNERSHIP_JOURNEY } from "@/lib/content/partnership";
import { cn } from "@/lib/utils";

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
        <div className="grid gap-4 lg:grid-cols-3">
          {PATHS.map((path) => (
            <Card key={path.title} className="flex h-full flex-col">
              <CardHeader className="flex-1">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <path.icon className="size-5" aria-hidden />
                </span>
                <CardTitle>{path.title}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
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
          ))}
        </div>
      </Section>

      <Section
        muted
        eyebrow="ماذا بعد التواصل"
        title="مسار الشراكة"
        description="نفس المسار لكل جهة، فلا تعتمد الشراكة على معرفة شخصية بأحد."
      >
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
    </>
  );
}
