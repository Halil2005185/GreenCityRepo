"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { LocationField, optionalLocationSchema } from "@/components/map/location-field";
import { FormDialog } from "@/components/ui/form-dialog";
import {
  ImageFormField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/form-fields";
import type { SelectOption, SelectSource } from "@/components/ui/select";
import {
  AREA_LEVEL_LABELS,
  ROLLUP_LABELS,
  ROLLUP_SHORT,
  addInitiativeArea,
  addSite,
  createInitiative,
  listMetrics,
  listPrograms,
  searchAreas,
  setInitiativeTarget,
  setSiteTarget,
  updateInitiative,
  updateInitiativeStory,
  updateSite,
  type InitiativeDetail,
  type TargetRollup,
} from "@/lib/api/initiatives";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };
type Site = InitiativeDetail["sites"][number];

/**
 * كل طفرة على المبادرة تعيدها كاملة: توضع في الذاكرة فتتحدّث صفحتاها
 * (العرض والإدارة) بلا طلب ثانٍ، وتُعلَّم القائمة والخريطة والرئيسية
 * للتحديث لأن الحالة والمواقع تظهر فيها كلها.
 */
export function useInitiativeCache() {
  const queryClient = useQueryClient();

  return (detail: InitiativeDetail) => {
    queryClient.setQueryData(["initiative", detail.id], detail);

    for (const queryKey of [["initiatives"], ["map-points"], ["map-areas"], ["dashboard"]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

// ── التواريخ ────────────────────────────────────────────────────────────

/** حقل التاريخ يعطي يومًا بلا وقت ويأخذه. */
function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

/**
 * منتصف اليوم لا منتصف الليل: يقع في اليوم نفسه بأي منطقة زمنية بدل أن
 * ينزلق إلى اليوم السابق.
 */
function fromDateInput(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

const ROLLUP_OPTIONS: SelectOption[] = (Object.keys(ROLLUP_LABELS) as TargetRollup[]).map(
  (value) => ({ value, label: ROLLUP_SHORT[value], description: ROLLUP_LABELS[value] }),
);

// ── المرجعيات المشتركة ──────────────────────────────────────────────────

function usePrograms() {
  return useQuery({ queryKey: ["programs"], queryFn: listPrograms, staleTime: 5 * 60 * 1000 });
}

function useMetrics() {
  return useQuery({ queryKey: ["metrics"], queryFn: listMetrics, staleTime: 5 * 60 * 1000 });
}

/**
 * المناطق تُبحث في الخادم لا تُحمَّل كلها: التسلسل يصل إلى الأحياء، وقائمة
 * بكل أحياء البلاد لا تُقرأ ولا تُحمَّل بسرعة.
 */
export const AREA_SOURCE: SelectSource = {
  queryKey: ["areas", "search"],
  load: (query, signal) =>
    searchAreas(query, signal).then((areas) =>
      areas
        .filter((area) => area.isActive)
        .map((area) => ({
          value: area.id,
          label: area.nameAr,
          description: AREA_LEVEL_LABELS[area.level],
        })),
    ),
};

// ── إنشاء مبادرة ────────────────────────────────────────────────────────

const createSchema = z.object({
  programId: z.string().min(1, "اختر البرنامج."),
  nameAr: z.string().trim().min(2, "اسم المبادرة مطلوب.").max(200, "الاسم طويل جدًا."),
  season: z.string().trim().max(80, "اسم الموسم طويل جدًا."),
  startsAt: z.string(),
  targetRollup: z.string(),
  summaryAr: z.string().trim().max(4000, "النبذة طويلة جدًا."),
});

type CreateValues = z.infer<typeof createSchema>;

const CREATE_DEFAULTS: CreateValues = {
  programId: "",
  nameAr: "",
  season: "",
  startsAt: "",
  targetRollup: "",
  summaryAr: "",
};

/** كانت صفحة `initiatives/new`؛ صارت نافذة، وبعد الإنشاء تُفتح صفحة الإدارة. */
export function InitiativeCreateDialog({ open, onOpenChange }: DialogProps) {
  const router = useRouter();
  const apply = useInitiativeCache();
  const programs = usePrograms();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: CREATE_DEFAULTS,
  });
  const programId = useWatch({ control: form.control, name: "programId" });
  const program = programs.data?.find((item) => item.id === programId);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="إنشاء مبادرة"
      description="تبدأ مسودة، وتُنسخ إليها مراحل البرنامج ومهامه تلقائيًا. المواقع والأهداف تُضاف بعد الإنشاء."
      form={form}
      values={CREATE_DEFAULTS}
      submitLabel="إنشاء المبادرة"
      onSubmit={(values) => {
        const startsAt = fromDateInput(values.startsAt);

        return createInitiative({
          programId: values.programId,
          nameAr: values.nameAr,
          ...(values.season ? { season: values.season } : {}),
          ...(values.summaryAr ? { summaryAr: values.summaryAr } : {}),
          ...(startsAt ? { startsAt } : {}),
          ...(values.targetRollup ? { targetRollup: values.targetRollup as TargetRollup } : {}),
        });
      }}
      successMessage={(initiative) => `أُنشئت «${initiative.nameAr}» مسودةً.`}
      onSuccess={(initiative) => {
        apply(initiative);
        router.push(`/dashboard/initiatives/${initiative.id}/manage`);
      }}
    >
      <SelectField
        control={form.control}
        name="programId"
        label="البرنامج"
        loading={programs.isPending}
        options={(programs.data ?? []).map((item) => ({
          value: item.id,
          label: item.nameAr,
          description: item.isActive
            ? item.templateCount > 0
              ? `${item.templateCount} قالب مهام جاهز`
              : undefined
            : "معطّل",
          disabled: !item.isActive,
        }))}
      />
      <TextField control={form.control} name="nameAr" label="اسم المبادرة" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="season"
          label="الموسم (اختياري)"
          hint="نص حر مثل «موسم التشجير 2026»."
        />
        <TextField
          control={form.control}
          name="startsAt"
          label="تاريخ البدء (اختياري)"
          hint="مواعيد المهام المولّدة من القالب تُحسب منه."
          type="date"
          dir="ltr"
          className="text-start"
        />
      </div>
      <SelectField
        control={form.control}
        name="targetRollup"
        label="سياسة مطابقة الأهداف"
        hint="تُنسخ من البرنامج ثم تستقل — مبادرتان تحت برنامج واحد قد تختلفان."
        clearable
        placeholder={
          program
            ? `افتراضي البرنامج: ${ROLLUP_SHORT[program.defaultTargetRollup]}`
            : "افتراضي البرنامج"
        }
        options={ROLLUP_OPTIONS}
      />
      <TextareaField control={form.control} name="summaryAr" label="نبذة (اختيارية)" rows={3} />
    </FormDialog>
  );
}

// ── تعديل البيانات ──────────────────────────────────────────────────────

const editSchema = z
  .object({
    nameAr: z.string().trim().min(2, "اسم المبادرة مطلوب.").max(200, "الاسم طويل جدًا."),
    season: z.string().trim().max(80, "اسم الموسم طويل جدًا."),
    startsAt: z.string(),
    endsAt: z.string(),
    targetRollup: z.string().min(1, "اختر سياسة المطابقة."),
    summaryAr: z.string().trim().max(4000, "النبذة طويلة جدًا."),
  })
  .refine((values) => !values.startsAt || !values.endsAt || values.endsAt >= values.startsAt, {
    message: "تاريخ الانتهاء قبل تاريخ البدء.",
    path: ["endsAt"],
  });

type EditValues = z.infer<typeof editSchema>;

/**
 * بيانات المبادرة التشغيلية — مسار `PATCH` كان يُستعمل للقصة وحدها،
 * وبقية الحقول بلا واجهة: خطأ في الاسم أو الموعد كان يعني مبادرة جديدة.
 */
export function InitiativeEditDialog({
  initiative,
  ...props
}: DialogProps & { initiative: InitiativeDetail }) {
  const apply = useInitiativeCache();
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { ...CREATE_DEFAULTS, endsAt: "", targetRollup: "ADVISORY" },
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={`بيانات «${initiative.nameAr}»`}
      form={form}
      values={{
        nameAr: initiative.nameAr,
        season: initiative.season ?? "",
        startsAt: toDateInput(initiative.startsAt),
        endsAt: toDateInput(initiative.endsAt),
        targetRollup: initiative.targetRollup,
        summaryAr: initiative.summaryAr ?? "",
      }}
      submitLabel="حفظ البيانات"
      onSubmit={(values) =>
        updateInitiative(initiative.id, {
          nameAr: values.nameAr,
          season: values.season || null,
          startsAt: fromDateInput(values.startsAt),
          endsAt: fromDateInput(values.endsAt),
          targetRollup: values.targetRollup as TargetRollup,
          summaryAr: values.summaryAr || null,
        })
      }
      successMessage="حُفظت البيانات."
      onSuccess={apply}
    >
      <TextField control={form.control} name="nameAr" label="اسم المبادرة" />
      <TextField control={form.control} name="season" label="الموسم (اختياري)" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="startsAt"
          label="تاريخ البدء"
          type="date"
          dir="ltr"
          className="text-start"
        />
        <TextField
          control={form.control}
          name="endsAt"
          label="تاريخ الانتهاء"
          type="date"
          dir="ltr"
          className="text-start"
        />
      </div>
      <SelectField
        control={form.control}
        name="targetRollup"
        label="سياسة مطابقة الأهداف"
        options={ROLLUP_OPTIONS}
      />
      <TextareaField control={form.control} name="summaryAr" label="نبذة" rows={3} />
    </FormDialog>
  );
}

// ── القصة ───────────────────────────────────────────────────────────────

const storySchema = z.object({
  coverImageUrl: z.string(),
  storyAr: z.string().max(20000, "النص طويل جدًا."),
});

type StoryValues = z.infer<typeof storySchema>;

/** كانت تُحرَّر في مكانها برابط صورة يُلصق؛ صارت نافذة برفع حقيقي للغلاف. */
export function StoryDialog({
  initiative,
  ...props
}: DialogProps & { initiative: InitiativeDetail }) {
  const apply = useInitiativeCache();
  const form = useForm<StoryValues>({
    resolver: zodResolver(storySchema),
    defaultValues: { coverImageUrl: "", storyAr: "" },
  });

  return (
    <FormDialog
      {...props}
      size="lg"
      title={`قصة «${initiative.nameAr}»`}
      description="ما يقرؤه القادم من الخريطة: صورة الغلاف والتفاصيل."
      form={form}
      values={{
        coverImageUrl: initiative.coverImageUrl ?? "",
        storyAr: initiative.storyAr ?? "",
      }}
      submitLabel="حفظ القصة"
      onSubmit={(values) =>
        updateInitiativeStory(initiative.id, {
          coverImageUrl: values.coverImageUrl,
          storyAr: values.storyAr,
        })
      }
      successMessage="حُفظت القصة."
      onSuccess={apply}
    >
      <ImageFormField
        control={form.control}
        name="coverImageUrl"
        label="صورة الغلاف"
        purpose="INITIATIVE_COVER"
      />
      <TextareaField
        control={form.control}
        name="storyAr"
        label="التفاصيل"
        hint="افصل الفقرات بسطر فارغ."
        rows={12}
      />
    </FormDialog>
  );
}

// ── الموقع ──────────────────────────────────────────────────────────────

const siteSchema = z.object({
  nameAr: z.string().trim().min(2, "اسم الموقع مطلوب.").max(200, "الاسم طويل جدًا."),
  areaId: z.string(),
  descriptionAr: z.string().trim().max(4000, "الوصف طويل جدًا."),
  location: optionalLocationSchema,
});

type SiteValues = z.infer<typeof siteSchema>;

const EMPTY_SITE: SiteValues = { nameAr: "", areaId: "", descriptionAr: "", location: null };

/**
 * إضافة موقع وتعديله؛ كان التعديل غير متاح إلا بالإلغاء وإضافة موقع جديد.
 *
 * والإحداثيات يقبلها الـAPI منذ البداية ولم يكن لها حقل، فلم تكن حملة
 * تظهر على الخريطة: النقاط تُرسم من المواقع ذات الإحداثيات وحدها.
 */
export function SiteDialog({
  initiativeId,
  site,
  ...props
}: DialogProps & { initiativeId: string; site: Site | null }) {
  const apply = useInitiativeCache();
  const form = useForm<SiteValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: EMPTY_SITE,
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={site ? `تعديل «${site.nameAr}»` : "إضافة موقع"}
      description={site ? undefined : "مكان تنفيذ فعلي: حديقة، مدرسة، شارع. العدد مفتوح."}
      form={form}
      values={
        site
          ? {
              nameAr: site.nameAr,
              areaId: site.areaId ?? "",
              descriptionAr: site.descriptionAr ?? "",
              location:
                site.lat !== null && site.lng !== null ? { lat: site.lat, lng: site.lng } : null,
            }
          : EMPTY_SITE
      }
      submitLabel={site ? "حفظ الموقع" : "إضافة الموقع"}
      onSubmit={(values) =>
        site
          ? updateSite(initiativeId, site.id, {
              nameAr: values.nameAr,
              areaId: values.areaId || null,
              descriptionAr: values.descriptionAr || null,
              // الإحداثيات كلاهما أو لا شيء — شرط الخادم.
              lat: values.location?.lat ?? null,
              lng: values.location?.lng ?? null,
            })
          : addSite(initiativeId, {
              nameAr: values.nameAr,
              ...(values.areaId ? { areaId: values.areaId } : {}),
              ...(values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
              ...(values.location ? { lat: values.location.lat, lng: values.location.lng } : {}),
            })
      }
      successMessage={(detail) => (site ? "حُفظ الموقع." : `أُضيف موقع إلى «${detail.nameAr}».`)}
      onSuccess={apply}
      mapFieldPath={(path) => (path === "lat" || path === "lng" ? "location" : null)}
    >
      <TextField control={form.control} name="nameAr" label="اسم الموقع" />
      <SelectField
        control={form.control}
        name="areaId"
        label="المنطقة (اختيارية)"
        hint="ابحث باسم الحي أو المدينة."
        clearable
        source={AREA_SOURCE}
        selectedOption={
          site?.areaId ? { value: site.areaId, label: site.areaNameAr ?? "…" } : undefined
        }
      />
      <LocationField
        control={form.control}
        name="location"
        label="الموقع على الخريطة (اختياري)"
        hint="بلا إحداثيات لا يظهر الموقع على الخريطة. انقره على الخريطة أو اكتب إحداثياته."
        clearable
      />
      <TextareaField control={form.control} name="descriptionAr" label="وصف (اختياري)" rows={3} />
    </FormDialog>
  );
}

// ── الهدف ───────────────────────────────────────────────────────────────

const targetSchema = z.object({
  metricId: z.string().min(1, "اختر المؤشر."),
  value: z
    .string()
    .trim()
    .min(1, "اكتب قيمة الهدف.")
    .refine((value) => Number(value) > 0, "قيمة الهدف يجب أن تكون أكبر من الصفر.")
    // عمود القاعدة يسع اثنتي عشرة خانة صحيحة.
    .refine((value) => Number(value) <= 999_999_999_999, "القيمة كبيرة جدًا."),
});

type TargetValues = z.infer<typeof targetSchema>;

/**
 * هدف واحد لكل مؤشر في كل نطاق: الإرسال الثاني تحديث لا صف ثانٍ. لذلك
 * يُقفل اختيار المؤشر حين تُفتح النافذة لتعديل هدف قائم.
 */
export function TargetDialog({
  initiative,
  site,
  metricId,
  ...props
}: DialogProps & {
  initiative: InitiativeDetail;
  /** بلا موقع: هدف المبادرة نفسها. */
  site?: Site | null;
  /** مؤشر هدف قائم يُعدَّل. */
  metricId?: string | null;
}) {
  const apply = useInitiativeCache();
  const metrics = useMetrics();
  const form = useForm<TargetValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: { metricId: "", value: "" },
  });
  const chosen = useWatch({ control: form.control, name: "metricId" });
  const unit = metrics.data?.find((metric) => metric.id === chosen)?.unitAr;
  const targets = site ? site.targets : initiative.targets;
  const current = targets.find((target) => target.metricId === metricId);
  // مؤشر اختير وله هدف قائم: الحفظ يستبدله، فيُقال ذلك قبل الضغط.
  const existing = metricId ? undefined : targets.find((target) => target.metricId === chosen);

  return (
    <FormDialog
      {...props}
      size="sm"
      title={site ? `هدف موقع «${site.nameAr}»` : `هدف «${initiative.nameAr}»`}
      description={
        site
          ? "أهداف المواقع تُجمع وتُطابق بهدف المبادرة قبل بدء التنفيذ."
          : "مجموع أهداف المواقع يُطابق به قبل بدء التنفيذ."
      }
      form={form}
      values={{ metricId: metricId ?? "", value: current ? String(current.value) : "" }}
      submitLabel="حفظ الهدف"
      onSubmit={(values) =>
        site
          ? setSiteTarget(initiative.id, site.id, values.metricId, Number(values.value))
          : setInitiativeTarget(initiative.id, values.metricId, Number(values.value))
      }
      successMessage="حُفظ الهدف."
      onSuccess={apply}
    >
      <SelectField
        control={form.control}
        name="metricId"
        label="المؤشر"
        disabled={Boolean(metricId)}
        loading={metrics.isPending}
        options={(metrics.data ?? [])
          .filter((metric) => metric.isActive || metric.id === metricId)
          .map((metric) => ({ value: metric.id, label: metric.nameAr, description: metric.unitAr }))}
      />
      <TextField
        control={form.control}
        name="value"
        label={unit ? `القيمة (${unit})` : "القيمة"}
        hint={existing ? `الهدف الحالي ${existing.value} ${existing.unitAr} — الحفظ يستبدله.` : undefined}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        dir="ltr"
        className="text-start"
      />
    </FormDialog>
  );
}

