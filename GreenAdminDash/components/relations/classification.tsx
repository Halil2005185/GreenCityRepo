"use client";

import { useQuery } from "@tanstack/react-query";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import type { DescriptionItem } from "@/components/ui/description-list";
import { Label } from "@/components/ui/field";
import { SelectField } from "@/components/ui/form-fields";
import type { SelectOption } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  HORIZON_LABELS,
  PRIORITY_LABELS,
  type ContactPriority,
  type EngagementHorizon,
} from "@/lib/api/media";
import { listMediaChannels, listRelationshipTypes } from "@/lib/api/relations";
import { statusOptions } from "@/lib/status";
import { cn, formatDate } from "@/lib/utils";

/**
 * محاور تصنيف العلاقة، مكوّن واحد يخدم الشبكة الإعلامية وسجل الشركاء.
 *
 * تكرار الحقول في الشاشتين كان سيسمح لهما بالانحراف — قائمة أولويات هنا
 * وأخرى هناك — وهو ما طلب مكتب العلاقات عكسه حين طلب المحاور نفسها على
 * الجهات والأشخاص معًا.
 */

export const PRIORITY_STYLES: Record<ContactPriority, string> = {
  HIGH: "bg-destructive/10 text-destructive",
  MEDIUM: "bg-warning/15 text-warning",
  LOW: "bg-muted text-muted-foreground",
};

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

// ── الشكل القديم: يبقى حتى تُرحَّل صفحات الشبكة الإعلامية ────────────────

export type ClassificationValue = {
  priority: ContactPriority;
  horizon: EngagementHorizon | "";
  relationshipTypeId: string;
  channelIds: string[];
};

function selectClass(invalid = false) {
  return cn(
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    invalid && "border-destructive",
  );
}

export function ClassificationFields({
  value,
  onChange,
  idPrefix = "classification",
}: {
  value: ClassificationValue;
  onChange: (next: ClassificationValue) => void;
  idPrefix?: string;
}) {
  const channels = useMediaChannels();
  const relationshipTypes = useRelationshipTypes();

  const set = <K extends keyof ClassificationValue>(
    key: K,
    next: ClassificationValue[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-priority`}>أولوية التواصل</Label>
          <select
            id={`${idPrefix}-priority`}
            value={value.priority}
            onChange={(event) =>
              set("priority", event.target.value as ContactPriority)
            }
            className={selectClass()}
          >
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            من نبدأ به حين يضيق الوقت.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-horizon`}>أفق العلاقة</Label>
          <select
            id={`${idPrefix}-horizon`}
            value={value.horizon}
            onChange={(event) =>
              set("horizon", event.target.value as EngagementHorizon | "")
            }
            className={selectClass()}
          >
            <option value="">غير محدد</option>
            {Object.entries(HORIZON_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            محور مستقل عن الأولوية: عاجل لمرة، أو مهم على المدى الطويل.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-relationship`}>نوع العلاقة</Label>
        <select
          id={`${idPrefix}-relationship`}
          value={value.relationshipTypeId}
          onChange={(event) => set("relationshipTypeId", event.target.value)}
          className={selectClass()}
        >
          <option value="">غير محدد</option>
          {(relationshipTypes.data ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {type.nameAr}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">شكل العمل الإعلامي</legend>
        <p className="text-xs text-muted-foreground">
          بأي شكل يعمل — سؤال شارع، ريبورتاج، تصوير. يمكن اختيار أكثر من شكل.
        </p>

        {channels.isPending ? (
          <p className="text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : (channels.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا توجد أشكال بعد. تُضاف من شاشة مرجعيات العلاقات.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(channels.data ?? []).map((channel) => (
              <label
                key={channel.id}
                className="flex items-start gap-2 rounded-md border border-border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value.channelIds.includes(channel.id)}
                  onChange={(event) =>
                    set(
                      "channelIds",
                      event.target.checked
                        ? [...value.channelIds, channel.id]
                        : value.channelIds.filter((id) => id !== channel.id),
                    )
                  }
                />
                <span>{channel.nameAr}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** عرض للقراءة فقط — يستعمله ملف الشخص وملف الجهة معًا. */
export function ClassificationSummary({
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
}) {
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">أولوية التواصل</dt>
        <dd>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              PRIORITY_STYLES[priority],
            )}
          >
            {PRIORITY_LABELS[priority]}
          </span>
        </dd>
      </div>

      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">أفق العلاقة</dt>
        <dd>{horizon ? HORIZON_LABELS[horizon] : "—"}</dd>
      </div>

      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">نوع العلاقة</dt>
        <dd>{relationshipTypeNameAr ?? "—"}</dd>
      </div>

      <div className="flex items-start justify-between gap-3">
        <dt className="shrink-0 text-muted-foreground">شكل العمل</dt>
        <dd className="flex flex-wrap justify-end gap-1">
          {channels.length === 0
            ? "—"
            : channels.map((channel) => (
                <span
                  key={channel.id}
                  className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                >
                  {channel.nameAr}
                </span>
              ))}
        </dd>
      </div>

      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">آخر تواصل</dt>
        <dd>
          <LastContact value={lastContactAt} />
        </dd>
      </div>
    </dl>
  );
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
  if (days < 30) return `منذ ${days} يومًا`;

  const months = Math.floor(days / 30);

  if (months < 12) return `منذ ${months} شهرًا`;

  return `منذ ${Math.floor(months / 12)} سنة`;
}
