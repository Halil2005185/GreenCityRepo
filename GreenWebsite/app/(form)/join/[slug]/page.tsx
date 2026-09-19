import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IntroContent } from "@/components/forms/intro-content";
import { PublicFormRenderer } from "@/components/forms/public-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getPublicForm } from "@/lib/api/public";

export async function generateMetadata({
  params,
}: PageProps<"/join/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const form = await getPublicForm(slug);

  if (!form) return { title: "استمارة غير متاحة" };

  return {
    title: form.nameAr,
    description: form.descriptionAr ?? undefined,
    alternates: { canonical: `/join/${slug}` },
    ...(form.coverImageUrl
      ? { openGraph: { images: [{ url: form.coverImageUrl }] } }
      : {}),
  };
}

/**
 * صفحة الاستمارة العامة — هذا هو رابط التسجيل الذي يُنشر: `/join/<slug>`.
 *
 * تُقرأ على الخادم لا في المتصفح: قراءة الاستمارة محدودة بستين طلبًا لكل
 * ربع ساعة للعنوان الواحد، فلو قرأها كل زائر بنفسه لأغلقت حملةٌ ناجحة
 * الباب على نفسها. التخزين المؤقت يجعل الخادم يسأل مرة كل دقيقة مهما
 * كثر الزوار. أما الإرسال فمن المتصفح، وهناك يعني الحدّ ما وُضع له.
 */
export default async function PublicFormPage({
  params,
}: PageProps<"/join/[slug]">) {
  const { slug } = await params;
  const form = await getPublicForm(slug);

  // غير المنشورة وغير الموجودة سواء — كما يقرّر الخادم، فلا تُستكشف الأسماء.
  if (!form) notFound();

  return (
    <section className="py-8 sm:py-12">
      <Container>
        {/*
          بطاقتان لا صفحة: رأس ثم أسئلة. الشكل مقصود — من ملأ استمارة على
          الويب يعرف هذا الترتيب، وما يُعرف لا يُشرح.
        */}
        <div className="mx-auto max-w-2xl space-y-4">
          <Card className="overflow-hidden">
            {/* شريط علوي بلون الهوية: رأس البطاقة يُميَّز قبل أن يُقرأ. */}
            <div className="h-2 bg-primary" />

            {form.coverImageUrl ? (
              // رابط خارجي يضبطه الفريق، فلا `next/image` بلا نطاق مسموح.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.coverImageUrl}
                alt=""
                className="aspect-[16/7] w-full object-cover"
              />
            ) : null}

            <header className="space-y-4 p-6">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {form.nameAr}
              </h1>

              {form.descriptionAr ? (
                <p className="leading-loose text-muted-foreground">
                  {form.descriptionAr}
                </p>
              ) : null}

              {form.introJson ? <IntroContent doc={form.introJson} /> : null}
            </header>
          </Card>

          <Card className="p-6">
            <PublicFormRenderer form={form} />
          </Card>

          <p className="px-1 text-sm text-muted-foreground">
            لست متأكدًا أن هذه استمارتك؟{" "}
            <Link
              href="/join"
              className="font-medium text-accent-ink underline-offset-4 hover:underline"
            >
              طرق المشاركة كلها
            </Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
