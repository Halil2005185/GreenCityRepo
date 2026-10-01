"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { type DefaultValues, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/components/ui/card";
import { LookupSelectField } from "@/components/lookups/lookup-select";
import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import {
  ImageFormField,
  TextField,
  TextareaField,
} from "@/components/ui/form-fields";
import { listMetrics } from "@/lib/api/initiatives";
import {
  type MapArea,
  type MapPoint,
  createGreenPoint,
} from "@/lib/api/map";
import { type Coordinates, areaAt, isValidCoordinates } from "@/lib/map/geometry";

import { LocationField, locationSchema } from "./location-field";

const schema = z.object({
  location: locationSchema,
  nameAr: z
    .string()
    .trim()
    .min(3, "عنوان النقطة يجب ألا يقل عن 3 أحرف.")
    .max(200, "عنوان النقطة طويل جدًا."),
  contributorNameAr: z
    .string()
    .trim()
    .min(2, "اسم المنفّذ يجب ألا يقل عن حرفين.")
    .max(200, "اسم المنفّذ طويل جدًا."),
  contributorKindId: z.string(),
  trees: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0),
      "العدد يجب أن يكون رقمًا صحيحًا غير سالب.",
    ),
  coverImageUrl: z.string(),
  storyAr: z.string().trim().max(20000, "التفاصيل طويلة جدًا."),
});

type Values = z.infer<typeof schema>;

const DEFAULTS = {
  nameAr: "",
  contributorNameAr: "",
  contributorKindId: "",
  trees: "",
  coverImageUrl: "",
  storyAr: "",
} satisfies Omit<Values, "location">;

/** أسماء حقول الخادم التي لا تطابق حقول النموذج. */
function fieldOf(path: string): keyof Values | null {
  if (path === "lat" || path === "lng" || path === "areaId") return "location";
  if (path === "metricId" || path === "metricValue") return "trees";

  return path in DEFAULTS ? (path as keyof Values) : null;
}

/**
 * توثيق نقطة خضراء بعد وضع دبوسها على الخريطة. كان نموذجًا يُلحق بعمود
 * ضيق بجانب الخريطة فيطول عنها؛ صار نافذة بالإحداثيات معبأة، وفيها خريطة
 * مصغّرة يُسحب دبوسها لضبط الموقع قبل الحفظ.
 */
export function GreenPointDialog({
  open,
  onOpenChange,
  location,
  areas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** موقع الدبوس الذي فُتحت عنده النافذة؛ بدونه تُكتب الإحداثيات يدويًا. */
  location: Coordinates | null;
  areas: MapArea[];
}) {
  const queryClient = useQueryClient();
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: listMetrics, staleTime: 5 * 60 * 1000 });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  /** أول مؤشر يقيس بالشجرة هو الافتراضي — يُقرأ من الكتالوج لا من الكود. */
  const treeMetric = metrics.data?.find((metric) => metric.unitAr === "شجرة");

  /**
   * المحافظة تُشتق من موقع الدبوس نفسه لا من المحافظة المختارة على
   * الخريطة: الدبوس قد يوضع في غيرها، فتُحسب النقطة في عدّاد لا تقع فيه.
   */
  const picked = useWatch({ control: form.control, name: "location" });
  const area = isValidCoordinates(picked) ? areaAt(areas, picked) : null;

  const initial: DefaultValues<Values> = location ? { ...DEFAULTS, location } : DEFAULTS;

  return (
    // النوع صريح: القيم الابتدائية جزئية (الموقع قد يغيب)، فلا يُستنتج منها نوع النموذج.
    <FormDialog<Values, MapPoint>
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="توثيق نقطة خضراء"
      description="نقطة زرعها فرد أو جهة ونوثّقها على الخريطة، فتدخل أشجارها المجموع الوطني."
      form={form}
      values={initial}
      submitLabel="توثيق النقطة"
      onSubmit={(values) => {
        const trees = values.trees ? Number(values.trees) : 0;

        return createGreenPoint({
          nameAr: values.nameAr,
          contributorNameAr: values.contributorNameAr,
          ...(values.contributorKindId ? { contributorKindId: values.contributorKindId } : {}),
          lat: values.location.lat,
          lng: values.location.lng,
          ...(area ? { areaId: area.id } : {}),
          ...(values.storyAr ? { storyAr: values.storyAr } : {}),
          ...(values.coverImageUrl ? { coverImageUrl: values.coverImageUrl } : {}),
          ...(treeMetric && trees > 0 ? { metricId: treeMetric.id, metricValue: trees } : {}),
        });
      }}
      successMessage={(point) => `وُثّقت «${point.initiativeNameAr}» على الخريطة.`}
      onSuccess={() => {
        for (const queryKey of [["map-points"], ["map-areas"], ["initiatives"], ["dashboard"]]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }}
      mapFieldPath={fieldOf}
    >
      <FormSection title="الموقع">
        <LocationField control={form.control} name="location" label="موقع النقطة" />

        {isValidCoordinates(picked) ? (
          area ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              تقع في محافظة {area.nameAr}، وتُحسب في عدّادها.
            </p>
          ) : (
            <Alert variant="warning">
              الموقع خارج حدود المحافظات، فلن تُحسب النقطة في عدّاد أي محافظة.
            </Alert>
          )
        ) : null}
      </FormSection>

      <FormSection title="النقطة">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="nameAr" label="عنوان النقطة" />
          <TextField control={form.control} name="contributorNameAr" label="من نفّذها" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <LookupSelectField
            control={form.control}
            name="contributorKindId"
            code="CONTRIBUTOR_KIND"
            label="صفة المنفّذ"
            placeholder="غير محددة"
            clearable
          />
          {/* بلا مؤشر يقيس بالشجرة لا مكان يُسجَّل فيه العدد، فلا يُطلب. */}
          {treeMetric || metrics.isPending ? (
            <TextField
              control={form.control}
              name="trees"
              label={`عدد ${treeMetric?.nameAr ?? "الأشجار"} (اختياري)`}
              hint="يدخل المجموع الوطني فور التوثيق."
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              dir="ltr"
              className="text-start"
            />
          ) : null}
        </div>
      </FormSection>

      <FormSection title="التفاصيل">
        <ImageFormField
          control={form.control}
          name="coverImageUrl"
          label="صورة النقطة (اختيارية)"
          purpose="GREEN_POINT_COVER"
        />
        <TextareaField control={form.control} name="storyAr" label="تفاصيل (اختيارية)" rows={4} />
      </FormSection>
    </FormDialog>
  );
}
