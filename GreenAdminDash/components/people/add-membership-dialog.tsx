"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { officeOptions, useOffices } from "@/components/offices/office-options";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/form-fields";
import type { SelectOption } from "@/components/ui/select";
import { listStaffRoles } from "@/lib/api/invitations";
import { addMembership, searchCandidates } from "@/lib/api/people";
import { useAccess } from "@/lib/auth/access";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const membershipSchema = z.object({
  personId: z.string().min(1, "اختر العضو."),
  officeId: z.string().min(1, "اختر الفريق."),
  roleId: z.string().min(1, "اختر الدور."),
});

type MembershipValues = z.infer<typeof membershipSchema>;

/** البحث يبدأ من حرفين: المسار يرفض أقل، ولا يصير نسخة من الدليل. */
const candidateSource = {
  queryKey: ["people", "candidates"],
  load: async (query: string, signal: AbortSignal): Promise<SelectOption[]> =>
    query.trim().length < 2
      ? []
      : (await searchCandidates(query.trim(), signal)).map((candidate) => ({
          value: candidate.id,
          label: candidate.fullNameAr,
          description: candidate.email,
        })),
};

/**
 * ضمّ عضو فريق قائم إلى فريق يديره المستخدم، بدور يستطيع منحه فيه.
 *
 * من ملف العضو يأتي `personId` جاهزًا؛ من الدليل يُختار الزميل بالبحث —
 * مدير الفريق لا يرى الدليل كله، فيجده بالاسم. العضوية لا تُنهي غيرها ولا
 * تصير رئيسية، والانضمام يمنح حزمة الدور تلقائيًا.
 */
export function AddMembershipDialog({
  personId,
  existingOfficeIds = [],
  ...props
}: DialogProps & { personId?: string; existingOfficeIds?: readonly string[] }) {
  const queryClient = useQueryClient();
  const access = useAccess();
  const offices = useOffices();
  const roles = useQuery({
    queryKey: ["roles", "STAFF"],
    queryFn: listStaffRoles,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  });
  const empty: MembershipValues = { personId: personId ?? "", officeId: "", roleId: "" };
  const form = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: empty,
  });
  const officeId = useWatch({ control: form.control, name: "officeId" });

  const officeSelectOptions = officeOptions(offices.data ?? []).filter(
    (option) =>
      access.canManageOffice(option.value) && !existingOfficeIds.includes(option.value),
  );

  // أدوار الفريق المختار أولًا ثم العامة؛ ما لا يستطيع منحه فيه لا يظهر.
  const roleSelectOptions = (roles.data ?? [])
    .filter((role) => role.officeId === null || role.officeId === officeId)
    .filter((role) => !officeId || access.canDelegateAll(role.capabilities, officeId))
    .sort((a, b) => Number(b.officeId === officeId) - Number(a.officeId === officeId))
    .map((role) => ({
      value: role.id,
      label: role.nameAr,
      description: role.descriptionAr ?? undefined,
    }));

  return (
    <FormDialog
      {...props}
      size="sm"
      title={personId ? "إضافة إلى فريق" : "ضمّ زميل إلى فريقك"}
      description="يحمل صلاحيات الدور تلقائيًا في هذا الفريق، إلى جانب عضوياته الحالية. تخصيصها لشخصه يأتي بعد الإضافة من ملفه."
      form={form}
      values={empty}
      submitLabel="إضافة"
      onSubmit={(values) =>
        addMembership(values.personId, { officeId: values.officeId, roleId: values.roleId })
      }
      successMessage="أُضيفت العضوية."
      // الملف والدليل معًا: من يُضمّ من الدليل يظهر في قائمة الفريق فورًا.
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["people"] })}
    >
      {personId ? null : (
        <SelectField
          control={form.control}
          name="personId"
          label="الزميل"
          hint="ابحث بالاسم أو البريد."
          source={candidateSource}
          searchable
        />
      )}
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
          hint={officeId ? undefined : "اختر الفريق أولًا."}
          loading={roles.isPending}
          disabled={!officeId}
          options={roleSelectOptions}
        />
      </div>
    </FormDialog>
  );
}
