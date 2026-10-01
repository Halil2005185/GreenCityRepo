"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LookupSelectField, useLookupDefault } from "@/components/lookups/lookup-select";
import { ClassificationFormFields } from "@/components/relations/classification";
import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import {
  CheckboxField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/form-fields";
import { OneTimeLink } from "@/components/ui/one-time-link";
import { createInvitation, listPartnerRoles } from "@/lib/api/invitations";
import {
  PARTNERSHIP_TYPE_LABELS,
  PIPELINE_STAGES,
  addContact,
  addPartnership,
  changeStage,
  createPartner,
  recordAcknowledgement,
  updatePartner,
  type PartnerDetail,
  type PartnerSummary,
  type PartnershipType,
} from "@/lib/api/partners";
import { statusLabel } from "@/lib/status";
import { phoneSchema } from "@/lib/validation/rules";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * كل طفرة على الجهة تعيد ملفها كاملًا: يوضع في الذاكرة مباشرة فتتحدّث
 * صفحتها بلا طلب ثانٍ، وتُعلَّم القوائم والرئيسية للتحديث.
 */
export function usePartnerCache() {
  const queryClient = useQueryClient();

  return (detail: PartnerDetail) => {
    queryClient.setQueryData(["partner", detail.id], detail);
    void queryClient.invalidateQueries({ queryKey: ["partners"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

// ── تسجيل جهة ───────────────────────────────────────────────────────────

const createSchema = z.object({
  legalNameAr: z
    .string()
    .trim()
    .min(2, "الاسم القانوني مطلوب.")
    .max(200, "الاسم القانوني طويل جدًا."),
  displayNameAr: z.string().trim().max(200, "اسم العرض طويل جدًا."),
  organizationKindId: z.string().min(1, "اختر نوع الجهة."),
  websiteUrl: z.union([z.url("رابط غير صالح."), z.literal("")]),
  supportFormIds: z.array(z.string()),
  contactPriorityId: z.string(),
  engagementHorizonId: z.string(),
  relationshipTypeId: z.string(),
  mediaChannelIds: z.array(z.string()),
  summaryAr: z.string().trim().max(2000, "النبذة طويلة جدًا."),
  internalNotesAr: z.string().trim().max(4000, "الملاحظات طويلة جدًا."),
});

type CreateValues = z.infer<typeof createSchema>;

const CREATE_DEFAULTS: CreateValues = {
  legalNameAr: "",
  displayNameAr: "",
  organizationKindId: "",
  websiteUrl: "",
  supportFormIds: [],
  contactPriorityId: "",
  engagementHorizonId: "",
  relationshipTypeId: "",
  mediaChannelIds: [],
  summaryAr: "",
  internalNotesAr: "",
};

/**
 * كانت صفحة `partners/new` كاملة. بعد التسجيل ينتقل المستخدم إلى صفحة
 * الجهة، فهناك يكمل: أنواع الشراكة وجهات الاتصال والإقرار.
 */
export function PartnerCreateDialog({ open, onOpenChange }: DialogProps) {
  const router = useRouter();
  const apply = usePartnerCache();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: CREATE_DEFAULTS,
  });
  useLookupDefault(form, "contactPriorityId", "CONTACT_PRIORITY", "MEDIUM", open);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="تسجيل جهة محتملة"
      description="تبدأ الجهة في مرحلة «جديدة». أنواع الشراكة وجهات الاتصال والإقرار بالميثاق تُضاف من صفحتها بعد التسجيل."
      form={form}
      values={CREATE_DEFAULTS}
      submitLabel="تسجيل الجهة"
      onSubmit={(values) =>
        createPartner({
          legalNameAr: values.legalNameAr,
          organizationKindId: values.organizationKindId,
          supportFormIds: values.supportFormIds,
          mediaChannelIds: values.mediaChannelIds,
          ...(values.contactPriorityId ? { contactPriorityId: values.contactPriorityId } : {}),
          ...(values.displayNameAr ? { displayNameAr: values.displayNameAr } : {}),
          ...(values.websiteUrl ? { websiteUrl: values.websiteUrl } : {}),
          ...(values.summaryAr ? { summaryAr: values.summaryAr } : {}),
          ...(values.internalNotesAr ? { internalNotesAr: values.internalNotesAr } : {}),
          ...(values.engagementHorizonId
            ? { engagementHorizonId: values.engagementHorizonId }
            : {}),
          ...(values.relationshipTypeId
            ? { relationshipTypeId: values.relationshipTypeId }
            : {}),
        })
      }
      successMessage={(partner) => `سُجّلت «${partner.displayNameAr}».`}
      onSuccess={(partner) => {
        apply(partner);
        router.push(`/dashboard/partners/${partner.id}`);
      }}
    >
      <FormSection
        title="بيانات الجهة"
        description="الاسم القانوني للسجلات، واسم العرض هو ما يظهر في اللوحة وفي الشراكات."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="legalNameAr" label="الاسم القانوني" />
          <TextField
            control={form.control}
            name="displayNameAr"
            label="اسم العرض"
            hint="اتركه فارغًا ليطابق الاسم القانوني."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <LookupSelectField
            control={form.control}
            name="organizationKindId"
            code="ORGANIZATION_KIND"
            label="نوع الجهة"
            placeholder="اختر النوع…"
          />
          <TextField
            control={form.control}
            name="websiteUrl"
            label="الموقع الإلكتروني"
            dir="ltr"
            className="text-start"
            placeholder="https://example.org"
          />
        </div>
        <LookupSelectField
          control={form.control}
          name="supportFormIds"
          code="SUPPORT_FORM"
          label="أشكال المشاركة والدعم"
          hint="يمكن اختيار أكثر من شكل."
          placeholder="اختر شكلًا أو أكثر"
          multiple
          clearable
        />
      </FormSection>

      <FormSection title="تصنيف العلاقة" description="كلها اختيارية الآن وتُضبط بعد أول تواصل.">
        <ClassificationFormFields
          control={form.control}
          names={{
            priority: "contactPriorityId",
            horizon: "engagementHorizonId",
            relationshipTypeId: "relationshipTypeId",
            channelIds: "mediaChannelIds",
          }}
        />
      </FormSection>

      <FormSection title="ملاحظات">
        <TextareaField control={form.control} name="summaryAr" label="نبذة عن الجهة" rows={3} />
        <TextareaField
          control={form.control}
          name="internalNotesAr"
          label="ملاحظات داخلية"
          hint="لا تظهر للجهة إطلاقًا، ولا لمن لا يملك صلاحية الاطلاع عليها."
          rows={3}
        />
      </FormSection>
    </FormDialog>
  );
}

// ── نقل المرحلة ─────────────────────────────────────────────────────────

const stageSchema = z.object({
  stage: z.string().min(1, "اختر المرحلة."),
  noteAr: z.string().trim().max(1000, "الملاحظة طويلة جدًا."),
});

type StageValues = z.infer<typeof stageSchema>;

/** المراحل التي ينقلها مكتب العلاقات؛ الاعتماد والتعليق لهما مساراتهما. */
export function PartnerStageDialog({
  partner,
  ...props
}: DialogProps & { partner: PartnerSummary }) {
  const apply = usePartnerCache();
  const form = useForm<StageValues>({
    resolver: zodResolver(stageSchema),
    defaultValues: { stage: "", noteAr: "" },
  });

  const options = PIPELINE_STAGES.filter((stage) => stage !== partner.stage).map((stage) => ({
    value: stage,
    label: statusLabel("partnerStage", stage),
  }));

  return (
    <FormDialog
      {...props}
      size="sm"
      title={`تغيير مرحلة «${partner.displayNameAr}»`}
      description={`المرحلة الحالية: ${statusLabel("partnerStage", partner.stage)}.`}
      form={form}
      values={{ stage: "", noteAr: "" }}
      submitLabel="نقل الجهة"
      onSubmit={(values) => changeStage(partner.id, values.stage, values.noteAr || undefined)}
      successMessage={(detail) =>
        `نُقلت «${detail.displayNameAr}» إلى «${statusLabel("partnerStage", detail.stage)}».`
      }
      onSuccess={apply}
    >
      <SelectField control={form.control} name="stage" label="المرحلة الجديدة" options={options} />
      <TextareaField
        control={form.control}
        name="noteAr"
        label="ملاحظة (اختيارية)"
        hint="سبب النقلة أو ما اتُّفق عليه — تُحفظ مع التغيير."
        rows={3}
      />
    </FormDialog>
  );
}

// ── تعديل التصنيف ───────────────────────────────────────────────────────

const classificationSchema = z.object({
  contactPriorityId: z.string().min(1, "اختر الأولوية."),
  engagementHorizonId: z.string(),
  relationshipTypeId: z.string(),
  mediaChannelIds: z.array(z.string()),
});

type ClassificationValues = z.infer<typeof classificationSchema>;

/** يحتاج ملف الجهة كاملًا، كما تفتحه صفحتها. */
export function PartnerClassificationDialog({
  partner,
  ...props
}: DialogProps & { partner: PartnerDetail }) {
  const apply = usePartnerCache();
  const form = useForm<ClassificationValues>({
    resolver: zodResolver(classificationSchema),
    defaultValues: {
      contactPriorityId: "",
      engagementHorizonId: "",
      relationshipTypeId: "",
      mediaChannelIds: [],
    },
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={`تصنيف «${partner.displayNameAr}»`}
      form={form}
      values={{
        contactPriorityId: partner.contactPriority.id,
        engagementHorizonId: partner.engagementHorizon?.id ?? "",
        relationshipTypeId: partner.relationshipType?.id ?? "",
        mediaChannelIds: partner.mediaChannels.map((channel) => channel.id),
      }}
      submitLabel="حفظ التصنيف"
      onSubmit={(values) =>
        updatePartner(partner.id, {
          contactPriorityId: values.contactPriorityId,
          engagementHorizonId: values.engagementHorizonId || null,
          relationshipTypeId: values.relationshipTypeId || null,
          mediaChannelIds: values.mediaChannelIds,
        })
      }
      successMessage="حُفظ التصنيف."
      onSuccess={apply}
    >
      <ClassificationFormFields
        control={form.control}
        names={{
          priority: "contactPriorityId",
          horizon: "engagementHorizonId",
          relationshipTypeId: "relationshipTypeId",
          channelIds: "mediaChannelIds",
        }}
        selected={{
          priority: partner.contactPriority,
          horizon: partner.engagementHorizon,
          relationshipType: partner.relationshipType,
          channels: partner.mediaChannels,
        }}
      />
    </FormDialog>
  );
}

// ── دعوة ممثل ───────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.email("صيغة البريد الإلكتروني غير صحيحة."),
  fullNameAr: z.string().trim().max(160, "الاسم طويل جدًا."),
  roleId: z.string().min(1, "اختر الدور."),
});

type InviteValues = z.infer<typeof inviteSchema>;

/**
 * الرابط يعود مرة واحدة ولا يُسترجع بعدها، فيبقى في النافذة نفسها بعد
 * النجاح حتى يُنسخ، لا في صفحة تضيع بإعادة التحميل.
 */
export function PartnerInviteDialog({
  partner,
  email,
  fullNameAr,
  roleId,
  ...props
}: DialogProps & {
  /** الاسم والمعرّف وحدهما: صفحة الدعوات تعيد الإرسال بلا ملف الجهة. */
  partner: Pick<PartnerSummary, "id" | "displayNameAr">;
  email?: string;
  fullNameAr?: string;
  roleId?: string;
}) {
  const queryClient = useQueryClient();
  const roles = useQuery({
    queryKey: ["roles", "PARTNER"],
    queryFn: listPartnerRoles,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  });
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", fullNameAr: "", roleId: "" },
  });

  return (
    <FormDialog
      {...props}
      size="sm"
      title={`دعوة ممثل عن «${partner.displayNameAr}»`}
      description="يدخل الممثل بوابة الشريك بالدور المختار، ونطاقه جهته وحدها."
      form={form}
      values={{ email: email ?? "", fullNameAr: fullNameAr ?? "", roleId: roleId ?? "" }}
      submitLabel="إنشاء الدعوة"
      onSubmit={(values) =>
        createInvitation({
          email: values.email,
          roleId: values.roleId,
          partnerId: partner.id,
          ...(values.fullNameAr ? { fullNameAr: values.fullNameAr } : {}),
        })
      }
      successMessage="أُنشئت الدعوة."
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["invitations"] })}
      renderSuccess={(result) => (
        <OneTimeLink
          url={result.inviteUrl}
          note="انسخ الرابط وأرسله إلى الممثل — لن يظهر مرة أخرى."
        />
      )}
    >
      <TextField
        control={form.control}
        name="email"
        label="بريد الممثل"
        type="email"
        dir="ltr"
        className="text-start"
      />
      <TextField
        control={form.control}
        name="fullNameAr"
        label="الاسم الكامل (اختياري)"
        hint="يظهر للمدعوّ عند فتح الرابط."
      />
      <SelectField
        control={form.control}
        name="roleId"
        label="الدور"
        loading={roles.isPending}
        options={(roles.data ?? []).map((role) => ({ value: role.id, label: role.nameAr }))}
      />
    </FormDialog>
  );
}

