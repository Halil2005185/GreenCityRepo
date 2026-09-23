"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { officeOptions, useOffices } from "@/components/offices/office-options";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/form-fields";
import { listStaffRoles } from "@/lib/api/invitations";
import { addMembership } from "@/lib/api/people";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const membershipSchema = z.object({
  officeId: z.string().min(1, "اختر المكتب."),
  roleId: z.string().min(1, "اختر الدور."),
});

type MembershipValues = z.infer<typeof membershipSchema>;

const EMPTY: MembershipValues = { officeId: "", roleId: "" };

/**
 * عضوية إضافية لعضو فريق قائم — من ملفه الشخصي، لا من الدعوة. يظهر زرّها
 * لمن يحمل `roles.manage` وحده (المدير العام حصرًا اليوم).
 *
 * لا تُنهي عضوياته الحالية ولا تصير رئيسية؛ الخادم يرفض مكتبًا له فيه
 * عضوية نشطة بالفعل.
 */
export function AddMembershipDialog({
  personId,
  existingOfficeIds,
  ...props
}: DialogProps & { personId: string; existingOfficeIds: readonly string[] }) {
  const queryClient = useQueryClient();
  const offices = useOffices();
  const roles = useQuery({
    queryKey: ["roles", "STAFF"],
    queryFn: listStaffRoles,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  });
  const form = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: EMPTY,
  });

  const officeSelectOptions = officeOptions(offices.data ?? []).filter(
    (option) => !existingOfficeIds.includes(option.value),
  );
  const roleSelectOptions = (roles.data ?? []).map((role) => ({
    value: role.id,
    label: role.nameAr,
    description: role.descriptionAr ?? undefined,
  }));

  return (
    <FormDialog
      {...props}
      size="sm"
      title="إضافة عضوية"
      description="مكتب ودور جديدان لهذا العضو، إلى جانب عضوياته الحالية لا بدلًا منها."
      form={form}
      values={EMPTY}
      submitLabel="إضافة"
      onSubmit={(values) => addMembership(personId, values)}
      successMessage="أُضيفت العضوية."
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["people", personId] })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="officeId"
          label="المكتب"
          loading={offices.isPending}
          options={officeSelectOptions}
        />
        <SelectField
          control={form.control}
          name="roleId"
          label="الدور"
          loading={roles.isPending}
          options={roleSelectOptions}
        />
      </div>
    </FormDialog>
  );
}