// ── المنطقة ─────────────────────────────────────────────────────────────

const areaSchema = z.object({ areaId: z.string().min(1, "اختر المنطقة.") });

type AreaValues = z.infer<typeof areaSchema>;

/** إعلان منطقة للمبادرة — المسار قائم في الـAPI ولم تكن له واجهة. */
export function AreaAddDialog({
  initiative,
  ...props
}: DialogProps & { initiative: InitiativeDetail }) {
  const apply = useInitiativeCache();
  const form = useForm<AreaValues>({
    resolver: zodResolver(areaSchema),
    defaultValues: { areaId: "" },
  });
  const linked = new Set(initiative.areas.map((area) => area.areaId));

  return (
    <FormDialog
      {...props}
      size="sm"
      title="إضافة منطقة"
      description="المناطق المعلنة نطاق المبادرة على الخريطة، وتشمل ما تحتها في الترشيح."
      form={form}
      values={{ areaId: "" }}
      submitLabel="إضافة المنطقة"
      onSubmit={(values) => addInitiativeArea(initiative.id, values.areaId)}
      successMessage="أُضيفت المنطقة."
      onSuccess={apply}
    >
      <SelectField
        control={form.control}
        name="areaId"
        label="المنطقة"
        source={{
          // مفتاح خاص بالمعلنة: نتائج البحث العام بلا تعطيل لا تُعاد هنا من الذاكرة.
          queryKey: [...AREA_SOURCE.queryKey, "linked", [...linked].sort().join(",")],
          // المعلنة تظهر معطّلة: اختيارها يعيد تعارضًا من الخادم لا أكثر.
          load: (query, signal) =>
            AREA_SOURCE.load(query, signal).then((options) =>
              options.map((option) =>
                linked.has(option.value)
                  ? { ...option, disabled: true, description: "معلنة بالفعل" }
                  : option,
              ),
            ),
        }}
      />
    </FormDialog>
  );
}