// ── جهة اتصال ───────────────────────────────────────────────────────────

const contactSchema = z
  .object({
    fullNameAr: z
      .string()
      .trim()
      .min(3, "الاسم الكامل يجب ألا يقل عن 3 أحرف.")
      .max(160, "الاسم الكامل طويل جدًا."),
    jobTitleAr: z.string().trim().max(160, "المنصب طويل جدًا."),
    email: z.union([
      z.email("صيغة البريد الإلكتروني غير صحيحة.").max(254, "البريد طويل جدًا."),
      z.literal(""),
    ]),
    phone: z.union([phoneSchema, z.literal("")]),
    isPrimary: z.boolean(),
  })
  .refine((values) => values.email || values.phone, {
    path: ["email"],
    message: "أدخل بريدًا أو هاتفًا للتواصل.",
  });

type ContactValues = z.infer<typeof contactSchema>;

export function AddContactDialog({
  partner,
  ...props
}: DialogProps & { partner: PartnerDetail }) {
  const apply = usePartnerCache();
  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { fullNameAr: "", jobTitleAr: "", email: "", phone: "", isPrimary: false },
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title="إضافة جهة اتصال"
      description={`شخص يُتواصل معه في «${partner.displayNameAr}».`}
      form={form}
      values={{
        fullNameAr: "",
        jobTitleAr: "",
        email: "",
        phone: "",
        // أول جهة اتصال رئيسية تلقائيًا؛ التفعيل يشترط واحدة.
        isPrimary: !partner.contacts.some((contact) => contact.isPrimary),
      }}
      submitLabel="إضافة جهة الاتصال"
      onSubmit={(values) =>
        addContact(partner.id, {
          fullNameAr: values.fullNameAr,
          isPrimary: values.isPrimary,
          ...(values.jobTitleAr ? { jobTitleAr: values.jobTitleAr } : {}),
          ...(values.email ? { email: values.email } : {}),
          ...(values.phone ? { phone: values.phone } : {}),
        })
      }
      successMessage="أُضيفت جهة الاتصال."
      onSuccess={apply}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="fullNameAr" label="الاسم الكامل" />
        <TextField control={form.control} name="jobTitleAr" label="المنصب (اختياري)" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="email"
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          className="text-start"
        />
        <TextField
          control={form.control}
          name="phone"
          label="رقم الهاتف"
          type="tel"
          dir="ltr"
          className="text-start"
          placeholder="+963…"
        />
      </div>
      <CheckboxField
        control={form.control}
        name="isPrimary"
        label="جهة الاتصال الرئيسية"
        hint="تحلّ محل الرئيسية الحالية إن وُجدت. التفعيل يشترط جهة رئيسية."
      />
    </FormDialog>
  );
}

