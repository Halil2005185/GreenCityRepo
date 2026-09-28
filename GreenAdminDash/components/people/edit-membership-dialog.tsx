"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { officeOptions, useOffices } from "@/components/offices/office-options";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/form-fields";
import { listStaffRoles } from "@/lib/api/invitations";
import { updateMembership } from "@/lib/api/people";
import { useAuth } from "@/lib/auth/auth-context";
import { canGrantRole } from "@/lib/auth/capabilities";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const membershipSchema = z.object({
  officeId: z.string().min(1, "اختر المكتب."),
  roleId: z.string().min(1, "اختر الدور."),
});

type MembershipValues = z.infer<typeof membershipSchema>;

/**
 * تعديل مكتب أو دور عضوية نشطة قائمة — من ملف العضو، لا من الدعوة. زرّها
 * يظهر لمن يحمل `roles.manage` وحده، والأدوار المعروضة ما لا يتجاوز صلاحياته.
 *
 * `otherActiveOfficeIds` تستبعد من خيارات المكتب مكاتب له فيها عضوية
 * نشطة أخرى بالفعل — الخادم يرفضها على أي حال، والاستبعاد هنا يمنع
 * محاولة تفشل بدل أن يشرحها.
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
  const { user } = useAuth();
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

  const officeSelectOptions = officeOptions(offices.data ?? []).filter(
    (option) => !otherActiveOfficeIds.includes(option.value),
  );
  const roleSelectOptions = (roles.data ?? [])
    .filter((role) => canGrantRole(user?.capabilities ?? [], role.capabilities))
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
      title="تعديل عضوية"
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
