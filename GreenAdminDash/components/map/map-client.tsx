"use client";

import dynamic from "next/dynamic";

/**
 * Leaflet يلمس `window` وقت الاستيراد، فيجب ألا يُصيَّر على الخادم.
 *
 * و`ssr: false` غير مسموح داخل مكوّن خادم، لذلك يعيش هذا الغلاف في وحدة
 * عميل مستقلة وتستورده الصفحة منها — لا العكس.
 */
export const MapClient = dynamic(
  () => import("./syria-map").then((module) => module.SyriaMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[70vh] w-full animate-pulse rounded-xl bg-muted" />
    ),
  },
);
