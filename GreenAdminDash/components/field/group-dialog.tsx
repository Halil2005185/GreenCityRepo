"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import { ApiError } from "@/lib/api/client";
import {
  createFieldGroup,
  listLeadCandidates,
  listPartnerOptions,
  updateFieldGroup,
  type FieldGroup,
  type InitiativeField,
} from "@/lib/api/field";
import type { InitiativeDetail } from "@/lib/api/initiatives";
import { ORGANIZATION_KIND_LABELS } from "@/lib/api/partners";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export const fieldKey = (initiativeId: string) => ["initiative-field", initiativeId] as const;

/** كل كتابة تعيد الميدان كاملًا، فيوضع في الذاكرة بلا طلب ثانٍ. */
export function useFieldCache() {
  const queryClient = useQueryClient();

  return (field: InitiativeField) =>
    queryClient.setQueryData(fieldKey(field.initiativeId), field);
}

/** حقل التاريخ والوقت المحلي يعطي «2026-10-09T08:00» بلا منطقة زمنية. */
function toLocalInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

const schema = z.object({
  siteId: z.string().min(1, "اختر الموقع."),
  nameAr: z.string().trim().min(2, "اسم المجموعة مطلوب.").max(160, "الاسم طويل جدًا."),
  leadUserId: z.string(),
  partnerId: z.string(),
  contactPhone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^[+]?[0-9\s()-]{6,32}$/.test(value),
      "اكتب الرقم بأرقامه، مثل 0944123456.",
    ),
  // نصٌّ لا رقم: الحقل الفارغ «لم تُحدَّد»، وليس صفرًا.
  hoursPerDay: z
    .string()
    .trim()
    .refine((value) => {
      if (value === "") return true;

      const hours = Number(value);

      return hours >= 0.5 && hours <= 24 && Number.isInteger(hours * 2);
    }, "اكتب الساعات بأنصافها، بين نصف ساعة و24: مثل 4 أو 5.5."),
  meetsAt: z.string(),
  meetingPointAr: z.string().trim().max(300, "وصف نقطة اللقاء طويل جدًا."),
  instructionsAr: z.string().trim().max(4000, "التعليمات طويلة جدًا."),
});

type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  siteId: "",
  nameAr: "",
  leadUserId: "",
  partnerId: "",
  contactPhone: "",
  hoursPerDay: "",
  meetsAt: "",
  meetingPointAr: "",
  instructionsAr: "",
};

/**
 * إضافة مجموعة ميدانية أو تعديلها. القائد اختياري عند الإنشاء: المنسّق يكوّن
 * المجموعات قبل أن يعرف قادتها كلهم، ويسمّيهم حين يتأكد حضورهم.
 */
