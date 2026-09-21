"use client";

import { MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import { MAPBOX_TOKEN } from "./map-config";
import type { MapViewProps } from "./map-view";

/**
 * `mapbox-gl` يلمس `window` وقت الاستيراد، ووزنه يقارب ميغابايتين، فيجب
 * ألا يُصيَّر على الخادم ولا يدخل حزمة الـWorker ولا حزمة الصفحة الأولى.
 *
 * و`ssr: false` غير مسموح داخل مكوّن خادم، لذلك يعيش هذا الغلاف في وحدة
 * عميل مستقلة وتستورده الصفحات والنماذج منها — لا من `map-view` مباشرة.
 * واستيراد النوع وحده يُمحى عند البناء فلا يجرّ المكتبة معه.
 */
const DynamicMapView = dynamic(() => import("./map-view").then((module) => module.MapView), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

/** مكان الخريطة حين بُنيت اللوحة بلا رمز Mapbox: رسالة تشرح لا مساحة فارغة. */
export function MapUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      className="flex size-full flex-col items-center justify-center gap-2 bg-muted/50 p-6 text-center"
    >
      <MapPinOff className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">الخريطة غير مهيّأة في هذا البناء</p>
      <p className="max-w-md text-xs text-muted-foreground">
        {compact ? (
          "اكتب الإحداثيات في الحقلين أدناه."
        ) : (
          <>
            لم يُضبط رمز Mapbox العام{" "}
            <code dir="ltr" className="rounded bg-muted px-1 font-mono">
              NEXT_PUBLIC_MAPBOX_TOKEN
            </code>{" "}
            وقت البناء. أضفه إلى بيئة البناء ثم أعد النشر.
          </>
        )}
      </p>
    </div>
  );
}

export function MapClient(props: MapViewProps) {
  if (!MAPBOX_TOKEN) return <MapUnavailable compact={props.compact} />;

  return <DynamicMapView {...props} />;
}
