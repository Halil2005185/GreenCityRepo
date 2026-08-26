"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Sprout } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MapClient } from "@/components/map/map-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { listMetrics } from "@/lib/api/initiatives";
import {
  CONTRIBUTOR_KIND_LABELS,
  POINT_KIND_LABELS,
  type MapArea,
  type MapPoint,
  createGreenPoint,
  deleteGreenPoint,
  listMapAreas,
  listMapPoints,
} from "@/lib/api/map";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

export default function MapPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<MapArea | null>(null);
  const [picking, setPicking] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("");

  const areas = useQuery({ queryKey: ["map-areas"], queryFn: listMapAreas });
  const points = useQuery({
    queryKey: ["map-points", kindFilter],
    queryFn: () => listMapPoints(kindFilter ? { kind: kindFilter } : {}),
  });
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: listMetrics });

  /** أول مؤشر يقيس بالشجرة هو الافتراضي — يُقرأ من الكتالوج لا من الكود. */
  const treeMetric = metrics.data?.find((metric) => metric.unitAr === "شجرة");

  const create = useMutation({
    mutationFn: createGreenPoint,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["map-points"] });
      void queryClient.invalidateQueries({ queryKey: ["map-areas"] });
      setPin(null);
      setPicking(false);
      setError(null);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError
          ? caught.message
          : "تعذّر توثيق النقطة. حاول مجددًا.",
      ),
  });

  /**
   * الحذف محوٌ لا تراجع عنه، والتأكيد يحمل اسم النقطة لا سؤالًا عامًّا:
   * «هل أنت متأكد؟» تُنقر بلا قراءة، والاسم يوقف اليد على النقطة الخطأ.
   */
  const remove = useMutation({
    mutationFn: (point: MapPoint) => deleteGreenPoint(point.siteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["map-points"] });
      void queryClient.invalidateQueries({ queryKey: ["map-areas"] });
      setError(null);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : "تعذّر حذف النقطة.",
      ),
  });

  const canManage = can(CAPABILITIES.initiativesManage);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">خريطة سورية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الحملات والنقاط الخضراء على خريطة واحدة. مرّر على محافظة لتمييزها،
            وانقرها للتقريب وفتح خياراتها.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { value: "", label: "الكل" },
            { value: "CAMPAIGN", label: POINT_KIND_LABELS.CAMPAIGN },
            { value: "GREEN_POINT", label: POINT_KIND_LABELS.GREEN_POINT },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setKindFilter(filter.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                kindFilter === filter.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {picking ? (
        <Alert variant="info">
          انقر على الخريطة لتحديد موقع النقطة الخضراء.
          <Button
            variant="ghost"
            size="sm"
            className="ms-2"
            onClick={() => {
              setPicking(false);
              setPin(null);
            }}
          >
            إلغاء
          </Button>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {areas.isPending ? (
            <div className="h-[70vh] w-full animate-pulse rounded-xl bg-muted" />
          ) : areas.isError ? (
            <Alert>تعذّر تحميل الخريطة.</Alert>
          ) : (
            <MapClient
              areas={areas.data.data}
              points={points.data ?? []}
              attribution={areas.data.attribution}
              selectedAreaId={selected?.id ?? null}
              onAreaSelect={setSelected}
              picking={picking}
              onPick={(lat, lng) => setPin({ lat, lng })}
              pendingPin={pin}
              onPointDelete={
                canManage
                  ? (point) => {
                      if (
                        window.confirm(
                          `حذف «${point.initiativeNameAr}» نهائيًا؟ يُمحى معها ما وُثّق من أثرها.`,
                        )
                      ) {
                        remove.mutate(point);
                      }
                    }
                  : undefined
              }
              deletingSiteId={remove.isPending ? remove.variables.siteId : null}
            />
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{selected.nameAr}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">حملات</dt>
                    <dd className="font-medium">{selected.campaignCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">نقاط خضراء</dt>
                    <dd className="font-medium">{selected.greenPointCount}</dd>
                  </div>
                </dl>

                {canManage ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Button
                      className="w-full gap-2"
                      variant={picking ? "outline" : "default"}
                      onClick={() => {
                        setPicking(true);
                        setPin(null);
                      }}
                    >
                      <MapPin className="size-4" />
                      توثيق نقطة خضراء
                    </Button>

                    <Link
                      href="/dashboard/initiatives/new"
                      className={buttonVariants({
                        variant: "outline",
                        className: "w-full gap-2",
                      })}
                    >
                      <Sprout className="size-4" />
                      حملة تشجير جديدة
                    </Link>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                انقر محافظة على الخريطة لعرض عدّاداتها وخياراتها.
              </CardContent>
            </Card>
          )}

          {pin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">نقطة خضراء جديدة</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const trees = Number(form.get("trees") ?? 0);

                    create.mutate({
                      nameAr: String(form.get("nameAr") ?? ""),
                      contributorNameAr: String(form.get("contributor") ?? ""),
                      contributorKind: String(
                        form.get("contributorKind") ?? "INDIVIDUAL",
                      ) as keyof typeof CONTRIBUTOR_KIND_LABELS,
                      lat: pin.lat,
                      lng: pin.lng,
                      ...(selected ? { areaId: selected.id } : {}),
                      ...(form.get("story")
                        ? { storyAr: String(form.get("story")) }
                        : {}),
                      ...(form.get("image")
                        ? { coverImageUrl: String(form.get("image")) }
                        : {}),
                      ...(treeMetric && trees > 0
                        ? { metricId: treeMetric.id, metricValue: trees }
                        : {}),
                    });
                  }}
                >
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </p>

                  <Field id="nameAr" label="عنوان النقطة">
                    {(props) => <Input {...props} name="nameAr" required />}
                  </Field>

                  <Field id="contributor" label="من نفّذها">
                    {(props) => <Input {...props} name="contributor" required />}
                  </Field>

                  <div className="space-y-1">
                    <Label htmlFor="contributorKind">صفة المنفّذ</Label>
                    <select
                      id="contributorKind"
                      name="contributorKind"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {Object.entries(CONTRIBUTOR_KIND_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <Field
                    id="trees"
                    label={`عدد ${treeMetric?.nameAr ?? "الأشجار"}`}
                    hint="يدخل المجموع الوطني فور التوثيق."
                  >
                    {(props) => (
                      <Input {...props} name="trees" type="number" min="0" />
                    )}
                  </Field>

                  <Field id="image" label="رابط صورة" hint="مؤقت حتى يُبنى رفع الملفات.">
                    {(props) => (
                      <Input
                        {...props}
                        name="image"
                        type="url"
                        dir="ltr"
                        className="text-start"
                      />
                    )}
                  </Field>

                  <Field id="story" label="تفاصيل">
                    {(props) => (
                      <textarea
                        {...props}
                        name="story"
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    )}
                  </Field>

                  <Button
                    type="submit"
                    className="w-full"
                    loading={create.isPending}
                  >
                    توثيق النقطة
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
