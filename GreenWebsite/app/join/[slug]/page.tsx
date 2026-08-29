import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicFormRenderer } from "@/components/forms/public-form";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/section";
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
    <>
      <PageHeader
        eyebrow="انضم إلينا"
        title={form.nameAr}
        {...(form.descriptionAr ? { description: form.descriptionAr } : {})}
      />

      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-2xl">
            <PublicFormRenderer form={form} />

            <p className="mt-8 text-sm text-muted-foreground">
              لست متأكدًا أن هذه استمارتك؟{" "}
              <Link
                href="/join"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                طرق المشاركة كلها
              </Link>
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
