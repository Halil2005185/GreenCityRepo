import { HandHeart, Leaf, Trees, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CtaBand } from "@/components/sections/cta-band";
import { ImpactMetrics } from "@/components/sections/impact-metrics";
import { InitiativesGrid } from "@/components/sections/initiatives-grid";
import { ProgramsGrid } from "@/components/sections/programs-grid";
import { Backdrop } from "@/components/ui/backdrop";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RevealGroup } from "@/components/ui/reveal";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/lib/site";
import { cn, revealDelay } from "@/lib/utils";

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
      <section className="on-painted relative isolate overflow-hidden border-b border-border">
        <Backdrop src="/bg/sectionNew.png" priority />

        <Container>
          <div className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-medium  text-accent-ink">
                مبادرة مجتمعية بيئية — يقودها فريق إيفا
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-[1.2] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {siteConfig.tagline}
              </h1>
              <p className="mt-6 text-lg leading-loose text-foreground">
                {siteConfig.description} نعمل مع الجهات المحلية والفرق الشبابية
                على برامج تشجير ومساحات خضراء، بخطة تُدار وتُقاس ويُتابَع أثرها
                بعد التنفيذ.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/join" className={buttonVariants({ size: "lg" })}>
                  كن شريكًا
                </Link>
                <Link
                  href="/initiatives"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                  )}
                >
                  تصفّح المبادرات
                </Link>
              </div>
            </div>

            {/*
              اللوحة: مدينة سورية تنبت من شجرة. زخرفية لا معلوماتية — ما
              تقوله يقوله العنوان إلى جانبها — فـ`alt` فارغ عمدًا، وقراءتها
              على قارئ الشاشة تكرارٌ لا إفادة فيه.
            */}
            <div className="relative mx-auto  w-full max-w-sm lg:-mt-14 lg:max-w-md">
              <Image
                src="/bg/hero.webp"
                alt=""
                width={800}
                height={1000}
                priority
                sizes="(min-width: 1024px) 35vw, (min-width: 640px) 50vw, 80vw"
                className="mx-auto h-auto w-full"
              />
            </div>
          </div>
        </Container>
      </section>

      <Section
        eyebrow="الأثر"
        eyebrowClassName="text-[var(--brand-brown)]"
        title="أرقام موثَّقة لا تقديرات"
        titleClassName="text-[var(--brand-deep-green)]"
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
        eyebrowClassName="text-[var(--brand-brown)]"
        title="ما نعمل عليه"
        titleClassName="text-[var(--brand-deep-green)]"
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
        eyebrowClassName="text-[var(--brand-brown)]"
        title="ما يجري الآن"
        titleClassName="text-[var(--brand-deep-green)]"
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
        backdrop
        className="relative overflow-hidden mb-16"
      >
        <RevealGroup className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {APPROACH.map((item, index) => (
            <div
              key={item.title}
              className="reveal space-y-3"
              style={revealDelay(index, 80)}
            >
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
                <item.icon className="size-5" aria-hidden />
              </span>

              <h3 className="text-base font-bold text-foreground">
                {item.title}
              </h3>

              <p className="text-sm leading-loose text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </RevealGroup>
      </Section>

      <CtaBand />
    </>
  );
}
