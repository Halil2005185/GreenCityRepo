"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ImageOff, MapPin, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { fieldKey } from "@/components/field/group-dialog";
import { ActionMenu, type ActionDef, useVisibleActions } from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { TextField } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/states";
import { Toolbar } from "@/components/ui/toolbar";
import {
  deleteFieldPhoto,
  listFieldPhotos,
  updateFieldPhoto,
  type FieldGroup,
  type FieldManagedPhoto,
} from "@/lib/api/field";
import type { InitiativeDetail } from "@/lib/api/initiatives";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDateTime } from "@/lib/utils";

const MANAGE = [CAPABILITIES.fieldManage] as const;

export const photosKey = (initiativeId: string) => ["field-photos", initiativeId] as const;

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}

/**
 * صور الميدان: ما التقطه القادة في مواقعهم.
 *
 * الصورة داخلية حين تصل، ولا تخرج إلى الموقع العام ولا إلى تقرير إلا بإذن
 * المنسّق هنا. ومن فيها أشخاص بلا موافقتهم لا يُسمح بنشرها — يرفضه الخادم،
 * والزر معطّل بسببه.
 */
export function PhotosSection({
  initiative,
  groups,
}: {
  initiative: InitiativeDetail;
  groups: readonly FieldGroup[];
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ photo: FieldManagedPhoto | null; open: boolean }>({
    photo: null,
    open: false,
  });

  const photos = useQuery({
    queryKey: [...photosKey(initiative.id), { siteId, groupId }],
    queryFn: () =>
      listFieldPhotos(initiative.id, {
        ...(siteId ? { siteId } : {}),
        ...(groupId ? { groupId } : {}),
      }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: photosKey(initiative.id) });
    // عدّاد صور المجموعة في جدول المجموعات.
    void queryClient.invalidateQueries({ queryKey: fieldKey(initiative.id) });
  };

  const publish = useApiMutation({
    mutationFn: (photo: FieldManagedPhoto) =>
      updateFieldPhoto(initiative.id, photo.id, {
        publicUseAllowed: !photo.publicUseAllowed,
      }),
    successMessage: (updated) =>
      updated.publicUseAllowed ? "سُمح بنشر الصورة." : "عادت الصورة داخلية.",
    onSuccess: refresh,
  });

  const filtered = siteId !== null || groupId !== null;
  const shownGroups = groups.filter((group) => !siteId || group.siteId === siteId);

  const actionsFor = (photo: FieldManagedPhoto): ActionDef[] => {
    const blocked = photo.hasPeople && !photo.peopleConsent;

    return [
      {
        key: "publish",
        label: photo.publicUseAllowed ? "إلغاء السماح بالنشر" : "السماح بنشرها",
        icon: photo.publicUseAllowed ? EyeOff : Eye,
        requires: MANAGE,
        disabled: blocked && !photo.publicUseAllowed,
        disabledReason: "فيها أشخاص بلا موافقتهم، فلا تُنشر.",
        loading: publish.isPendingFor((pending) => pending.id === photo.id),
        onSelect: () => publish.mutate(photo),
      },
      {
        key: "caption",
        label: "تعديل الوصف",
        icon: Pencil,
        requires: MANAGE,
        onSelect: () => setEditing({ photo, open: true }),
      },
      {
        key: "delete",
        label: "حذف الصورة",
        icon: Trash2,
        destructive: true,
        requires: MANAGE,
        onSelect: () =>
          void confirm({
            title: "حذف هذه الصورة؟",
            description:
              "تُمحى من التخزين أيضًا، لا من المعرض وحده، ولا تُستعاد بعد الحذف.",
            confirmLabel: "حذف الصورة",
            destructive: true,
            successMessage: "حُذفت الصورة.",
            onConfirm: async () => {
              await deleteFieldPhoto(initiative.id, photo.id);
              refresh();
            },
          }),
      },
    ];
  };

  return (
    <Section
      title="صور الميدان"
      description="ما التقطه القادة في مواقعهم. الصورة داخلية حتى تسمح بنشرها."
    >
      <Toolbar
        hasActiveFilters={filtered}
        activeCount={(siteId ? 1 : 0) + (groupId ? 1 : 0)}
        onReset={() => {
          setSiteId(null);
          setGroupId(null);
        }}
      >
        <Select
          size="sm"
          label="الموقع"
          aria-label="رشّح بالموقع"
          placeholder="الكل"
          className="w-52"
          clearable
          value={siteId}
          onChange={(value) => {
            setSiteId(value);
            // مجموعة من موقع آخر لا تبقى مرشِّحًا مع الموقع الجديد.
            setGroupId(null);
          }}
          options={initiative.sites.map((site) => ({ value: site.id, label: site.nameAr }))}
        />
        <Select
          size="sm"
          label="المجموعة"
          aria-label="رشّح بالمجموعة"
          placeholder="الكل"
          className="w-52"
          clearable
          value={groupId}
          onChange={setGroupId}
          options={shownGroups.map((group) => ({
            value: group.id,
            label: group.nameAr,
            description: group.siteNameAr,
          }))}
        />
      </Toolbar>

      <div className="rounded-xl border border-border bg-card">
        {photos.isPending ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy aria-label="جارٍ التحميل">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="aspect-[4/3] w-full" />
            ))}
          </div>
        ) : photos.isError ? (
          <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />
        ) : photos.data.length === 0 ? (
          filtered ? (
            <NoResultsState
              onClear={() => {
                setSiteId(null);
                setGroupId(null);
              }}
            />
          ) : (
            <EmptyState
              icon={ImageOff}
              title="لا صور من الميدان بعد"
              description="حين يلتقط قائد صورة لموقعه من التطبيق الميداني تظهر هنا."
            />
          )
        ) : (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.data.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} actions={actionsFor(photo)} />
            ))}
          </ul>
        )}
      </div>

      <CaptionDialog
        initiativeId={initiative.id}
        photo={editing.photo}
        open={editing.open}
        onOpenChange={(open) => setEditing((current) => ({ ...current, open }))}
        onSaved={refresh}
      />
    </Section>
  );
}

