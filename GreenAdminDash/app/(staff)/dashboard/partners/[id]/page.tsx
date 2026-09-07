"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Copy, ExternalLink } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
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
import { Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { createInvitation, listPartnerRoles } from "@/lib/api/invitations";
import {
  ACKNOWLEDGEMENT_METHOD_LABELS,
  PARTNERSHIP_STATUS_LABELS,
  PARTNERSHIP_TYPE_LABELS,
  PIPELINE_STAGES,
  STAGE_LABELS,
  SUPPORT_FORM_LABELS,
  type PartnerDetail,
  type PartnershipType,
  activatePartner,
  addContact,
  addPartnership,
  changeStage,
  getPartner,
  recordAcknowledgement,
  recordConsent,
  restorePartner,
  suspendPartner,
  updatePartnership,
} from "@/lib/api/partners";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const addContactSchema = z.object({
  fullNameAr: z
    .string()
    .trim()
    .min(3, "الاسم الكامل يجب ألا يقل عن 3 أحرف.")
    .max(160, "الاسم الكامل طويل جدًا."),
  jobTitleAr: z.string().trim().max(160, "المنصب طويل جدًا.").optional(),
  email: z
    .string()
    .trim()
    .email("صيغة البريد الإلكتروني غير صحيحة.")
    .max(254, "البريد طويل جدًا."),
});

const acknowledgementSchema = z.object({
  acknowledgedByNameAr: z
    .string()
    .trim()
    .min(3, "اسم المُقِرّ يجب ألا يقل عن 3 أحرف.")
    .max(160, "اسم المُقِرّ طويل جدًا."),
  method: z.string().min(1, "اختر طريقة الإقرار."),
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

/**
 * قائمة تحقق حيّة لشروط التفعيل الثلاثة.
 *
 * الخادم يحسبها ويعيدها مع كل قراءة، فما يظهر هنا هو ما سيفحصه فعلًا
 * عند الضغط على «اعتماد» — لا نسخة ثانية من المنطق تنحرف عنه.
 */
function ActivationChecklist({ partner }: { partner: PartnerDetail }) {
  return (
    <ul className="space-y-2">
      {partner.activation.requirements.map((requirement) => (
        <li key={requirement.key} className="flex items-center gap-2 text-sm">
          {requirement.satisfied ? (
            <Check className="size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span
            className={
              requirement.satisfied ? "text-foreground" : "text-muted-foreground"
            }
          >
            {requirement.labelAr}
          </span>
          <span className="sr-only">
            {requirement.satisfied ? "مستوفى" : "غير مستوفى"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const partner = useQuery({
    queryKey: ["partner", partnerId],
    queryFn: () => getPartner(partnerId),
  });

  const partnerRoles = useQuery({
    queryKey: ["roles", "PARTNER"],
    queryFn: listPartnerRoles,
    enabled: partner.data?.stage === "ACTIVE",
  });

  /** كل الطفرات تعيد الملف الكامل، فتحديث المخزن يكفي دون إعادة جلب. */
  function onMutated(updated: PartnerDetail) {
    queryClient.setQueryData(["partner", partnerId], updated);
    void queryClient.invalidateQueries({ queryKey: ["partners"] });
    setError(null);
  }

  function onFailed(caught: unknown) {
    if (caught instanceof ApiError) {
      const missing = caught.fieldIssues
        .map((issue) => (issue as unknown as { labelAr?: string }).labelAr)
        .filter(Boolean);

      setError(
        missing.length > 0
          ? `${caught.message} الناقص: ${missing.join("، ")}.`
          : caught.message,
      );
      return;
    }

    setError("تعذّر تنفيذ الإجراء. حاول مجددًا.");
  }

  /**
   * كل طفرة نداء `useMutation` مستقل. تغليفها في مساعد يستدعي الخطّاف
   * داخل دالة يكسر قواعد الخطّافات، حتى لو صادف أن الترتيب ثابت اليوم.
   */
  const shared = { onSuccess: onMutated, onError: onFailed };

  const stageMutation = useMutation({
    mutationFn: (stage: string) => changeStage(partnerId, stage),
    ...shared,
  });

  const contactMutation = useMutation({
    mutationFn: (input: {
      fullNameAr: string;
      email: string;
      jobTitleAr: string;
    }) => addContact(partnerId, { ...input, isPrimary: true }),
    ...shared,
  });

  const partnershipMutation = useMutation({
    mutationFn: (type: PartnershipType) => addPartnership(partnerId, type),
    ...shared,
  });

  const partnershipStatusMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status: "APPROVED" | "PAUSED" | "ENDED";
    }) => updatePartnership(partnerId, input.id, input.status),
    ...shared,
  });

  const consentMutation = useMutation({
    mutationFn: (input: {
      consentType: "PUBLIC_NAME" | "PUBLIC_LOGO";
      action: "GRANTED" | "REVOKED";
    }) => recordConsent(partnerId, input.consentType, input.action),
    ...shared,
  });

  const acknowledgementMutation = useMutation({
    mutationFn: (input: {
      method: keyof typeof ACKNOWLEDGEMENT_METHOD_LABELS;
      acknowledgedByNameAr: string;
    }) => recordAcknowledgement(partnerId, input),
    ...shared,
  });

  const activateMutation = useMutation({
    mutationFn: () => activatePartner(partnerId),
    ...shared,
  });

  const suspendMutation = useMutation({
    mutationFn: (reason: string) => suspendPartner(partnerId, reason),
    ...shared,
  });

  const restoreMutation = useMutation({
    mutationFn: () => restorePartner(partnerId),
    ...shared,
  });

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; roleId: string }) =>
      createInvitation({ ...input, partnerId }),
    onSuccess: (result) => {
      setInviteUrl(result.inviteUrl);
      setError(null);
    },
    onError: onFailed,
  });

  if (partner.isPending) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (partner.isError || !partner.data) {
    return <Alert>تعذّر تحميل ملف الجهة.</Alert>;
  }

  const data = partner.data;
  const canManage = can(CAPABILITIES.partnersManage);
  const canApprove = can(CAPABILITIES.partnersApprove);
  const isPipeline = !["ACTIVE", "REJECTED", "ENDED"].includes(data.stage);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.displayNameAr}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.legalNameAr}
            {data.activatedAt
              ? ` · معتمدة منذ ${formatDateTime(data.activatedAt)}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
            {STAGE_LABELS[data.stage]}
          </span>
          {data.isSuspended ? (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm text-destructive">
              معلّقة
            </span>
          ) : null}
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {data.isSuspended && data.suspensionReasonAr ? (
        <Alert>سبب التعليق: {data.suspensionReasonAr}</Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section
            title="جهات الاتصال"
            description="جهة اتصال رئيسية نشطة واحدة — وهي أحد شروط الاعتماد."
          >
            {data.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد جهات اتصال.</p>
            ) : (
              <ul className="space-y-2">
                {data.contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {contact.fullNameAr}
                        {contact.isPrimary ? (
                          <span className="ms-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            رئيسية
                          </span>
                        ) : null}
                        {contact.hasAccount ? (
                          <span className="ms-2 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">
                            لديه حساب
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contact.jobTitleAr ?? "—"}
                        {contact.email ? ` · ${contact.email}` : ""}
                        {contact.phone ? ` · ${contact.phone}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canManage ? (
              <form
                className="grid gap-2 border-t border-border pt-3 sm:grid-cols-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  const form = new FormData(event.currentTarget);
                  const raw = {
                    fullNameAr: String(form.get("fullNameAr") ?? ""),
                    jobTitleAr:
                      String(form.get("jobTitleAr") ?? "").trim() || undefined,
                    email: String(form.get("email") ?? "").trim(),
                  };

                  const parsed = addContactSchema.safeParse(raw);
                  if (!parsed.success) {
                    setError(
                      parsed.error.issues[0]?.message ??
                        "بيانات جهة الاتصال غير صالحة.",
                    );
                    return;
                  }

                  contactMutation.mutate({
                    fullNameAr: parsed.data.fullNameAr,
                    email: parsed.data.email,
                    jobTitleAr: parsed.data.jobTitleAr ?? "",
                  });
                  event.currentTarget.reset();
                }}
              >
                <Input name="fullNameAr" placeholder="الاسم الكامل" required />
                <Input name="jobTitleAr" placeholder="المنصب" />
                <Input
                  name="email"
                  type="email"
                  placeholder="البريد"
                  dir="ltr"
                  className="text-start"
                  required
                />
                <Button type="submit" loading={contactMutation.isPending}>
                  إضافة رئيسية
                </Button>
              </form>
            ) : null}
          </Section>

          <Section
            title="أنواع الشراكة"
            description="يمكن أن تحمل الجهة أكثر من نوع. الاعتماد من صلاحية المدير العام."
          >
            {data.partnerships.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أنواع مسجّلة.</p>
            ) : (
              <ul className="space-y-2">
                {data.partnerships.map((partnership) => (
                  <li
                    key={partnership.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {PARTNERSHIP_TYPE_LABELS[partnership.type]}
                      </span>
                      <span
                        className={cn(
                          "ms-2 rounded px-1.5 py-0.5 text-xs",
                          partnership.status === "APPROVED"
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {PARTNERSHIP_STATUS_LABELS[partnership.status]}
                      </span>
                      {partnership.approvedByNameAr ? (
                        <span className="ms-2 text-xs text-muted-foreground">
                          اعتمدها {partnership.approvedByNameAr}
                        </span>
                      ) : null}
                    </div>

                    {partnership.status === "PROPOSED" && canApprove ? (
                      <Button
                        size="sm"
                        loading={partnershipStatusMutation.isPending}
                        onClick={() =>
                          partnershipStatusMutation.mutate({
                            id: partnership.id,
                            status: "APPROVED",
                          })
                        }
                      >
                        اعتماد
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canManage ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                {(
                  Object.keys(PARTNERSHIP_TYPE_LABELS) as PartnershipType[]
                ).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.partnerships.some(
                      (item) => item.type === type && item.status !== "ENDED",
                    )}
                    onClick={() => partnershipMutation.mutate(type)}
                  >
                    + {PARTNERSHIP_TYPE_LABELS[type]}
                  </Button>
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            title="الإقرار بالميثاق"
            description="سجل إضافي فقط. يُسجَّل الإقرار بالإصدار الساري وقت التسجيل."
          >
            {data.acknowledgements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لم تُقرّ الجهة بالميثاق بعد.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.acknowledgements.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      الإصدار {item.charterVersion} ·{" "}
                      {ACKNOWLEDGEMENT_METHOD_LABELS[item.method]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.acknowledgedByNameAr}
                      {item.acknowledgedByTitleAr
                        ? ` — ${item.acknowledgedByTitleAr}`
                        : ""}{" "}
                      · {formatDateTime(item.acknowledgedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {can(CAPABILITIES.partnersManage) ? (
              <form
                className="grid gap-2 border-t border-border pt-3 sm:grid-cols-3"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  const form = new FormData(event.currentTarget);
                  const raw = {
                    acknowledgedByNameAr: String(form.get("name") ?? ""),
                    method: String(form.get("method") ?? ""),
                  };

                  const parsed = acknowledgementSchema.safeParse(raw);
                  if (!parsed.success) {
                    setError(
                      parsed.error.issues[0]?.message ??
                        "بيانات الإقرار غير صالحة.",
                    );
                    return;
                  }

                  acknowledgementMutation.mutate({
                    acknowledgedByNameAr: parsed.data.acknowledgedByNameAr,
                    method:
                      parsed.data
                        .method as keyof typeof ACKNOWLEDGEMENT_METHOD_LABELS,
                  });
                  event.currentTarget.reset();
                }}
              >
                <Input name="name" placeholder="اسم المُقِرّ" required />
                <select
                  name="method"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="طريقة الإقرار"
                >
                  {Object.entries(ACKNOWLEDGEMENT_METHOD_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
                <Button type="submit" loading={acknowledgementMutation.isPending}>
                  تسجيل الإقرار
                </Button>
              </form>
            ) : null}
          </Section>

          <Section title="سجل المتابعة">
            {data.interactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد سجلات.</p>
            ) : (
              <ol className="space-y-2">
                {data.interactions.map((item) => (
                  <li
                    key={item.id}
                    className="border-s-2 border-border ps-3 text-sm"
                  >
                    <p>{item.summaryAr}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.occurredAt)}
                      {item.recordedByNameAr ? ` · ${item.recordedByNameAr}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section
            title="شروط الاعتماد"
            description="موافقة الإظهار ليست شرطًا — الميثاق يجعلها مستقلة."
          >
            <ActivationChecklist partner={data} />

            {canApprove && data.stage !== "ACTIVE" ? (
              <Button
                className="w-full"
                disabled={!data.activation.satisfied}
                loading={activateMutation.isPending}
                onClick={() => activateMutation.mutate()}
              >
                اعتماد الشراكة وتفعيل الجهة
              </Button>
            ) : null}

            {!canApprove && data.stage !== "ACTIVE" ? (
              <p className="text-xs text-muted-foreground">
                الاعتماد النهائي من صلاحية المدير العام.
              </p>
            ) : null}

            {canApprove && data.stage === "ACTIVE" ? (
              data.isSuspended ? (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate()}
                >
                  رفع التعليق
                </Button>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    suspendMutation.mutate(String(form.get("reason") ?? ""));
                  }}
                >
                  <Input name="reason" placeholder="سبب التعليق" required />
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    loading={suspendMutation.isPending}
                  >
                    تعليق مؤقت
                  </Button>
                </form>
              )
            ) : null}
          </Section>

          {isPipeline && canManage ? (
            <Section title="المرحلة">
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE_STAGES.map((stage) => (
                  <Button
                    key={stage}
                    type="button"
                    size="sm"
                    variant={data.stage === stage ? "default" : "outline"}
                    onClick={() => stageMutation.mutate(stage)}
                  >
                    {STAGE_LABELS[stage]}
                  </Button>
                ))}
              </div>
            </Section>
          ) : null}

          <Section
            title="موافقة الإظهار"
            description="مستقلة عن حالة الشراكة. للجهة أن تسحبها من بوابتها متى شاءت."
          >
            {(
              [
                ["PUBLIC_NAME", "إظهار الاسم", data.publicNameConsent],
                ["PUBLIC_LOGO", "إظهار الشعار", data.publicLogoConsent],
              ] as const
            ).map(([type, label, granted]) => (
              <div
                key={type}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {label}:{" "}
                  <span className={granted ? "text-success" : "text-muted-foreground"}>
                    {granted ? "ممنوحة" : "غير ممنوحة"}
                  </span>
                </span>

                {can(CAPABILITIES.partnersManage) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      consentMutation.mutate({
                        consentType: type,
                        action: granted ? "REVOKED" : "GRANTED",
                      })
                    }
                  >
                    {granted ? "سحب" : "منح"}
                  </Button>
                ) : null}
              </div>
            ))}
          </Section>

          {data.stage === "ACTIVE" && !data.isSuspended ? (
            <Section
              title="دعوة ممثل"
              description="لا تُرسل قبل الاعتماد. الممثل يرى جهته وحدها."
            >
              {inviteUrl ? (
                <Alert variant="info" className="space-y-2">
                  <p className="font-medium text-foreground">
                    انسخ الرابط وأرسله — لن يظهر مرة أخرى.
                  </p>
                  <div className="flex items-center gap-2">
                    <code
                      dir="ltr"
                      className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs"
                    >
                      {inviteUrl}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard.writeText(inviteUrl)
                      }
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </Alert>
              ) : null}

              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  inviteMutation.mutate({
                    email: String(form.get("email") ?? ""),
                    roleId: String(form.get("roleId") ?? ""),
                  });
                }}
              >
                <Input
                  name="email"
                  type="email"
                  placeholder="بريد الممثل"
                  dir="ltr"
                  className="text-start"
                  required
                />
                <div className="space-y-1">
                  <Label htmlFor="partner-role">الدور</Label>
                  <select
                    id="partner-role"
                    name="roleId"
                    required
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {partnerRoles.data?.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.nameAr}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  loading={inviteMutation.isPending}
                >
                  إرسال الدعوة
                </Button>
              </form>
            </Section>
          ) : null}

          <Section title="بيانات الجهة">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">أشكال الدعم</dt>
                <dd>
                  {data.supportForms.length === 0
                    ? "—"
                    : data.supportForms
                        .map((form) => SUPPORT_FORM_LABELS[form])
                        .join("، ")}
                </dd>
              </div>

              {data.websiteUrl ? (
                <div>
                  <dt className="text-xs text-muted-foreground">الموقع</dt>
                  <dd>
                    <a
                      href={data.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      dir="ltr"
                    >
                      {data.websiteUrl}
                      <ExternalLink className="size-3" />
                    </a>
                  </dd>
                </div>
              ) : null}

              {data.summaryAr ? (
                <div>
                  <dt className="text-xs text-muted-foreground">نبذة</dt>
                  <dd>{data.summaryAr}</dd>
                </div>
              ) : null}

              {data.internalNotesAr ? (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    ملاحظات داخلية
                  </dt>
                  <dd className="rounded-md bg-muted p-2">
                    {data.internalNotesAr}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
