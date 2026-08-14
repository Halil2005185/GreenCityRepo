"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  type Invitation,
  createInvitation,
  listInvitations,
  listOffices,
  listStaffRoles,
  revokeInvitation,
} from "@/lib/api/invitations";
import { formatDateTime } from "@/lib/utils";

const inviteSchema = z.object({
  email: z.email("صيغة البريد الإلكتروني غير صحيحة."),
  fullNameAr: z.string().trim().max(160).optional(),
  roleId: z.string().min(1, "اختر الدور."),
  officeId: z.string().min(1, "اختر المكتب."),
});

type InviteValues = z.infer<typeof inviteSchema>;

const STATUS_LABELS: Record<Invitation["status"], string> = {
  PENDING: "معلّقة",
  ACCEPTED: "مقبولة",
  REVOKED: "ملغاة",
  EXPIRED: "منتهية",
};

const STATUS_STYLES: Record<Invitation["status"], string> = {
  PENDING: "bg-warning/15 text-warning",
  ACCEPTED: "bg-success/15 text-success",
  REVOKED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
};

/**
 * الرابط يعود من الخادم مرة واحدة فقط — القاعدة تحفظ تجزئته لا نصه.
 * لذلك يُعرض هنا للنسخ ولا يمكن استرجاعه من قائمة الدعوات لاحقًا.
 */
function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Alert variant="info" className="space-y-2">
      <p className="font-medium text-foreground">
        أُنشئت الدعوة. انسخ الرابط وأرسله للمدعوّ — لن يظهر مرة أخرى.
      </p>

      <div className="flex items-center gap-2">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs"
        >
          {url}
        </code>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "نُسخ" : "نسخ"}
        </Button>
      </div>
    </Alert>
  );
}

export default function InvitationsPage() {
  const queryClient = useQueryClient();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: () => listInvitations(),
  });

  const offices = useQuery({ queryKey: ["offices"], queryFn: listOffices });
  const roles = useQuery({ queryKey: ["roles", "STAFF"], queryFn: listStaffRoles });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", fullNameAr: "", roleId: "", officeId: "" },
  });

  const create = useMutation({
    mutationFn: createInvitation,
    onSuccess: (result) => {
      setInviteUrl(result.inviteUrl);
      setFormError(null);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (error) => {
      setInviteUrl(null);
      setFormError(
        error instanceof ApiError
          ? error.message
          : "تعذّر إنشاء الدعوة. حاول مجددًا.",
      );
    },
  });

  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const onSubmit = handleSubmit((values) =>
    create.mutateAsync({
      email: values.email,
      roleId: values.roleId,
      officeId: values.officeId,
      ...(values.fullNameAr ? { fullNameAr: values.fullNameAr } : {}),
    }),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">الدعوات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الدعوة هي المدخل الوحيد لإنشاء حساب. الدور والمكتب يُثبَّتان وقت
          الإرسال، فلا يغيّرهما تعديل لاحق.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>دعوة عضو فريق</CardTitle>
          <CardDescription>
            دعوة معلّقة واحدة لكل بريد — إعادة الإرسال تلغي السابقة.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? <Alert>{formError}</Alert> : null}
            {inviteUrl ? <InviteLink url={inviteUrl} /> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="email"
                label="البريد الإلكتروني"
                error={errors.email?.message}
              >
                {(props) => (
                  <Input
                    {...props}
                    {...register("email")}
                    type="email"
                    dir="ltr"
                    className="text-start"
                    placeholder="name@greencities.sy"
                  />
                )}
              </Field>

              <Field
                id="fullNameAr"
                label="الاسم الكامل"
                hint="اختياري — يظهر للمدعوّ عند فتح الرابط."
                error={errors.fullNameAr?.message}
              >
                {(props) => <Input {...props} {...register("fullNameAr")} />}
              </Field>

              <div className="space-y-1.5">
                <Label htmlFor="officeId">المكتب</Label>
                <select
                  id="officeId"
                  {...register("officeId")}
                  aria-invalid={Boolean(errors.officeId)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">اختر المكتب…</option>
                  {offices.data
                    ?.filter((office) => office.isActive)
                    .map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.parentId ? "— " : ""}
                        {office.nameAr}
                      </option>
                    ))}
                </select>
                {errors.officeId ? (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.officeId.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="roleId">الدور</Label>
                <select
                  id="roleId"
                  {...register("roleId")}
                  aria-invalid={Boolean(errors.roleId)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">اختر الدور…</option>
                  {roles.data?.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.nameAr}
                    </option>
                  ))}
                </select>
                {errors.roleId ? (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.roleId.message}
                  </p>
                ) : null}
              </div>
            </div>

            <Button type="submit" loading={isSubmitting || create.isPending}>
              إرسال الدعوة
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الدعوات المرسلة</CardTitle>
        </CardHeader>

        <CardContent>
          {invitations.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : invitations.isError ? (
            <Alert>تعذّر تحميل الدعوات.</Alert>
          ) : invitations.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لم تُرسل أي دعوة بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start font-medium">البريد</th>
                    <th className="p-2 text-start font-medium">الدور</th>
                    <th className="p-2 text-start font-medium">المكتب</th>
                    <th className="p-2 text-start font-medium">الحالة</th>
                    <th className="p-2 text-start font-medium">تنتهي</th>
                    <th className="p-2" />
                  </tr>
                </thead>

                <tbody>
                  {invitations.data.map((invitation) => (
                    <tr key={invitation.id} className="border-b border-border/60">
                      <td className="p-2" dir="ltr">
                        <span className="block text-start">{invitation.email}</span>
                      </td>
                      <td className="p-2">{invitation.roleNameAr}</td>
                      <td className="p-2">{invitation.officeNameAr ?? "—"}</td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[invitation.status]}`}
                        >
                          {STATUS_LABELS[invitation.status]}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {formatDateTime(invitation.expiresAt)}
                      </td>
                      <td className="p-2 text-end">
                        {invitation.status === "PENDING" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={
                              revoke.isPending &&
                              revoke.variables === invitation.id
                            }
                            onClick={() => revoke.mutate(invitation.id)}
                          >
                            إلغاء
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
