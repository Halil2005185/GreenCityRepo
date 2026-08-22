import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

/**
 * عكس اللوحة تمامًا: هذا الموقع وُجد ليُفهرَس. الاستثناء الوحيد مسارات
 * الـAPI إن أُضيفت لاحقًا — لا قيمة لفهرسة JSON.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
