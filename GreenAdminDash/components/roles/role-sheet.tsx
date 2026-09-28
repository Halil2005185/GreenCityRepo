"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { CapabilityChecklistField } from "@/components/access/capability-checklist";
import { officeOptions, useOffices } from "@/components/offices/office-options";
import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import { SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import { type Role, createRole, updateRole } from "@/lib/api/roles";
import { useCapabilityCatalog } from "@/lib/auth/access";
import { useAuth } from "@/lib/auth/auth-context";

const roleSchema = z.object({
  nameAr: z.string().trim().min(2, "اسم الدور قصير جدًا.").max(160, "الاسم طويل جدًا."),
  descriptionAr: z.string().trim().max(1000, "الوصف طويل جدًا."),
  /** فارغ = دور عام يصلح لأي فريق. */
  officeId: z.string(),
  capabilities: z.array(z.string()),
});

type RoleValues = z.infer<typeof roleSchema>;

const EMPTY: RoleValues = { nameAr: "", descriptionAr: "", officeId: "", capabilities: [] };

/**
 * إنشاء دور أو تحرير حزمته. التحرير يغيّر صلاحيات كل من يحمل الدور في
 * كل فريق، فالوصف يقول ذلك صراحةً قبل الحفظ.
 *
 * القدرة التي لا يحملها المحرِّر مقفلة، وكذلك الإدارية لمن لا يحمل
 * الإدارية كلها — قاعدة `assertCanEditBundle` في الخادم نفسها.
 */
export function RoleSheet({
  role,
  open,
  onOpenChange,
}: {
  /** `null` للإنشاء. */
  role: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { user, reload } = useAuth();
  const offices = useOffices();
  const catalog = useCapabilityCatalog(open);
  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: EMPTY,
  });

  const held = new Set(user?.capabilities ?? []);
  const adminKeys = (catalog.data ?? [])
    .filter((capability) => capability.tier === "ADMIN")
    .map((capability) => capability.key);
  const holdsAllAdmin = adminKeys.every((key) => held.has(key));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      presentation="sheet"
      size="lg"
      title={role ? `تحرير «${role.nameAr}»` : "دور جديد"}
      description={
        role
          ? `يغيّر صلاحيات كل من يحمل هذا الدور (${role.activeMembers} عضو الآن)، في كل فريق.`
          : "منصب بحزمة صلاحيات يُسنَد عند ضمّ أحد إلى فريق. الاستثناءات لشخص بعينه تُضبط من ملفه."
      }
      form={form}
      values={
        role
          ? {
              nameAr: role.nameAr,
              descriptionAr: role.descriptionAr ?? "",
              officeId: role.officeId ?? "",
              capabilities: role.capabilities,
            }
          : EMPTY
      }
      submitLabel={role ? "حفظ الحزمة" : "إنشاء الدور"}
      onSubmit={(values) => {
        const input = {
          nameAr: values.nameAr,
          descriptionAr: values.descriptionAr || null,
          officeId: values.officeId || null,
          capabilities: values.capabilities,
        };

        return role ? updateRole(role.id, input) : createRole(input);
      }}
      successMessage={role ? "حُفظت حزمة الدور." : "أُنشئ الدور."}
      onSuccess={() => {
        void queryClient.invalidateQueries({ queryKey: ["roles"] });

        // من يحرّر دورًا يحمله يرى أثره في اللوحة فورًا.
        if (role && user?.memberships.some((membership) => membership.roleId === role.id)) {
          void reload();
        }
      }}
    >
      <FormSection title="الدور">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="nameAr" label="الاسم" maxLength={160} />
          <SelectField
            control={form.control}
            name="officeId"
            label="الفريق"
            hint="فارغ: دور عام يصلح لأي فريق."
            placeholder="دور عام"
            loading={offices.isPending}
            options={officeOptions(offices.data ?? [])}
            clearable
          />
        </div>
        <TextareaField
          control={form.control}
          name="descriptionAr"
          label="وصف (اختياري)"
          hint="ما يفعله صاحب هذا الدور — يظهر تحت اسمه عند الاختيار."
          rows={2}
        />
      </FormSection>

      <FormSection
        title="الصلاحيات"
        description="القفل على صلاحية لا تحملها، أو صلاحية إدارية لا يغيّرها إلا من يحمل الإدارية كلها."
      >
        <CapabilityChecklistField
          control={form.control}
          name="capabilities"
          catalog={catalog.data ?? []}
          canChange={(key) =>
            held.has(key) && (!adminKeys.includes(key) || holdsAllAdmin)
          }
        />
      </FormSection>
    </FormDialog>
  );
}
