"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinPlus, Sprout, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InitiativeCreateDialog } from "@/components/initiatives/initiative-dialogs";
import { GreenPointDialog } from "@/components/map/green-point-dialog";
import { MapClient } from "@/components/map/map-client";
import { KIND_COLORS, MAPBOX_TOKEN } from "@/components/map/map-config";
import { PointSheet } from "@/components/map/point-sheet";
import { IconButton } from "@/components/ui/actions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { FilterChips, type ChipOption } from "@/components/ui/toolbar";
import { type MapArea, listMapAreas, listMapPoints } from "@/lib/api/map";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { Coordinates } from "@/lib/map/geometry";

const MANAGE = [CAPABILITIES.initiativesManage];

/** توثيق نقطة خطوتان: تحديد موقعها على الخريطة، ثم نافذة بياناتها. */
type Documenting = { step: "picking" } | { step: "form"; location: Coordinates | null };

/** بطاقة عائمة فوق الخريطة: تلتقط النقر وحدها، وما حولها يبقى للخريطة. */
const FLOATING =
  "pointer-events-auto rounded-lg border border-border bg-card/95 shadow-md backdrop-blur-sm";

function AreaPanel({ area, onClose }: { area: MapArea; onClose: () => void }) {
  return (
    <section aria-labelledby="selected-area" className={`${FLOATING} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <h2 id="selected-area" className="pt-0.5 font-semibold">
          {area.nameAr}
        </h2>
        <IconButton
          label="إلغاء تحديد المحافظة"
          icon={X}
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
        {(
          [
            ["حملات التشجير", area.campaignCount, KIND_COLORS.CAMPAIGN],
            ["النقاط الخضراء", area.greenPointCount, KIND_COLORS.GREEN_POINT],
          ] as const
        ).map(([label, count, color]) => (
          <div key={label} className="space-y-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </dt>
            <dd className="numeric font-semibold">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function MapPage() {
  const [filters, setFilters] = useUrlState({ kind: "", area: "", point: "" });
  const [documenting, setDocumenting] = useState<Documenting | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const areas = useQuery({ queryKey: ["map-areas"], queryFn: listMapAreas });
  // النقاط كلها في طلب واحد والتصفية بالنوع هنا: التبديل بين الرقائق فوري،
  // ولوحة نقطة مفتوحة برابط لا تسقط لأن المرشح لا يشملها.
  const points = useQuery({ queryKey: ["map-points"], queryFn: () => listMapPoints() });

  const areaList = areas.data?.data;
  const selectedArea = areaList?.find((area) => area.slug === filters.area) ?? null;
  const selectedPoint = points.data?.find((point) => point.siteId === filters.point) ?? null;

  const visiblePoints = useMemo(
    () => (points.data ?? []).filter((point) => !filters.kind || point.kind === filters.kind),
    [points.data, filters.kind],
  );

  const kindChips = useMemo<ChipOption[]>(() => {
    const count = (kind: string) => points.data?.filter((point) => point.kind === kind).length;

    return [
      { value: "", label: "الكل", count: points.data?.length },
      {
        value: "CAMPAIGN",
        label: "حملات التشجير",
        count: count("CAMPAIGN"),
        swatch: KIND_COLORS.CAMPAIGN,
      },
      {
        value: "GREEN_POINT",
        label: "النقاط الخضراء",
        count: count("GREEN_POINT"),
        swatch: KIND_COLORS.GREEN_POINT,
      },
    ];
  }, [points.data]);

  const areaOptions = useMemo<SelectOption[]>(
    () => (areaList ?? []).map((area) => ({ value: area.slug, label: area.nameAr })),
    [areaList],
  );

  /**
   * الوصول برابط إلى نقطة (من جدول مواقع المبادرة): تطير الخريطة إليها
   * مرة واحدة حين تصل النقاط. النقر على نقطة ظاهرة لا يحرّك الخريطة.
   */
  const [linkedPointId] = useState(filters.point);
  const linkedPoint = linkedPointId
    ? points.data?.find((point) => point.siteId === linkedPointId)
    : undefined;
  const focus = linkedPoint ? { lat: linkedPoint.lat, lng: linkedPoint.lng } : null;

  const picking = documenting?.step === "picking";

  useEffect(() => {
    if (!picking) return;

    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDocumenting(null);
    };

    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [picking]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader
        title="خريطة سورية"
        description="الحملات والنقاط الخضراء على خريطة واحدة. مرّر على محافظة لتمييزها، وانقرها للتقريب."
        primaryAction={{
          key: "document",
          label: "توثيق نقطة خضراء",
          icon: MapPinPlus,
          requires: MANAGE,
          disabled: picking || !areas.isSuccess,
          disabledReason: picking
            ? "انقر موقع النقطة على الخريطة، أو اضغط Esc للإلغاء."
            : "تُحمَّل حدود المحافظات…",
          // بلا رمز Mapbox لا خريطة يُنقر فيها، فتُفتح النافذة لكتابة الإحداثيات.
          onSelect: () =>
            setDocumenting(MAPBOX_TOKEN ? { step: "picking" } : { step: "form", location: null }),
        }}
        secondaryActions={[
          {
            key: "campaign",
            label: "حملة تشجير جديدة",
            icon: Sprout,
            requires: MANAGE,
            onSelect: () => setCreatingCampaign(true),
          },
        ]}
      />

      {/*
        الخريطة تملأ مساحة المحتوى الباقية، واللوحات تطفو فوقها في جهة
        البداية وأدوات التقريب في جهة النهاية — لا عمود جانبي يبقى فارغًا
        حتى يُنقر شيء.
      */}
      <div className="relative flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted">
        {areas.isPending ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : areas.isError ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <ErrorState
              title="تعذّر تحميل الخريطة."
              error={areas.error}
              onRetry={() => void areas.refetch()}
            />
          </div>
        ) : (
          <div className="absolute inset-0">
            <MapClient
              areas={areas.data.data}
              attribution={areas.data.attribution}
              points={visiblePoints}
              selectedAreaId={selectedArea?.id ?? null}
              onAreaSelect={(area) => setFilters({ area: area.slug })}
              selectedPointId={selectedPoint?.siteId ?? null}
              onPointSelect={(point) => setFilters({ point: point.siteId })}
              picking={picking}
              onPick={(location) => setDocumenting({ step: "form", location })}
              focus={focus}
            />
          </div>
        )}

        {/* بلا رمز Mapbox تحلّ رسالة محل الخريطة، ولا معنى لمرشحات فوقها. */}
        {areas.isSuccess && MAPBOX_TOKEN ? (
          <div className="pointer-events-none absolute start-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-2 sm:w-96">
            {picking ? (
              <div role="status" className={`${FLOATING} w-full space-y-2 border-primary/40 p-3`}>
                <p className="text-sm font-medium">انقر موقع النقطة الخضراء على الخريطة.</p>
                <p className="text-xs text-muted-foreground">
                  تُفتح بعدها نافذة التوثيق، وفيها يُسحب الدبوس لضبط الموقع. مفتاح{" "}
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">
                    Esc
                  </kbd>{" "}
                  يلغي.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDocumenting(null)}>
                    إلغاء التحديد
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDocumenting({ step: "form", location: null })}
                  >
                    كتابة الإحداثيات
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className={`${FLOATING} w-full space-y-2 p-2.5`}>
                  <FilterChips
                    label="نوع النقاط"
                    value={filters.kind}
                    onChange={(kind) => setFilters({ kind })}
                    options={kindChips}
                  />
                  {/* المحافظات من لوحة المفاتيح أيضًا، لا بالنقر على الخريطة وحده. */}
                  <Select
                    size="sm"
                    label="المحافظة"
                    placeholder="الكل"
                    clearable
                    className="w-full"
                    options={areaOptions}
                    value={filters.area || null}
                    onChange={(area) => setFilters({ area })}
                  />
                  {points.isError ? (
                    <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
                      تعذّر تحميل النقاط.
                      <Button size="xs" variant="outline" onClick={() => void points.refetch()}>
                        إعادة المحاولة
                      </Button>
                    </p>
                  ) : null}
                </div>

                {selectedArea ? (
                  <AreaPanel area={selectedArea} onClose={() => setFilters({ area: "" })} />
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <PointSheet point={selectedPoint} onClose={() => setFilters({ point: "" })} />

      <GreenPointDialog
        open={documenting?.step === "form"}
        onOpenChange={(open) => {
          if (!open) setDocumenting(null);
        }}
        location={documenting?.step === "form" ? documenting.location : null}
        areas={areaList ?? []}
      />

      <InitiativeCreateDialog open={creatingCampaign} onOpenChange={setCreatingCampaign} />
    </div>
  );
}
