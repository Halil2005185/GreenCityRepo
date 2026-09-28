"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { officeOptions, useOffices } from "@/components/offices/office-options";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/form-fields";
import { listStaffRoles } from "@/lib/api/invitations";
import { updateMembership } from "@/lib/api/people";
import { useAccess } from "@/lib/auth/access";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const membershipSchema = z.object({
  officeId: z.string().min(1, "اختر الفريق."),
  roleId: z.string().min(1, "اختر الدور."),
});

type MembershipValues = z.infer<typeof membershipSchema>;

/**
 * تعديل فريق أو دور عضوية نشطة قائمة — من ملف العضو، لا من الدعوة.
 *
 * الفرق المعروضة ما يديره المستخدم، والأدوار ما يستطيع منحه في الفريق
 * المختار. `otherActiveOfficeIds` تستبعد فرقًا للعضو فيها عضوية نشطة
 * أخرى — الخادم يرفضها على أي حال، والاستبعاد يمنع محاولة تفشل.
 */
export function EditMembershipDialog({
  personId,
  membership,
  otherActiveOfficeIds,
  ...props
}: DialogProps & {
  personId: string;
  membership: { id: string; officeId: string; roleId: string } | null;
  otherActiveOfficeIds: readonly string[];
}) {
  const queryClient = useQueryClient();
  const access = useAccess();
  const offices = useOffices();
  const roles = useQuery({
    queryKey: ["roles", "STAFF"],
    queryFn: listStaffRoles,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  });
  const form = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { officeId: "", roleId: "" },
  });
  const officeId = useWatch({ control: form.control, name: "officeId" });

  const officeSelectOptions = officeOptions(offices.data ?? []).filter(
    (option) =>
      access.canManageOffice(option.value) && !otherActiveOfficeIds.includes(option.value),
  );
  const roleSelectOptions = (roles.data ?? [])
    .filter((role) => role.officeId === null || role.officeId === officeId)
    .filter((role) => !officeId || access.canDelegateAll(role.capabilities, officeId))
    .sort((a, b) => Number(b.officeId === officeId) - Number(a.officeId === officeId))
    .map((role) => ({
      value: role.id,
      label: role.nameAr,
      description: role.descriptionAr ?? undefined,
    }));

  if (!membership) return null;

  return (
    <FormDialog
      {...props}
      size="sm"
      title="تعديل الفريق أو الدور"
      description="تسقط معه الصلاحيات المخصّصة لهذا الشخص في هذه العضوية، ويحمل حزمة الدور الجديد."
      form={form}
      values={{ officeId: membership.officeId, roleId: membership.roleId }}
      submitLabel="حفظ"
      onSubmit={(values) => updateMembership(personId, membership.id, values)}
      successMessage="عُدِّلت العضوية."
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["people", personId] })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="officeId"
          label="الفريق"
          loading={offices.isPending || !access.ready}
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
