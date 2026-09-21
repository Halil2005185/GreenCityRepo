"use client";

import { useQuery } from "@tanstack/react-query";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import type { DescriptionItem } from "@/components/ui/description-list";
import { SelectField } from "@/components/ui/form-fields";
import type { SelectOption } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  HORIZON_LABELS,
  type ContactPriority,
  type EngagementHorizon,
} from "@/lib/api/media";
import { listMediaChannels, listRelationshipTypes } from "@/lib/api/relations";
import { statusOptions } from "@/lib/status";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

/**
 * محاور تصنيف العلاقة، مكوّن واحد يخدم الشبكة الإعلامية وسجل الشركاء.
 *
 * تكرار الحقول في الشاشتين كان سيسمح لهما بالانحراف — قائمة أولويات هنا
 * وأخرى هناك — وهو ما طلب مكتب العلاقات عكسه حين طلب المحاور نفسها على
 * الجهات والأشخاص معًا.
 */

/** المرجعيات تُطلب مرة وتُشارَك بين الشاشات عبر مخزن الاستعلامات. */
export function useMediaChannels() {
  return useQuery({
    queryKey: ["relations", "media-channels"],
    queryFn: () => listMediaChannels(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRelationshipTypes() {
  return useQuery({
    queryKey: ["relations", "relationship-types"],
    queryFn: () => listRelationshipTypes(),
    staleTime: 5 * 60 * 1000,
  });
}

const HORIZON_OPTIONS: SelectOption[] = Object.entries(HORIZON_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * حقول التصنيف داخل نموذج react-hook-form. أسماء الحقول تختلف بين الجهة
 * (`contactPriority`، `engagementHorizon`، `mediaChannelIds`) والشخص
 * (`priority`، `horizon`، `channelIds`) لأنها أسماء جسم الطلب نفسه، فتُمرَّر
 * هنا ولا يُترجَم بينها — فتصل أخطاء الخادم إلى حقولها كما هي.
 *
 * الخيارات من المرجعيات النشطة وحدها؛ تسمية مرجع عُطّل بعد أن صُنّف به
 * السجل تأتي من السجل نفسه (`selected*`) كي لا يظهر «…» مكانها.
 */
export function ClassificationFormFields<T extends FieldValues>({
  control,
  names,
  selectedRelationshipType,
  selectedChannels,
}: {
  control: Control<T>;
  names: {
    priority: FieldPath<T>;
    horizon: FieldPath<T>;
    relationshipTypeId: FieldPath<T>;
    channelIds: FieldPath<T>;
  };
  selectedRelationshipType?: SelectOption | null;
  selectedChannels?: readonly SelectOption[];
}) {
  const channels = useMediaChannels();
  const relationshipTypes = useRelationshipTypes();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name={names.priority}
          label="أولوية التواصل"
          hint="من نبدأ به حين يضيق الوقت."
          options={statusOptions("contactPriority")}
        />
        <SelectField
          control={control}
          name={names.horizon}
          label="أفق العلاقة"
          hint="محور مستقل عن الأولوية: عاجل لمرة، أو مهم على المدى الطويل."
          placeholder="غير محدد"
          clearable
          options={HORIZON_OPTIONS}
        />
      </div>

      <SelectField
        control={control}
        name={names.relationshipTypeId}
        label="نوع العلاقة"
        placeholder="غير محدد"
        clearable
        loading={relationshipTypes.isPending}
        selectedOption={selectedRelationshipType}
        options={(relationshipTypes.data ?? []).map((type) => ({
          value: type.id,
          label: type.nameAr,
        }))}
      />

      <SelectField
        control={control}
        name={names.channelIds}
        label="شكل العمل الإعلامي"
        hint="بأي شكل يعمل — سؤال شارع، ريبورتاج، تصوير. يمكن اختيار أكثر من شكل."
        placeholder="اختر شكلًا أو أكثر"
        emptyText="لا توجد أشكال بعد. تُضاف من شاشة مرجعيات العلاقات."
        multiple
        clearable
        loading={channels.isPending}
        selectedOptions={selectedChannels}
        options={(channels.data ?? []).map((channel) => ({
          value: channel.id,
          label: channel.nameAr,
        }))}
      />
    </div>
  );
}

/** آخر تواصل كما يُقرأ في الملخص: التاريخ و«منذ كم». */
export function LastContact({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">لم يُسجَّل بعد</span>;

  return (
    <span>
      {formatDate(value)}
      <span className="ms-1 text-xs font-normal text-muted-foreground">
        ({sinceLabel(value)})
      </span>
    </span>
  );
}

/** بنود التصنيف في ملخص «مفتاح: قيمة» — للجهة والشخص معًا. */
export function classificationItems({
  priority,
  horizon,
  relationshipTypeNameAr,
  channels,
  lastContactAt,
}: {
  priority: ContactPriority;
  horizon: EngagementHorizon | null;
  relationshipTypeNameAr: string | null;
  channels: readonly { id: string; nameAr: string }[];
  lastContactAt: string | null;
}): DescriptionItem[] {
  return [
    {
      label: "أولوية التواصل",
      value: <StatusBadge kind="contactPriority" value={priority} />,
    },
    { label: "أفق العلاقة", value: horizon ? HORIZON_LABELS[horizon] : null },
    { label: "نوع العلاقة", value: relationshipTypeNameAr },
    {
      label: "شكل العمل الإعلامي",
      value:
        channels.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {channels.map((channel) => (
              <Badge key={channel.id} tone="accent">
                {channel.nameAr}
              </Badge>
            ))}
          </span>
        ) : null,
    },
    { label: "آخر تواصل", value: <LastContact value={lastContactAt} /> },
  ];
}

/**
 * «منذ ١٢ يومًا» لا التاريخ وحده.
 *
 * السؤال الذي يطرحه مكتب العلاقات على هذا العمود ليس «متى؟» بل «كم مضى؟»،
 * وحساب الفرق ذهنيًا في كل صف هو ما يجعل العمود يُتجاهل.
 */
export function sinceLabel(value: string) {
  const days = Math.floor(
    (Date.now() - new Date(value).getTime()) / 86_400_000,
  );

  if (days <= 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days < 30) return `منذ ${countAr(days, DAYS)}`;

  const months = Math.floor(days / 30);

  if (months < 12) return `منذ ${countAr(months, MONTHS)}`;

  return `منذ ${countAr(Math.floor(months / 12), YEARS)}`;
}

// بعد «منذ» المثنى مجرور: «منذ يومين» لا «منذ يومان».
const DAYS = { one: "يوم", two: "يومين", few: "أيام", many: "يومًا", other: "يوم" };
const MONTHS = { one: "شهر", two: "شهرين", few: "أشهر", many: "شهرًا", other: "شهر" };
const YEARS = { one: "سنة", two: "سنتين", few: "سنوات", many: "سنة", other: "سنة" };
