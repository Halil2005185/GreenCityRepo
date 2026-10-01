"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { LookupBadge, LookupSelectField, lookupLabel } from "@/components/lookups/lookup-select";
import { Badge } from "@/components/ui/badge";
import type { DescriptionItem } from "@/components/ui/description-list";
import type { LookupRef } from "@/lib/api/lookups";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

/**
 * محاور تصنيف العلاقة، مكوّن واحد يخدم الشبكة الإعلامية وسجل الشركاء.
 *
 * تكرار الحقول في الشاشتين كان سيسمح لهما بالانحراف — قائمة أولويات هنا
 * وأخرى هناك — وهو ما طلب مكتب العلاقات عكسه حين طلب المحاور نفسها على
 * الجهات والأشخاص معًا. والمحاور الأربعة تعريفات في «الإعدادات ← تعريفات
 * النظام»، فقيمة يضيفها المكتب تظهر في الشاشتين معًا.
 */

/**
 * حقول التصنيف داخل نموذج react-hook-form. أسماء الحقول تختلف بين الجهة
 * (`contactPriorityId`، `engagementHorizonId`، `mediaChannelIds`) والشخص
 * (`priorityId`، `horizonId`، `channelIds`) لأنها أسماء جسم الطلب نفسه،
 * فتُمرَّر هنا ولا يُترجَم بينها — فتصل أخطاء الخادم إلى حقولها كما هي.
 *
 * `selected` قيم السجل كما هي: تسمية قيمة عُطّلت بعد أن صُنّف بها السجل
 * تأتي منه، فلا يظهر «…» مكانها.
 */
export function ClassificationFormFields<T extends FieldValues>({
  control,
  names,
  selected,
}: {
  control: Control<T>;
  names: {
    priority: FieldPath<T>;
    horizon: FieldPath<T>;
    relationshipTypeId: FieldPath<T>;
    channelIds: FieldPath<T>;
  };
  selected?: {
    priority?: LookupRef | null;
    horizon?: LookupRef | null;
    relationshipType?: LookupRef | null;
    channels?: readonly LookupRef[];
  };
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <LookupSelectField
          control={control}
          name={names.priority}
          code="CONTACT_PRIORITY"
          label="أولوية التواصل"
          hint="من نبدأ به حين يضيق الوقت."
          selected={selected?.priority ?? null}
        />
        <LookupSelectField
          control={control}
          name={names.horizon}
          code="ENGAGEMENT_HORIZON"
          label="أفق العلاقة"
          hint="محور مستقل عن الأولوية: عاجل لمرة، أو مهم على المدى الطويل."
          placeholder="غير محدد"
          clearable
          selected={selected?.horizon ?? null}
        />
      </div>

      <LookupSelectField
        control={control}
        name={names.relationshipTypeId}
        code="RELATIONSHIP_TYPE"
        label="نوع العلاقة"
        placeholder="غير محدد"
        clearable
        selected={selected?.relationshipType ?? null}
      />

      <LookupSelectField
        control={control}
        name={names.channelIds}
        code="MEDIA_CHANNEL"
        label="شكل العمل الإعلامي"
        hint="بأي شكل يعمل — سؤال شارع، ريبورتاج، تصوير. يمكن اختيار أكثر من شكل."
        placeholder="اختر شكلًا أو أكثر"
        multiple
        clearable
        selected={selected?.channels ?? []}
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
  relationshipType,
  channels,
  lastContactAt,
}: {
  priority: LookupRef;
  horizon: LookupRef | null;
  relationshipType: LookupRef | null;
  channels: readonly LookupRef[];
  lastContactAt: string | null;
}): DescriptionItem[] {
  return [
    {
      label: "أولوية التواصل",
      value: <LookupBadge code="CONTACT_PRIORITY" value={priority} />,
    },
    { label: "أفق العلاقة", value: horizon ? lookupLabel(horizon) : null },
    { label: "نوع العلاقة", value: relationshipType ? lookupLabel(relationshipType) : null },
    {
      label: "شكل العمل الإعلامي",
      value:
        channels.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {channels.map((channel) => (
              <Badge key={channel.id} tone="accent">
                {lookupLabel(channel)}
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