export function GroupDialog({
  initiative,
  group,
  ...props
}: DialogProps & { initiative: InitiativeDetail; group: FieldGroup | null }) {
  const apply = useFieldCache();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const candidates = useQuery({
    queryKey: ["field-lead-candidates"],
    queryFn: () => listLeadCandidates(initiative.id),
    enabled: props.open,
    staleTime: 60_000,
  });

  const partners = useQuery({
    queryKey: ["field-partner-options"],
    queryFn: () => listPartnerOptions(initiative.id),
    enabled: props.open,
    staleTime: 60_000,
  });

  // الموقع الملغى لا تُكوَّن له مجموعة؛ وموقع المجموعة الحالي يبقى ولو أُلغي بعدها.
  const sites = initiative.sites
    .filter((site) => site.status !== "CANCELLED" || site.id === group?.siteId)
    .map((site) => ({
      value: site.id,
      label: site.nameAr,
      description: site.areaNameAr ?? undefined,
    }));

  const leads = (candidates.data ?? []).map((candidate) => ({
    value: candidate.id,
    label: candidate.fullNameAr,
    description: `${candidate.roleNameAr} — ${candidate.officeNameAr}`,
  }));

  return (
    <FormDialog<Values, InitiativeField>
      {...props}
      size="md"
      title={group ? `تعديل «${group.nameAr}»` : "إضافة مجموعة ميدانية"}
      description={
        group
          ? undefined
          : "فريق متطوعين يعمل في موقع واحد يوم الحملة، بقائد وموعد ونقطة لقاء."
      }
      form={form}
      values={
        group
          ? {
              siteId: group.siteId,
              nameAr: group.nameAr,
              leadUserId: group.leadUserId ?? "",
              partnerId: group.partnerId ?? "",
              contactPhone: group.contactPhone ?? "",
              hoursPerDay:
                group.hoursPerDay === null ? "" : String(group.hoursPerDay),
              meetsAt: toLocalInput(group.meetsAt),
              meetingPointAr: group.meetingPointAr ?? "",
              instructionsAr: group.instructionsAr ?? "",
            }
          : { ...EMPTY, siteId: sites.length === 1 ? sites[0]!.value : "" }
      }
      submitLabel={group ? "حفظ المجموعة" : "إضافة المجموعة"}
      onSubmit={(values) => {
        const body = {
          siteId: values.siteId,
          nameAr: values.nameAr,
          leadUserId: values.leadUserId || null,
          partnerId: values.partnerId || null,
          contactPhone: values.contactPhone || null,
          hoursPerDay: values.hoursPerDay ? Number(values.hoursPerDay) : null,
          meetsAt: fromLocalInput(values.meetsAt),
          meetingPointAr: values.meetingPointAr || null,
          instructionsAr: values.instructionsAr || null,
        };

        return group
          ? updateFieldGroup(initiative.id, group.id, body)
          : createFieldGroup(initiative.id, body);
      }}
      successMessage={group ? "حُفظت المجموعة." : "أُضيفت المجموعة."}
      onSuccess={apply}
      // 409 هنا تعارض اسم، و422 عن القائد أو الجهة تخصّ حقلها.
      fieldForError={(error: ApiError) =>
        error.status === 409
          ? "nameAr"
          : error.status !== 422
            ? null
            : error.message.includes("قيادة")
              ? "leadUserId"
              : error.message.includes("الجهة")
                ? "partnerId"
                : null
      }
    >
      <SelectField
        control={form.control}
        name="siteId"
        label="الموقع"
        options={sites}
        placeholder="اختر موقع التنفيذ"
      />
      <TextField
        control={form.control}
        name="nameAr"
        label="اسم المجموعة"
        hint="اسم يميّزها في موقعها: «مجموعة الصنوبر»، «الفريق الأول»."
        maxLength={160}
      />
      <SelectField
        control={form.control}
        name="leadUserId"
        label="القائد (اختياري)"
        hint={
          candidates.data && leads.length === 0
            ? "لا أحد في الفريق يحمل صلاحية القيادة الميدانية. أسند دور «قائد مجموعة ميداني» من صفحة الفريق أولًا."
            : "من يفتح ورقة يوم المجموعة في التطبيق ويسجّل منها."
        }
        clearable
        placeholder="بلا قائد الآن"
        options={leads}
        loading={candidates.isPending && props.open}
        selectedOption={
          group?.leadUserId
            ? { value: group.leadUserId, label: group.leadNameAr ?? "القائد الحالي" }
            : undefined
        }
      />
      <SelectField
        control={form.control}
        name="partnerId"
        label="الجهة الشريكة (اختيارية)"
        hint="لفريق تأتي به جهة شريكة: شركة بموظفيها، أو جمعية بمتطوعيها. يظهر في بوابة الجهة بأعداد حضوره، بلا أسماء."
        clearable
        placeholder="ليست فريق جهة"
        options={(partners.data ?? []).map((partner) => ({
          value: partner.id,
          label: partner.displayNameAr,
          description:
            ORGANIZATION_KIND_LABELS[
              partner.organizationKind as keyof typeof ORGANIZATION_KIND_LABELS
            ] ?? undefined,
        }))}
        loading={partners.isPending && props.open}
        selectedOption={
          group?.partnerId
            ? { value: group.partnerId, label: group.partnerNameAr ?? "الجهة الحالية" }
            : undefined
        }
      />
      <TextField
        control={form.control}
        name="contactPhone"
        label="رقم للتواصل (اختياري)"
        hint="يظهر للمتطوعين في بطاقاتهم ليتصلوا إن تأخروا أو ضلّوا الطريق: هاتف القائد إن رضي، أو رقم المنسّق."
        type="tel"
        inputMode="tel"
        dir="ltr"
        className="text-end"
        maxLength={32}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="meetsAt"
          label="موعد اللقاء (اختياري)"
          type="datetime-local"
          dir="ltr"
          className="text-start"
        />
        <TextField
          control={form.control}
          name="meetingPointAr"
          label="نقطة اللقاء (اختيارية)"
          maxLength={300}
        />
      </div>
      <TextField
        control={form.control}
        name="hoursPerDay"
        label="ساعات العمل في اليوم (اختيارية)"
        hint="منها تُحسب ساعات التطوع في سجل المتطوع وشهادته: يوم حضور بساعاته. بلا ساعات تذكر الشهادة الأيام وحدها."
        type="number"
        inputMode="decimal"
        min={0.5}
        max={24}
        step={0.5}
        dir="ltr"
        className="text-end"
      />
      <TextareaField
        control={form.control}
        name="instructionsAr"
        label="تعليمات للمجموعة (اختيارية)"
        hint="ما يحضره المتطوع وما ينتبه له. تظهر للقائد في ورقة اليوم."
        rows={3}
      />
    </FormDialog>
  );
}
