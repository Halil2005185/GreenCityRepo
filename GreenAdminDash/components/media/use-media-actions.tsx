"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Eye, MessageSquarePlus, Pencil, Tags } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  LogInteractionDialog,
  MediaClassificationDialog,
  MediaContactEditDialog,
  MediaStageDialog,
} from "@/components/media/media-dialogs";
import type { ActionDef } from "@/components/ui/actions";
import { errorMessage } from "@/lib/api/errors";
import {
  getMediaContact,
  type MediaContactDetail,
  type MediaContactSummary,
} from "@/lib/api/media";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";

type Target =
  | { kind: "log" | "stage"; contact: MediaContactSummary }
  | { kind: "classification" | "edit"; contact: MediaContactDetail };

/**
 * أفعال الشخص بتعريف واحد لصف القائمة وترويسة صفحته: النوافذ نفسها
 * بالمنطق نفسه في الصفحتين.
 */
export function useMediaActions() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  function show(next: Target) {
    setTarget(next);
    setOpen(true);
  }

  /** التصنيف والبيانات يحتاجان الملف الكامل؛ من صفحة الشخص هو في الذاكرة. */
  async function withDetail(
    contact: MediaContactSummary | MediaContactDetail,
    kind: "classification" | "edit",
  ) {
    try {
      const detail =
        "interactions" in contact
          ? contact
          : await queryClient.ensureQueryData({
              queryKey: ["media", "contact", contact.id],
              queryFn: () => getMediaContact(contact.id),
            });

      show({ kind, contact: detail });
    } catch (error) {
      toast.error(errorMessage(error, "تعذّر تحميل الملف."));
    }
  }

  function actions(contact: MediaContactSummary | MediaContactDetail) {
    return {
      open: {
        key: "open",
        label: "فتح الملف",
        icon: Eye,
        href: `/dashboard/media/${contact.id}`,
      },
      log: {
        key: "log",
        label: "تسجيل تواصل",
        icon: MessageSquarePlus,
        requires: [CAPABILITIES.mediaManage],
        onSelect: () => show({ kind: "log", contact }),
      },
      edit: {
        key: "edit",
        label: "تعديل البيانات",
        icon: Pencil,
        requires: [CAPABILITIES.mediaManage],
        onSelect: () => void withDetail(contact, "edit"),
      },
      classification: {
        key: "classification",
        label: "تعديل التصنيف",
        icon: Tags,
        requires: [CAPABILITIES.mediaManage],
        onSelect: () => void withDetail(contact, "classification"),
      },
      stage: {
        key: "stage",
        label: "تغيير المرحلة",
        icon: ArrowLeftRight,
        requires: [CAPABILITIES.mediaManage],
        onSelect: () => show({ kind: "stage", contact }),
      },
    } satisfies Record<string, ActionDef>;
  }

  const dialogs =
    target?.kind === "log" ? (
      <LogInteractionDialog contact={target.contact} open={open} onOpenChange={setOpen} />
    ) : target?.kind === "stage" ? (
      <MediaStageDialog contact={target.contact} open={open} onOpenChange={setOpen} />
    ) : target?.kind === "classification" ? (
      <MediaClassificationDialog contact={target.contact} open={open} onOpenChange={setOpen} />
    ) : target?.kind === "edit" ? (
      <MediaContactEditDialog
        contact={target.contact}
        canEditNotes={can(CAPABILITIES.mediaNotesView)}
        open={open}
        onOpenChange={setOpen}
      />
    ) : null;

  return { actions, dialogs };
}
