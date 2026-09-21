"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, Rocket, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { useInitiativeCache } from "@/components/initiatives/initiative-dialogs";
import type { ActionDef } from "@/components/ui/actions";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  cancelInitiative,
  completeInitiative,
  deleteInitiative,
  launchInitiative,
  type InitiativeDetail,
} from "@/lib/api/initiatives";
import { CAPABILITIES } from "@/lib/auth/capabilities";

/** «هدف المبادرة 100 · مجموع المواقع 80 شجرة» — سطر واحد لكل مؤشر. */
export function rollupLine(metric: InitiativeDetail["rollup"]["metrics"][number]) {
  return `هدف المبادرة ${metric.initiativeTarget ?? "غير محدد"} · مجموع المواقع ${metric.siteTargetSum} ${metric.unitAr}`;
}

/**
 * أفعال دورة حياة المبادرة، كلها بصلاحية الإطلاق وبتأكيد يسمّيها ويشرح
 * أثرها. كانت «إلغاء» و«حذف» تمرّان عبر `window.confirm`، و«بدء التنفيذ»
 * بلا تأكيد أصلًا، و«الإكمال» قائمًا في الـAPI بلا زر.
 *
 * شروط البدء من الخادم نفسه (`rollup` يُحسب مع كل قراءة): ما يمنع الزر
 * هنا هو ما ستفحصه البوابة فعلًا، لا نسخة ثانية من المنطق تنحرف عنه.
 */
export function useInitiativeLifecycle(initiative: InitiativeDetail) {
  const confirm = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();
  const apply = useInitiativeCache();

  const { status, nameAr, rollup } = initiative;
  const liveSites = initiative.sites.filter((site) => site.status !== "CANCELLED");
  const mismatches = rollup.metrics.filter((metric) => !metric.matches);
  const strictBlock = rollup.policy === "STRICT" && mismatches.length > 0;
  const requires = [CAPABILITIES.initiativesLaunch];

  const launch: ActionDef = {
    key: "launch",
    label: "بدء التنفيذ",
    icon: Rocket,
    requires,
    hidden: status !== "DRAFT" && status !== "PLANNING",
    disabled: liveSites.length === 0 || strictBlock,
    disabledReason:
      liveSites.length === 0
        ? "أضف موقعًا واحدًا على الأقل قبل بدء التنفيذ."
        : "مجموع أهداف المواقع لا يطابق أهداف المبادرة، والمطابقة صارمة.",
    onSelect: () =>
      void confirm({
        title: `بدء تنفيذ «${nameAr}»؟`,
        description: "تنتقل المبادرة إلى «قيد التنفيذ» ولا تعود إلى التخطيط بعدها.",
        // تحت المطابقة الإرشادية يمرّ الاختلاف، لكنه يُعرض قبل الضغط لا بعده.
        details:
          mismatches.length > 0 ? (
            <Alert variant="warning" className="space-y-1">
              <p className="font-medium">أهداف غير مطابقة — المطابقة إرشادية فلا تمنع البدء:</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {mismatches.map((metric) => (
                  <li key={metric.metricId}>
                    {metric.metricNameAr}: {rollupLine(metric)}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : undefined,
        confirmLabel: "بدء التنفيذ",
        successMessage: `بدأ تنفيذ «${nameAr}».`,
        onConfirm: async () => apply(await launchInitiative(initiative.id)),
      }),
  };

  const complete: ActionDef = {
    key: "complete",
    label: "إكمال المبادرة",
    icon: CircleCheck,
    requires,
    hidden: status !== "ACTIVE",
    onSelect: () =>
      void confirm({
        title: `إكمال «${nameAr}»؟`,
        description: "تنتقل المبادرة إلى «مكتملة» وتُغلق، ولا تعود إلى التنفيذ.",
        confirmLabel: "إكمال المبادرة",
        successMessage: `اكتملت «${nameAr}».`,
        onConfirm: async () => apply(await completeInitiative(initiative.id)),
      }),
  };

  /**
   * الإلغاء يُبقي السجل ويُخرج المبادرة من الخريطة والمجاميع، والحذف يمحوها
   * بمواقعها ومهامها. الأول لما جرى عليه عمل، والثاني لمسودة أُدخلت خطأً —
   * والخادم هو من يفصل بينهما، فالزر يُخفى ولا يَحرس.
   */
  const cancel: ActionDef = {
    key: "cancel",
    label: "إلغاء المبادرة",
    icon: Ban,
    destructive: true,
    requires,
    hidden: status === "COMPLETED" || status === "CANCELLED",
    onSelect: () =>
      void confirm({
        title: `إلغاء «${nameAr}»؟`,
        description: "تخرج من الخريطة والمجاميع ويبقى سجلها. لا تُستأنف بعد الإلغاء.",
        confirmLabel: "إلغاء المبادرة",
        destructive: true,
        successMessage: `أُلغيت «${nameAr}».`,
        onConfirm: async () => apply(await cancelInitiative(initiative.id)),
      }),
  };

  const remove: ActionDef = {
    key: "delete",
    label: "حذف المسودة",
    icon: Trash2,
    destructive: true,
    requires,
    hidden: status !== "DRAFT",
    onSelect: () =>
      void confirm({
        title: `حذف مسودة «${nameAr}» نهائيًا؟`,
        description: "تُمحى بمواقعها ومهامها ولا رجعة. ما عليه أثر أو عمل يُلغى ولا يُحذف.",
        confirmLabel: "حذف المسودة",
        destructive: true,
        successMessage: `حُذفت مسودة «${nameAr}».`,
        onConfirm: async () => {
          await deleteInitiative(initiative.id);
          // الصفحة تخصّ ما حُذف، فالبقاء عليها يعرض خطأ تحميل لا نتيجة. ولا
          // يُمسح ملفها من الذاكرة هنا: الصفحة ما زالت تراقبه حتى يتم الانتقال،
          // ومسحه يعيد جلبه فيومض خطأ «غير موجودة» قبل المغادرة.
          router.replace("/dashboard/initiatives");
          for (const queryKey of [["initiatives"], ["map-points"], ["map-areas"], ["dashboard"]]) {
            void queryClient.invalidateQueries({ queryKey });
          }
        },
      }),
  };

  return { launch, complete, cancel, remove, liveSites, mismatches };
}
