"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, TextField } from "@/components/ui/form-fields";
import { OneTimeLink } from "@/components/ui/one-time-link";
import type { SelectOption } from "@/components/ui/select";
import {
  createInvitation,
  listOffices,
  listStaffRoles,
  type Office,
} from "@/lib/api/invitations";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * المكاتب بتدرّجها: الفرعي تحت أبيه بمسافة بادئة، لا بشرطة تُلصق باسمه.
 * المعطّل لا يُدعى إليه، فلا يظهر.
 */
export function officeOptions(offices: readonly Office[]): SelectOption[] {
  const active = offices.filter((office) => office.isActive);
  const children = new Map<string | null, Office[]>();

  for (const office of active) {
    const parent = office.parentId && active.some((item) => item.id === office.parentId) ? office.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), office]);
  }

  const options: SelectOption[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const office of (children.get(parent) ?? []).sort((a, b) => a.displayOrder - b.displayOrder)) {
      options.push({ value: office.id, label: office.nameAr, depth });
      walk(office.id, depth + 1);
    }
  };

  walk(null, 0);

  return options;
}

export function useOffices() {
  return useQuery({ queryKey: ["offices"], queryFn: listOffices, staleTime: 5 * 60 * 1000 });
}

const inviteSchema = z.object({
  email: z.email("صيغة البريد الإلكتروني غير صحيحة."),
  fullNameAr: z.string().trim().max(160, "الاسم طويل جدًا."),
  officeId: z.string().min(1, "اختر المكتب."),
  roleId: z.string().min(1, "اختر الدور."),
});

type InviteValues = z.infer<typeof inviteSchema>;

const EMPTY: InviteValues = { email: "", fullNameAr: "", officeId: "", roleId: "" };

/**
 * دعوة عضو فريق، من دليل الفريق ومن صفحة الدعوات. كانت نموذجًا دائمًا
 * أعلى صفحة الدعوات يُعرض رابطه في تنبيه فوقه؛ صارت نافذة تعرض الرابط
 * في مكانها بعد الإنشاء.
 *
 * `initial` لإعادة إرسال دعوة منتهية أو معلّقة بالبيانات نفسها: الخادم
 * يُبقي دعوة معلّقة واحدة لكل بريد، فالجديدة تلغي السابقة.
 */
export function InviteStaffDialog({
  initial,
  ...props
}: DialogProps & { initial?: Partial<InviteValues> }) {
  const queryClient = useQueryClient();
  const offices = useOffices();
  const roles = useQuery({
    queryKey: ["roles", "STAFF"],
    queryFn: listStaffRoles,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  });
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: EMPTY,
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={initial?.email ? `إعادة دعوة ${initial.email}` : "دعوة عضو فريق"}
      description="الدور والمكتب يُثبَّتان وقت الإرسال. دعوة معلّقة واحدة لكل بريد — الجديدة تلغي السابقة."
      form={form}
      values={{ ...EMPTY, ...initial }}
      submitLabel="إنشاء الدعوة"
      onSubmit={(values) =>
        createInvitation({
          email: values.email,
          roleId: values.roleId,
          officeId: values.officeId,
          ...(values.fullNameAr ? { fullNameAr: values.fullNameAr } : {}),
        })
      }
      successMessage="أُنشئت الدعوة."
      onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["invitations"] })}
      renderSuccess={(result) => (
        <OneTimeLink
          url={result.inviteUrl}
          note="انسخ الرابط وأرسله إلى المدعوّ — الخادم يحفظ تجزئته لا نصه، فلن يظهر مرة أخرى."
        />
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="email"
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          className="text-start"
          placeholder="name@greencities.sy"
        />
        <TextField
          control={form.control}
          name="fullNameAr"
          label="الاسم الكامل (اختياري)"
          hint="يظهر للمدعوّ عند فتح الرابط."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="officeId"
          label="المكتب"
          loading={offices.isPending}
          options={officeOptions(offices.data ?? [])}
        />
        <SelectField
          control={form.control}
          name="roleId"
          label="الدور"
          loading={roles.isPending}
          options={(roles.data ?? []).map((role) => ({
            value: role.id,
            label: role.nameAr,
            description: role.descriptionAr ?? undefined,
          }))}
        />
      </div>
    </FormDialog>
  );
}
