import type { MetadataRoute } from "next";

import { listInitiatives, listPrograms } from "@/lib/api/public";
import { siteConfig } from "@/lib/site";

const STATIC_ROUTES: { path: string; priority: number }[] = [
  { path: "", priority: 1 },
  { path: "/about", priority: 0.8 },
  { path: "/programs", priority: 0.8 },
  { path: "/initiatives", priority: 0.9 },
  { path: "/impact", priority: 0.8 },
  { path: "/partners", priority: 0.7 },
  { path: "/join", priority: 0.7 },
  { path: "/contact", priority: 0.5 },
];

/**
 * الصفحات الديناميكية تُدرَج من الـAPI لا من قائمة يدوية، فمبادرة جديدة
 * تدخل الخريطة دون تعديل كود. انقطاع الـAPI يُنقص الخريطة ولا يكسرها.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [programs, initiatives] = await Promise.all([
    listPrograms(),
    listInitiatives(),
  ]);

  const now = new Date();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${siteConfig.url}${route.path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: route.priority,
    })),
    ...programs.map((program) => ({
      url: `${siteConfig.url}/programs/${program.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...initiatives
      .filter((initiative) => initiative.slug)
      .map((initiative) => ({
        url: `${siteConfig.url}/initiatives/${initiative.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
  ];
}