function PhotoCard({
  photo,
  actions,
}: {
  photo: FieldManagedPhoto;
  actions: readonly ActionDef[];
}) {
  const visible = useVisibleActions();
  const [missing, setMissing] = useState(false);
  const title = photo.captionAr ?? "صورة بلا وصف";

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <a
        href={photo.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`فتح الصورة بحجمها: ${title}`}
        className="flex aspect-[4/3] items-center justify-center bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {missing ? (
          <ImageOff className="size-6" aria-hidden />
        ) : (
          <>
            {/* رابط تخزين خارجي، فلا `next/image` بلا نطاق مسموح. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={title}
              loading="lazy"
              decoding="async"
              onError={() => setMissing(true)}
              className="size-full object-cover"
            />
          </>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-medium leading-snug">{title}</p>
          <ActionMenu
            actions={visible(actions)}
            label={`إجراءات الصورة: ${title}`}
            variant="ghost"
            size="icon-sm"
            className="-me-1 -mt-1"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {[photo.siteNameAr, photo.groupNameAr, photo.workItemTitleAr]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <p className="text-xs text-muted-foreground">
          {[photo.uploadedByNameAr, formatDateTime(photo.takenAt ?? photo.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Badge tone={photo.publicUseAllowed ? "success" : "neutral"}>
            {photo.publicUseAllowed ? "مسموح بنشرها" : "داخلية"}
          </Badge>
          {photo.hasPeople ? (
            <Badge tone={photo.peopleConsent ? "outline" : "warning"}>
              {photo.peopleConsent ? "أشخاص بموافقتهم" : "أشخاص بلا موافقة"}
            </Badge>
          ) : null}
          {photo.lat !== null && photo.lng !== null ? (
            <a
              href={mapsUrl(photo.lat, photo.lng)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MapPin className="size-3.5" aria-hidden />
              موقع الالتقاط
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

const schema = z.object({
  captionAr: z.string().trim().max(300, "الوصف طويل جدًا."),
});

type Values = z.infer<typeof schema>;

function CaptionDialog({
  initiativeId,
  photo,
  open,
  onOpenChange,
  onSaved,
}: {
  initiativeId: string;
  photo: FieldManagedPhoto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { captionAr: "" },
  });

  return (
    <FormDialog<Values, FieldManagedPhoto>
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="تعديل وصف الصورة"
      form={form}
      values={{ captionAr: photo?.captionAr ?? "" }}
      submitLabel="حفظ الوصف"
      onSubmit={(values) =>
        updateFieldPhoto(initiativeId, photo!.id, { captionAr: values.captionAr || null })
      }
      successMessage="حُفظ الوصف."
      onSuccess={onSaved}
    >
      <TextField
        control={form.control}
        name="captionAr"
        label="الوصف"
        hint="ما في الصورة، كما يُكتب تحتها في تقرير: «الصف الأول بعد الغرس»."
        maxLength={300}
      />
    </FormDialog>
  );
}