// ── نوع شراكة ───────────────────────────────────────────────────────────

const partnershipSchema = z.object({ type: z.string().min(1, "اختر نوع الشراكة.") });

type PartnershipValues = z.infer<typeof partnershipSchema>;

export function AddPartnershipDialog({
  partner,
  ...props
}: DialogProps & { partner: PartnerDetail }) {
  const apply = usePartnerCache();
  const form = useForm<PartnershipValues>({
    resolver: zodResolver(partnershipSchema),
    defaultValues: { type: "" },
  });

  const taken = new Set(
    partner.partnerships
      .filter((partnership) => partnership.status !== "ENDED")
      .map((partnership) => partnership.type),
  );

  const options = (Object.keys(PARTNERSHIP_TYPE_LABELS) as PartnershipType[]).map((type) => ({
    value: type,
    label: PARTNERSHIP_TYPE_LABELS[type],
    // شراكة الفعالية ترتبط بمبادرة محددة، والخادم يرفضها حتى يُبنى الربط.
    disabled: taken.has(type) || type === "EVENT",
    description: taken.has(type)
      ? "مسجّلة لهذه الجهة"
      : type === "EVENT"
        ? "ترتبط بمبادرة محددة — لم تُفعَّل بعد"
        : undefined,
  }));

  return (
    <FormDialog
      {...props}
      size="sm"
      title="إضافة نوع شراكة"
      description="يُسجَّل النوع «مقترحًا» حتى يعتمده صاحب الصلاحية."
      form={form}
      values={{ type: "" }}
      submitLabel="إضافة النوع"
      onSubmit={(values) => addPartnership(partner.id, values.type as PartnershipType)}
      successMessage="أُضيف نوع الشراكة."
      onSuccess={apply}
    >
      <SelectField control={form.control} name="type" label="نوع الشراكة" options={options} />
    </FormDialog>
  );
}

