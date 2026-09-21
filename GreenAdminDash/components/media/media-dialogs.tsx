"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type Control, type FieldValues, type Path, useForm } from "react-hook-form";
import { z } from "zod";

import { ClassificationFormFields } from "@/components/relations/classification";
import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import { SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import {
  INTERACTION_KIND_LABELS,
  LOGGABLE_KINDS,
  MEDIA_STAGES,
  changeMediaStage,
  createMediaContact,
  recordMediaInteraction,
  updateMediaContact,
  type ContactPriority,
  type EngagementHorizon,
  type InteractionKind,
  type MediaContactDetail,
  type MediaContactSummary,
  type MediaStage,
} from "@/lib/api/media";
import { statusLabel, statusOptions } from "@/lib/status";
import { phoneSchema } from "@/lib/validation/rules";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * كل طفرة على الشخص تعيد ملفه كاملًا: يوضع في الذاكرة فتتحدّث صفحته بلا
 * طلب ثانٍ، وتُعلَّم القائمة والمتابعات المستحقة للتحديث.
 */
export function useMediaCache() {
  const queryClient = useQueryClient();

  return (detail: MediaContactDetail) => {
    queryClient.setQueryData(["media", "contact", detail.id], detail);
    void queryClient.invalidateQueries({ queryKey: ["media", "contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["media", "follow-ups"] });
  };
}

const orNull = (value: string) => (value ? value : null);

// ── البيانات الأساسية: مشتركة بين الإضافة والتعديل ──────────────────────

const basicShape = {
  fullNameAr: z.string().trim().min(2, "الاسم مطلوب.").max(160, "الاسم طويل جدًا."),
  jobTitleAr: z.string().trim().max(160, "المسمى طويل جدًا."),
  outletNameAr: z.string().trim().max(200, "اسم الجهة طويل جدًا."),
  email: z.union([
    z.email("صيغة البريد غير صحيحة.").max(254, "البريد طويل جدًا."),
    z.literal(""),
  ]),
  phone: z.union([phoneSchema, z.literal("")]),
  profileUrl: z.union([z.url("رابط غير صالح."), z.literal("")]),
  internalNotesAr: z.string().trim().max(4000, "الملاحظات طويلة جدًا."),
};

/** وسيلة تواصل واحدة على الأقل؛ الخطأ تحت الهاتف لأنه أولها في النموذج. */
const REACHABLE = {
  check: (values: { email: string; phone: string; profileUrl: string }) =>
    Boolean(values.email || values.phone || values.profileUrl),
  error: { message: "يلزم بريد أو هاتف أو رابط حساب.", path: ["phone"] },
};

type BasicValues = {
  fullNameAr: string;
  jobTitleAr: string;
  outletNameAr: string;
  email: string;
  phone: string;
  profileUrl: string;
  internalNotesAr: string;
};

function BasicFields<T extends FieldValues & BasicValues>({ control }: { control: Control<T> }) {
  const name = (key: keyof BasicValues) => key as Path<T>;

  return (
    <>
      <TextField control={control} name={name("fullNameAr")} label="الاسم الكامل" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name={name("jobTitleAr")}
          label="المسمى الوظيفي"
          hint="مراسل، صانع محتوى، مصوّر…"
        />
        <TextField
          control={control}
          name={name("outletNameAr")}
          label="الجهة التي يعمل بها"
          hint="اتركه فارغًا للمستقلّين."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name={name("phone")}
          label="رقم الهاتف"
          type="tel"
          dir="ltr"
          className="text-start"
          placeholder="+963…"
        />
        <TextField
          control={control}
          name={name("email")}
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          className="text-start"
        />
      </div>
      <TextField
        control={control}
        name={name("profileUrl")}
        label="رابط الحساب أو الصفحة"
        dir="ltr"
        className="text-start"
        placeholder="https://…"
      />
    </>
  );
}

// ── إضافة شخص ───────────────────────────────────────────────────────────

const createSchema = z
  .object({
    ...basicShape,
    stage: z.string().min(1, "اختر المرحلة."),
    priority: z.string(),
    horizon: z.string(),
    relationshipTypeId: z.string(),
    channelIds: z.array(z.string()),
  })
  .refine(REACHABLE.check, REACHABLE.error);

type CreateValues = z.infer<typeof createSchema>;

const CREATE_DEFAULTS: CreateValues = {
  fullNameAr: "",
  jobTitleAr: "",
  outletNameAr: "",
  email: "",
  phone: "",
  profileUrl: "",
  internalNotesAr: "",
  stage: "NEW",
  priority: "MEDIUM",
  horizon: "",
  relationshipTypeId: "",
  channelIds: [],
};

/** كانت صفحة `media/new` من ثلاث بطاقات؛ صارت نافذة بالأقسام نفسها. */
export function MediaContactCreateDialog({ open, onOpenChange }: DialogProps) {
  const router = useRouter();
  const apply = useMediaCache();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="إضافة إلى الشبكة الإعلامية"
      description="شخص لا جهة. الجهات الشريكة تُسجَّل في سجل الشركاء."
      form={form}
      values={CREATE_DEFAULTS}
      submitLabel="إضافة الشخص"
      onSubmit={(values) =>
        createMediaContact({
          fullNameAr: values.fullNameAr,
          stage: values.stage as MediaStage,
          priority: values.priority as ContactPriority,
          channelIds: values.channelIds,
          ...(values.jobTitleAr ? { jobTitleAr: values.jobTitleAr } : {}),
          ...(values.outletNameAr ? { outletNameAr: values.outletNameAr } : {}),
          ...(values.email ? { email: values.email } : {}),
          ...(values.phone ? { phone: values.phone } : {}),
          ...(values.profileUrl ? { profileUrl: values.profileUrl } : {}),
          ...(values.internalNotesAr ? { internalNotesAr: values.internalNotesAr } : {}),
          ...(values.horizon ? { horizon: values.horizon as EngagementHorizon } : {}),
          ...(values.relationshipTypeId ? { relationshipTypeId: values.relationshipTypeId } : {}),
        })
      }
      successMessage={(contact) => `أُضيف «${contact.fullNameAr}».`}
      onSuccess={(contact) => {
        apply(contact);
        router.push(`/dashboard/media/${contact.id}`);
      }}
    >
      <FormSection
        title="البيانات الأساسية"
        description="الاسم والمسمى الوظيفي ووسيلة تواصل واحدة على الأقل."
      >
        <BasicFields control={form.control} />
      </FormSection>

      <FormSection
        title="التصنيف"
        description="ما يجعل الاختيار وقت التواصل أسرع: بأي شكل يعمل، وما طبيعة علاقتنا به، وكم يهمّنا."
      >
        <SelectField
          control={form.control}
          name="stage"
          label="مرحلة التواصل"
          options={statusOptions("mediaStage", MEDIA_STAGES)}
        />
        <ClassificationFormFields
          control={form.control}
          names={{
            priority: "priority",
            horizon: "horizon",
            relationshipTypeId: "relationshipTypeId",
            channelIds: "channelIds",
          }}
        />
      </FormSection>

      <FormSection title="ملاحظات داخلية" description="لا تظهر لمن لا يملك صلاحية الاطلاع عليها.">
        <TextareaField control={form.control} name="internalNotesAr" label="ملاحظات" rows={4} />
      </FormSection>
    </FormDialog>
  );
}

// ── تعديل البيانات ──────────────────────────────────────────────────────

const editSchema = z.object(basicShape).refine(REACHABLE.check, REACHABLE.error);

type EditValues = z.infer<typeof editSchema>;

/**
 * تعديل بيانات الشخص الأساسية — المسار `PATCH` قائم في الـAPI ولم تكن له
 * واجهة. الملاحظات الداخلية لا تُعرض ولا تُرسل لمن لا يراها: الخادم يعيدها
 * `null` له، وإرسال حقلها فارغًا كان سيمحو ما كتبه غيره.
 */
export function MediaContactEditDialog({
  contact,
  canEditNotes,
  ...props
}: DialogProps & { contact: MediaContactDetail; canEditNotes: boolean }) {
  const apply = useMediaCache();
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  return (
    <FormDialog
      {...props}
      size="lg"
      title={`بيانات «${contact.fullNameAr}»`}
      form={form}
      values={{
        fullNameAr: contact.fullNameAr,
        jobTitleAr: contact.jobTitleAr ?? "",
        outletNameAr: contact.outletNameAr ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        profileUrl: contact.profileUrl ?? "",
        internalNotesAr: contact.internalNotesAr ?? "",
      }}
      submitLabel="حفظ البيانات"
      onSubmit={(values) =>
        updateMediaContact(contact.id, {
          fullNameAr: values.fullNameAr,
          jobTitleAr: orNull(values.jobTitleAr),
          outletNameAr: orNull(values.outletNameAr),
          email: orNull(values.email),
          phone: orNull(values.phone),
          profileUrl: orNull(values.profileUrl),
          ...(canEditNotes ? { internalNotesAr: orNull(values.internalNotesAr) } : {}),
        })
      }
      successMessage="حُفظت البيانات."
      onSuccess={apply}
    >
      <FormSection title="البيانات الأساسية">
        <BasicFields control={form.control} />
      </FormSection>
      {canEditNotes ? (
        <FormSection title="ملاحظات داخلية" description="لا تظهر لمن لا يملك صلاحية الاطلاع عليها.">
          <TextareaField control={form.control} name="internalNotesAr" label="ملاحظات" rows={4} />
        </FormSection>
      ) : null}
    </FormDialog>
  );
}

// ── تسجيل تواصل ─────────────────────────────────────────────────────────

const interactionSchema = z.object({
  kind: z.string().min(1, "اختر نوع التواصل."),
  summaryAr: z
    .string()
    .trim()
    .min(2, "اكتب خلاصة التواصل.")
    .max(300, "الخلاصة طويلة جدًا — التفاصيل في الحقل التالي."),
  bodyAr: z.string().trim().max(4000, "التفاصيل طويلة جدًا."),
  dueAt: z.string(),
});

type InteractionValues = z.infer<typeof interactionSchema>;

const INTERACTION_DEFAULTS: InteractionValues = {
  kind: "CALL",
  summaryAr: "",
  bodyAr: "",
  dueAt: "",
};

const KIND_OPTIONS = LOGGABLE_KINDS.map((kind) => ({
  value: kind,
  label: INTERACTION_KIND_LABELS[kind],
}));

export function LogInteractionDialog({
  contact,
  ...props
}: DialogProps & { contact: MediaContactSummary }) {
  const apply = useMediaCache();
  const form = useForm<InteractionValues>({
    resolver: zodResolver(interactionSchema),
    defaultValues: INTERACTION_DEFAULTS,
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={`تسجيل تواصل مع «${contact.fullNameAr}»`}
      description="كل مكالمة ورسالة واجتماع، ومعها موعد المتابعة إن وُجد. يُحدَّث «آخر تواصل» تلقائيًا."
      form={form}
      values={INTERACTION_DEFAULTS}
      submitLabel="تسجيل التواصل"
      onSubmit={(values) =>
        recordMediaInteraction(contact.id, {
          kind: values.kind as InteractionKind,
          summaryAr: values.summaryAr,
          ...(values.bodyAr ? { bodyAr: values.bodyAr } : {}),
          // حقل التاريخ يعطي يومًا بلا وقت؛ منتصف اليوم يجعله يقع في اليوم
          // نفسه بأي منطقة زمنية بدل أن ينزلق ليلًا إلى اليوم السابق.
          ...(values.dueAt ? { dueAt: new Date(`${values.dueAt}T12:00:00`).toISOString() } : {}),
        })
      }
      successMessage="سُجّل التواصل."
      onSuccess={apply}
    >
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <SelectField control={form.control} name="kind" label="النوع" options={KIND_OPTIONS} />
        <TextField
          control={form.control}
          name="summaryAr"
          label="الخلاصة"
          placeholder="ماذا جرى في سطر واحد"
          maxLength={300}
        />
      </div>
      <TextareaField control={form.control} name="bodyAr" label="تفاصيل (اختيارية)" rows={3} />
      <TextField
        control={form.control}
        name="dueAt"
        label="تذكير بالمتابعة (اختياري)"
        hint="يظهر في المتابعات المستحقة في موعده."
        type="date"
        dir="ltr"
        className="w-48 text-start"
      />
    </FormDialog>
  );
}

// ── نقل المرحلة ─────────────────────────────────────────────────────────

const stageSchema = z.object({
  stage: z.string().min(1, "اختر المرحلة."),
  noteAr: z.string().trim().max(1000, "الملاحظة طويلة جدًا."),
});

type StageValues = z.infer<typeof stageSchema>;

/**
 * كانت رقائق تحفظ عند النقر بشكل رقائق المرشحات نفسها، فلا يُعرف أيها يرشّح
 * وأيها يحفظ. صارت نافذة صريحة، ومعها ملاحظة تُسجَّل مع النقلة.
 */
export function MediaStageDialog({
  contact,
  ...props
}: DialogProps & { contact: MediaContactSummary }) {
  const apply = useMediaCache();
  const form = useForm<StageValues>({
    resolver: zodResolver(stageSchema),
    defaultValues: { stage: "", noteAr: "" },
  });

  return (
    <FormDialog
      {...props}
      size="sm"
      title={`تغيير مرحلة «${contact.fullNameAr}»`}
      description={`المرحلة الحالية: ${statusLabel("mediaStage", contact.stage)}. كل نقلة تُسجَّل في سجل التواصل.`}
      form={form}
      values={{ stage: "", noteAr: "" }}
      submitLabel="نقل الشخص"
      onSubmit={(values) =>
        changeMediaStage(contact.id, values.stage as MediaStage, values.noteAr || undefined)
      }
      successMessage={(detail) =>
        `نُقل «${detail.fullNameAr}» إلى «${statusLabel("mediaStage", detail.stage)}».`
      }
      onSuccess={apply}
    >
      <SelectField
        control={form.control}
        name="stage"
        label="المرحلة الجديدة"
        options={statusOptions(
          "mediaStage",
          MEDIA_STAGES.filter((stage) => stage !== contact.stage),
        )}
      />
      <TextareaField
        control={form.control}
        name="noteAr"
        label="ملاحظة (اختيارية)"
        hint="سبب النقلة — تُحفظ في سجل التواصل."
        rows={3}
      />
    </FormDialog>
  );
}

// ── تعديل التصنيف ───────────────────────────────────────────────────────

const classificationSchema = z.object({
  priority: z.string(),
  horizon: z.string(),
  relationshipTypeId: z.string(),
  channelIds: z.array(z.string()),
});

type ClassificationValues = z.infer<typeof classificationSchema>;

export function MediaClassificationDialog({
  contact,
  ...props
}: DialogProps & { contact: MediaContactDetail }) {
  const apply = useMediaCache();
  const form = useForm<ClassificationValues>({
    resolver: zodResolver(classificationSchema),
    defaultValues: { priority: "MEDIUM", horizon: "", relationshipTypeId: "", channelIds: [] },
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={`تصنيف «${contact.fullNameAr}»`}
      form={form}
      values={{
        priority: contact.priority,
        horizon: contact.horizon ?? "",
        relationshipTypeId: contact.relationshipTypeId ?? "",
        channelIds: contact.channels.map((channel) => channel.id),
      }}
      submitLabel="حفظ التصنيف"
      onSubmit={(values) =>
        updateMediaContact(contact.id, {
          priority: values.priority,
          horizon: values.horizon || null,
          relationshipTypeId: values.relationshipTypeId || null,
          channelIds: values.channelIds,
        })
      }
      successMessage="حُفظ التصنيف."
      onSuccess={apply}
    >
      <ClassificationFormFields
        control={form.control}
        names={{
          priority: "priority",
          horizon: "horizon",
          relationshipTypeId: "relationshipTypeId",
          channelIds: "channelIds",
        }}
        selectedRelationshipType={
          contact.relationshipTypeId
            ? { value: contact.relationshipTypeId, label: contact.relationshipTypeNameAr ?? "…" }
            : null
        }
        selectedChannels={contact.channels.map((channel) => ({
          value: channel.id,
          label: channel.nameAr,
        }))}
      />
    </FormDialog>
  );
}
