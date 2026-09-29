"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { CapabilityChecklistField } from "@/components/access/capability-checklist";
import { FormDialog } from "@/components/ui/form-dialog";
import { type TeamMembershipDetail, setMembershipCapabilities } from "@/lib/api/people";
import { useAccess } from "@/lib/auth/access";

type Values = { capabilities: string[] };

/**
 * تخصيص صلاحيات عضوية واحدة: ما يأتي مع الدور معلَّم، وما يُضاف فوقه أو
 * يُنزع منه يظهر بشارة. هكذا يُصنع «مساعد يرى أمورًا بعينها» من عضو عادي
 * دون دور جديد لكل حالة.
 *
 * يُحفظ الوضع كاملًا: الفرق عن حزمة الدور هو ما يُرسل، والخادم يستبدل به
 * ما كان.
 */
export function MembershipCapabilitiesSheet({
  personId,
  personName,
  membership,
  open,
  onOpenChange,
}: {
  personId: string;
  personName: string;
  membership: TeamMembershipDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const access = useAccess();
  const form = useForm<Values>({ defaultValues: { capabilities: [] } });

  if (!membership) return null;

  const baseline = membership.roleCapabilities;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      presentation="sheet"
      size="lg"
      title={`صلاحيات ${personName} في ${membership.officeNameAr}`}
      description={`حزمة دور «${membership.roleNameAr}» معلَّمة مسبقًا. ما تضيفه أو تنزعه هنا لهذا الشخص في هذا الفريق وحده، ويسقط إن تغيّر دوره أو فريقه.`}
      form={form}
      values={{ capabilities: membership.effective }}
      submitLabel="حفظ الصلاحيات"
      onSubmit={(values) =>
        setMembershipCapabilities(personId, membership.id, {
          grants: values.capabilities.filter((key) => !baseline.includes(key)),
          revokes: baseline.filter((key) => !values.capabilities.includes(key)),
        })
      }
      successMessage="حُفظت الصلاحيات."
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["people", personId] })}
    >
      <CapabilityChecklistField
        control={form.control}
        name="capabilities"
        catalog={access.catalog}
        baseline={baseline}
        canChange={(key) => access.canDelegate(key, membership.officeId)}
      />
    </FormDialog>
  );
}
