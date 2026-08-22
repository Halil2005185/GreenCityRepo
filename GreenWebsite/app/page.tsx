import { HandHeart, Leaf, Trees, Users } from "lucide-react";
import Link from "next/link";

import { CtaBand } from "@/components/sections/cta-band";
import { ImpactMetrics } from "@/components/sections/impact-metrics";
import { InitiativesGrid } from "@/components/sections/initiatives-grid";
import { ProgramsGrid } from "@/components/sections/programs-grid";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * كيف نعمل: وصف المنهجية لا وصف مبادرة بعينها. أي رقم أو اسم مبادرة
 * يظهر في الصفحة يأتي من الأقسام التي تقرأ الـAPI أسفلها.
 */
const APPROACH = [
  {
    icon: Users,
    title: "شبكة شركاء",
    description:
      "نبني الشراكة مع الجهات المحلية والمؤسسات والفرق التطوعية على ميثاق واضح يحدد الدور والالتزام من البداية.",
  },
  {
    icon: Trees,
    title: "تنفيذ ميداني",
    description:
      "كل مبادرة تُقسَّم إلى مواقع تنفيذ ومراحل ومهام لها مسؤول وموعد، فتُدار بالخطة لا بالحماس وحده.",
  },
  {
    icon: Leaf,
    title: "أثر موثَّق",
    description:
      "لا يُحتسب رقم في الأثر قبل التحقق منه بدليل ميداني، والتصحيح يكون بقيد معاكس لا بمسح ما سُجّل.",
  },
  {
    icon: HandHeart,
    title: "استمرارية لا حملة",
    description:
      "المدينة الخضراء ليست موسمًا واحدًا. المتابعة بعد الزراعة جزء من العمل لا نشاط إضافي.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero-surface border-b border-border">
        <Container>
          <div className="max-w-3xl py-20 sm:py-28">
            <p className="text-sm font-medium text-primary">
              مبادرة مجتمعية بيئية — يقودها فريق إيفا
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
              {siteConfig.tagline}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              {siteConfig.description} نعمل مع الجهات المحلية والفرق الشبابية على
              برامج تشجير ومساحات خضراء، بخطة تُدار وتُقاس ويُتابَع أثرها بعد
              التنفيذ.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/join" className={buttonVariants({ size: "lg" })}>
                كن شريكًا
              </Link>
              <Link
                href="/initiatives"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                تصفّح المبادرات
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Section
        eyebrow="الأثر"
        title="أرقام موثَّقة لا تقديرات"
        description="ما تراه هنا هو ما جرى التحقق منه ميدانيًا فقط. المؤشرات ووحداتها تأتي من كتالوج المشروع، ويُضاف إليها مؤشر جديد كلما تطلّبت مبادرة قياسًا مختلفًا."
        action={
          <Link
            href="/impact"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            تفاصيل الأثر
          </Link>
        }
      >
        <ImpactMetrics limit={3} />
      </Section>

      <Section
        muted
        eyebrow="البرامج"
        title="ما نعمل عليه"
        description="كل برنامج مظلة لمبادرات متعددة، تحت كل مبادرة مواقع تنفيذ في مناطق مختلفة."
        action={
          <Link
            href="/programs"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            كل البرامج
          </Link>
        }
      >
        <ProgramsGrid limit={6} />
      </Section>

      <Section
        eyebrow="المبادرات"
        title="ما يجري الآن"
        action={
          <Link
            href="/initiatives"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            كل المبادرات
          </Link>
        }
      >
        <InitiativesGrid limit={3} />
      </Section>

      <Section
        muted
        eyebrow="منهجيتنا"
        title="كيف نعمل"
        description="أربعة مبادئ تحكم كل مبادرة مهما اختلف مجالها أو مقياسها."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {APPROACH.map((item) => (
            <div key={item.title} className="space-y-3">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <item.icon className="size-5" aria-hidden />
              </span>
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
