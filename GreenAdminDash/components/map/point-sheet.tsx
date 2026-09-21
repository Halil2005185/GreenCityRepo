"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Settings2, Trash2 } from "lucide-react";

import {
  ActionButton,
  ActionMenu,
  type ActionDef,
  useVisibleActions,
} from "@/components/ui/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DescriptionList } from "@/components/ui/description-list";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InitiativeStatus, SiteStatus } from "@/lib/api/initiatives";
import { POINT_KIND_LABELS, type MapPoint, deleteGreenPoint } from "@/lib/api/map";
import { CAPABILITIES } from "@/lib/auth/capabilities";

import { KIND_COLORS } from "./map-config";

/**
 * تفاصيل نقطة على الخريطة في لوحة من جهة النهاية، مكان النافذة المنبثقة
 * الصغيرة. تُفتح من `?point=` فتُنسخ وتُشارك، ويصلها جدول مواقع المبادرة.
 */
export function PointSheet({
  point,
  onClose,
}: {
  point: MapPoint | null;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const visible = useVisibleActions();

  function actionsFor(target: MapPoint): ActionDef[] {
    return [
      {
        key: "open",
        label: "عرض المبادرة",
        icon: ExternalLink,
        href: `/dashboard/initiatives/${target.initiativeId}`,
      },
      {
        key: "manage",
        label: "إدارة المبادرة",
        icon: Settings2,
        requires: [CAPABILITIES.initiativesManage],
        href: `/dashboard/initiatives/${target.initiativeId}/manage`,
      },
      /**
       * الحذف من اللوحة نفسها: النقطة الخاطئة تُكتشف وهي منظورة على
       * الخريطة، فيكون تصحيحها حيث رُئيت. والحملات لا تُحذف — لها
       * الإلغاء من صفحتها.
       */
      {
        key: "delete",
        label: "حذف النقطة",
        icon: Trash2,
        destructive: true,
        requires: [CAPABILITIES.initiativesManage],
        hidden: target.kind !== "GREEN_POINT",
        onSelect: async () => {
          const deleted = await confirm({
            title: `حذف «${target.initiativeNameAr}» نهائيًا؟`,
            description: "تُمحى النقطة وموقعها وما وُثّق من أثرها، ولا يمكن التراجع عن ذلك.",
            confirmLabel: "حذف النقطة",
            destructive: true,
            onConfirm: () => deleteGreenPoint(target.siteId),
            successMessage: `حُذفت «${target.initiativeNameAr}» من الخريطة.`,
          });

          if (!deleted) return;

          for (const queryKey of [["map-points"], ["map-areas"], ["initiatives"], ["dashboard"]]) {
            void queryClient.invalidateQueries({ queryKey });
          }
          onClose();
        },
      },
    ];
  }

  const actions = point ? visible(actionsFor(point)) : [];
  const [primary, ...rest] = actions;

  return (
    <Sheet open={Boolean(point)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="end" width="sm">
        <SheetHeader>
          <SheetTitle>{point?.initiativeNameAr ?? "النقطة"}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            {point ? (
              <>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: KIND_COLORS[point.kind] }}
                />
                {POINT_KIND_LABELS[point.kind]}
                {point.areaNameAr ? ` · ${point.areaNameAr}` : ""}
              </>
            ) : (
              " "
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {point ? (
            <DescriptionList
              items={[
                { label: "الموقع", value: point.siteNameAr },
                { label: "المنطقة", value: point.areaNameAr },
                {
                  label: "المنفّذ",
                  value: point.contributorNameAr,
                  hidden: point.kind !== "GREEN_POINT",
                },
                {
                  label: "حالة المبادرة",
                  value: (
                    <StatusBadge
                      kind="initiativeStatus"
                      value={point.initiativeStatus as InitiativeStatus}
                    />
                  ),
                },
                {
                  label: "حالة الموقع",
                  value: <StatusBadge kind="siteStatus" value={point.status as SiteStatus} />,
                },
                {
                  label: "الإحداثيات",
                  value: (
                    <span dir="ltr" className="numeric">
                      {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                    </span>
                  ),
                },
              ]}
            />
          ) : null}
        </SheetBody>

        {primary ? (
          <SheetFooter>
            <ActionMenu actions={rest} />
            <ActionButton action={primary} variant="default" />
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