// ── إقرار بالميثاق ──────────────────────────────────────────────────────

const acknowledgementSchema = z.object({
  acknowledgedByNameAr: z
    .string()
    .trim()
    .min(3, "اسم المُقِرّ يجب ألا يقل عن 3 أحرف.")
    .max(160, "اسم المُقِرّ طويل جدًا."),
  acknowledgedByTitleAr: z.string().trim().max(160, "الصفة طويلة جدًا."),
  methodId: z.string().min(1, "اختر طريقة الإقرار."),
});

type AcknowledgementValues = z.infer<typeof acknowledgementSchema>;

const ACKNOWLEDGEMENT_DEFAULTS: AcknowledgementValues = {
  acknowledgedByNameAr: "",
  acknowledgedByTitleAr: "",
  methodId: "",
};

export function AcknowledgementDialog({
  partner,
  ...props
}: DialogProps & { partner: PartnerDetail }) {
  const apply = usePartnerCache();
  const form = useForm<AcknowledgementValues>({
    resolver: zodResolver(acknowledgementSchema),
    defaultValues: ACKNOWLEDGEMENT_DEFAULTS,
  });

  return (
    <FormDialog
      {...props}
      size="sm"
      title="تسجيل إقرار بالميثاق"
      description="يُسجَّل الإقرار على الإصدار الساري من الميثاق."
      form={form}
      values={ACKNOWLEDGEMENT_DEFAULTS}
      submitLabel="تسجيل الإقرار"
      onSubmit={(values) =>
        recordAcknowledgement(partner.id, {
          methodId: values.methodId,
          acknowledgedByNameAr: values.acknowledgedByNameAr,
          ...(values.acknowledgedByTitleAr
            ? { acknowledgedByTitleAr: values.acknowledgedByTitleAr }
            : {}),
        })
      }
      successMessage="سُجّل الإقرار."
      onSuccess={apply}
    >
      <TextField control={form.control} name="acknowledgedByNameAr" label="اسم المُقِرّ" />
      <TextField
        control={form.control}
        name="acknowledgedByTitleAr"
        label="صفته (اختيارية)"
        placeholder="المدير التنفيذي"
      />
      <LookupSelectField
        control={form.control}
        name="methodId"
        code="ACKNOWLEDGEMENT_METHOD"
        label="طريقة الإقرار"
      />
    </FormDialog>
  );
}
