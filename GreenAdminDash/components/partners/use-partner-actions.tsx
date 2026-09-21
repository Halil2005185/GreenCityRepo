"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Ban,
  BadgeCheck,
  Eye,
  RotateCcw,
  Tags,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  PartnerClassificationDialog,
  PartnerInviteDialog,
  PartnerStageDialog,
  usePartnerCache,
} from "@/components/partners/partner-dialogs";
import type { ActionDef } from "@/components/ui/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import {
  PIPELINE_STAGES,
  activatePartner,
  getPartner,
  restorePartner,
  suspendPartner,
  type PartnerDetail,
  type PartnerSummary,
} from "@/lib/api/partners";
import { CAPABILITIES } from "@/lib/auth/capabilities";

type Target =
  | { kind: "stage"; partner: PartnerSummary }
  | { kind: "classification"; partner: PartnerDetail }
  | { kind: "invite"; partner: PartnerSummary; email?: string; fullNameAr?: string };

/**
 * أفعال الجهة بتعريف واحد: صف القائمة وترويسة صفحة الجهة يأخذان منه،
 * فيفتحان النوافذ نفسها بالمنطق نفسه ولا يتكرر شيء بين الصفحتين.
 *
 * يعيد الأفعال بأسمائها لا بترتيب ثابت: القائمة تضعها كلها في «⋯»،
 * والترويسة تختار منها الأساسي والثانوي حسب حالة الجهة.
 */
export function usePartnerActions() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const apply = usePartnerCache();
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  function show(next: Target) {
    setTarget(next);
    setOpen(true);
  }

  /** تعديل التصنيف يحتاج الملف الكامل؛ من صفحة الجهة هو في الذاكرة أصلًا. */
  async function openClassification(partner: PartnerSummary | PartnerDetail) {
    try {
      const detail =
        "contacts" in partner
          ? partner
          : await queryClient.ensureQueryData({
              queryKey: ["partner", partner.id],
              queryFn: () => getPartner(partner.id),
            });

      show({ kind: "classification", partner: detail });
    } catch (error) {
      toast.error(errorMessage(error, "تعذّر تحميل ملف الجهة."));
    }
  }

  function actions(partner: PartnerSummary | PartnerDetail) {
    const name = partner.displayNameAr;
    const isActive = partner.stage === "ACTIVE";
    const isPipeline = (PIPELINE_STAGES as readonly string[]).includes(partner.stage);

    return {
      open: {
        key: "open",
        label: "فتح الملف",
        icon: Eye,
        href: `/dashboard/partners/${partner.id}`,
      },
      classification: {
        key: "classification",
        label: "تعديل التصنيف",
        icon: Tags,
        requires: [CAPABILITIES.partnersManage],
        onSelect: () => void openClassification(partner),
      },
      stage: {
        key: "stage",
        label: "تغيير المرحلة",
        icon: ArrowLeftRight,
        requires: [CAPABILITIES.partnersManage],
        hidden: !isPipeline,
        onSelect: () => show({ kind: "stage", partner }),
      },
      invite: {
        key: "invite",
        label: "دعوة ممثل",
        icon: UserPlus,
        requires: [CAPABILITIES.invitationsManage],
        hidden: !isActive || partner.isSuspended,
        onSelect: () => show({ kind: "invite", partner }),
      },
      restore: {
        key: "restore",
        label: "رفع التعليق",
        icon: RotateCcw,
        requires: [CAPABILITIES.partnersApprove],
        hidden: !partner.isSuspended,
        onSelect: () =>
          void confirm({
            title: `رفع التعليق عن «${name}»؟`,
            description: "تعود الجهة نشطة، ويستعيد ممثلوها صلاحياتهم في البوابة.",
            confirmLabel: "رفع التعليق",
            successMessage: `رُفع التعليق عن «${name}».`,
            onConfirm: async () => apply(await restorePartner(partner.id)),
          }),
      },
      suspend: {
        key: "suspend",
        label: "تعليق مؤقت",
        icon: Ban,
        destructive: true,
        requires: [CAPABILITIES.partnersApprove],
        hidden: !isActive || partner.isSuspended,
        onSelect: () =>
          void confirm({
            title: `تعليق «${name}» مؤقتًا؟`,
            description:
              "تبقى الجهة في السجل ويظهر لممثليها في البوابة أنها معلّقة حتى يُرفع التعليق.",
            confirmLabel: "تعليق الجهة",
            destructive: true,
            reason: { label: "سبب التعليق", placeholder: "يظهر للجهة في بوابتها" },
            successMessage: `عُلّقت «${name}».`,
            onConfirm: async ({ reason }) => apply(await suspendPartner(partner.id, reason)),
          }),
      },
    } satisfies Record<string, ActionDef>;
  }

  /** اعتماد الجهة وتفعيلها — في صفحتها وحدها، حيث تظهر شروطه. */
  function activate(partner: PartnerDetail): ActionDef {
    const name = partner.displayNameAr;
    const closed = ["ACTIVE", "REJECTED", "ENDED"].includes(partner.stage);

    return {
      key: "activate",
      label: "اعتماد وتفعيل",
      icon: BadgeCheck,
      requires: [CAPABILITIES.partnersApprove],
      hidden: closed,
      disabled: !partner.activation.satisfied,
      disabledReason: "استوفِ شروط الاعتماد أولًا — القائمة أسفل الملخص.",
      onSelect: () =>
        void confirm({
          title: `اعتماد «${name}» وتفعيلها؟`,
          description: "تصير الجهة نشطة، ويمكن بعدها دعوة ممثليها إلى البوابة.",
          confirmLabel: "اعتماد وتفعيل",
          successMessage: `اعتُمدت «${name}» وفُعّلت.`,
          onConfirm: async () => {
            try {
              apply(await activatePartner(partner.id));
            } catch (error) {
              // الخادم يعيد الشروط الناقصة بتسمياتها؛ تُذكر داخل النافذة.
              if (error instanceof ApiError) {
                const details: unknown[] = Array.isArray(error.problem?.details)
                  ? error.problem.details
                  : [];
                const missing = details
                  .map((detail) =>
                    detail && typeof detail === "object" && "labelAr" in detail
                      ? String(detail.labelAr)
                      : null,
                  )
                  .filter(Boolean);

                if (missing.length > 0) {
                  throw new ApiError(
                    `${error.message} الناقص: ${missing.join("، ")}.`,
                    error.status,
                    error.code,
                    error.problem,
                  );
                }
              }

              throw error;
            }
          },
        }),
    };
  }

  function inviteContact(partner: PartnerSummary, email: string, fullNameAr: string) {
    show({ kind: "invite", partner, email, fullNameAr });
  }

  const dialogs =
    target?.kind === "stage" ? (
      <PartnerStageDialog partner={target.partner} open={open} onOpenChange={setOpen} />
    ) : target?.kind === "classification" ? (
      <PartnerClassificationDialog partner={target.partner} open={open} onOpenChange={setOpen} />
    ) : target?.kind === "invite" ? (
      <PartnerInviteDialog
        partner={target.partner}
        email={target.email}
        fullNameAr={target.fullNameAr}
        open={open}
        onOpenChange={setOpen}
      />
    ) : null;

  return { actions, activate, inviteContact, dialogs };
}
