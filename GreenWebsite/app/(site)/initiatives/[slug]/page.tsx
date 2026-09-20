import { CalendarDays, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand } from "@/components/sections/cta-band";
import { Backdrop } from "@/components/ui/backdrop";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricStat } from "@/components/ui/metric-stat";
import { Section } from "@/components/ui/section";
import { getInitiative } from "@/lib/api/public";
import {
  INITIATIVE_STATUS_LABELS,
  INITIATIVE_STATUS_TONES,
  SITE_STATUS_LABELS,
} from "@/lib/content/labels";
import { formatDate } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/initiatives/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const initiative = await getInitiative(slug);

  if (!initiative) return { title: "مبادرة غير موجودة" };

  return {
    title: initiative.nameAr,
    description: initiative.descriptionAr ?? undefined,
    alternates: { canonical: `/initiatives/${slug}` },
    openGraph: initiative.coverImageUrl
      ? { images: [{ url: initiative.coverImageUrl }] }
      : undefined,
  };
}

export default async function InitiativePage({
  params,
}: PageProps<"/initiatives/[slug]">) {
  const { slug } = await params;
  const initiative = await getInitiative(slug);

  if (!initiative) notFound();

  return (
    <>
      {/* النص هنا بيجٌ كامل لا مخفَّف — القاعدة مشروحة عند `.on-painted` في globals.css. */}
      <div className="on-painted relative isolate border-b border-border py-16 sm:py-24">
        <Backdrop src="/bg/section.webp" priority />

        <Container>
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={INITIATIVE_STATUS_TONES[initiative.status]}>
                {INITIATIVE_STATUS_LABELS[initiative.status]}
              </Badge>
              <Link
                href={`/programs/${initiative.programSlug}`}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge tone="outline" className="hover:text-foreground">
                  {initiative.programNameAr}
                </Badge>
              </Link>
              {initiative.season && (
                <Badge tone="muted">{initiative.season}</Badge>
              )}
            </div>

            <h1 className="text-3xl font-bold leading-[1.25] tracking-tight text-foreground sm:text-4xl">
              {initiative.nameAr}
            </h1>

            {initiative.descriptionAr && (
              <p className="text-lg leading-loose text-foreground">
                {initiative.descriptionAr}
              </p>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground">
              {initiative.areaNamesAr.length > 0 && (
                <span className="flex items-center gap-2">
                  <MapPin className="size-4" aria-hidden />
                  {initiative.areaNamesAr.join("، ")}
                </span>
              )}
              {initiative.startsAt && (
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4" aria-hidden />
                  {formatDate(initiative.startsAt)}
                  {initiative.endsAt && ` — ${formatDate(initiative.endsAt)}`}
                </span>
              )}
            </div>
          </div>
        </Container>
      </div>

      <Section
        title="الأهداف والأثر"
        description="الرقم المعلن هو الموثَّق ميدانيًا وحده؛ ما لم يُتحقق منه بعد لا يُحتسب هنا."
      >
        {initiative.metrics.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initiative.metrics.map((metric) => (
              <MetricStat key={metric.metricId} metric={metric} />
            ))}
          </div>
        ) : (
          <EmptyState title="لم تُعلن مؤشرات هذه المبادرة بعد" />
        )}
      </Section>

      {initiative.storyAr && (
        <Section muted title="عن المبادرة">
          <div className="max-w-3xl space-y-4 text-base leading-loose text-muted-foreground">
            {initiative.storyAr.split("\n\n").map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="مواقع التنفيذ"
        description={`عدد المواقع خاصية لكل مبادرة لا رقم ثابت: ${initiative.siteCount} موقعًا في هذه المبادرة.`}
      >
        {initiative.sites.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initiative.sites.map((site) => (
              <Card key={site.id}>
                <CardHeader>
                  <Badge tone="outline">{SITE_STATUS_LABELS[site.status]}</Badge>
                  <CardTitle>{site.nameAr}</CardTitle>
                  {site.areaNameAr && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="size-4" aria-hidden />
                      {site.areaNameAr}
                    </p>
                  )}
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="لم تُحدَّد مواقع التنفيذ بعد"
            description="تُعلن المواقع بعد الاتفاق عليها مع الجهات المحلية."
          />
        )}
      </Section>

      <CtaBand
        title="شارك في هذه المبادرة"
        description="سواء بدعم ميداني أو خبرة فنية أو تغطية إعلامية — تواصل معنا وسنحدد معك الدور الأنسب."
      />
    </>
  );
}
