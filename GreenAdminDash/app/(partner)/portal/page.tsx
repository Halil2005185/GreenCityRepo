"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PARTNERSHIP_STATUS_LABELS,
  PARTNERSHIP_TYPE_LABELS,
  SUPPORT_FORM_LABELS,
  type PartnershipType,
  type SupportForm,
  getMyOrganization,
  updateMyDisplayConsent,
} from "@/lib/api/partners";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { formatDateTime } from "@/lib/utils";

export default function PartnerPortalPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();

  const organization = useQuery({
    queryKey: ["my-organization"],
    queryFn: getMyOrganization,
  });

  const consent = useMutation({
    mutationFn: updateMyDisplayConsent,
    onSuccess: (updated) =>
      queryClient.setQueryData(["my-organization"], updated),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">أهلًا {user.fullNameAr}</h1>
        {user.partner ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {user.partner.displayNameAr} · {user.partner.roleNameAr}
          </p>
        ) : null}
      </header>

      {organization.isPending ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : organization.isError ? (
        <Alert>تعذّر تحميل ملف الجهة.</Alert>
      ) : (
        <>
          {organization.data.isSuspended ? (
            <Alert>
              حساب جهتكم معلّق مؤقتًا
              {organization.data.suspensionReasonAr
                ? ` — ${organization.data.suspensionReasonAr}`
                : ""}
              . راجعوا مكتب العلاقات.
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>ملف الجهة</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      الاسم القانوني
                    </dt>
                    <dd>{organization.data.legalNameAr}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      أنواع الشراكة
                    </dt>
                    <dd className="flex flex-wrap gap-1">
                      {organization.data.partnerships.length === 0
                        ? "—"
                        : organization.data.partnerships.map((partnership) => (
                            <span
                              key={partnership.type}
                              className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                            >
                              {
                                PARTNERSHIP_TYPE_LABELS[
                                  partnership.type as PartnershipType
                                ]
                              }
                              {" · "}
                              {
                                PARTNERSHIP_STATUS_LABELS[
                                  partnership.status as keyof typeof PARTNERSHIP_STATUS_LABELS
                                ]
                              }
                            </span>
                          ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">أشكال الدعم</dt>
                    <dd>
                      {organization.data.supportForms.length === 0
                        ? "—"
                        : organization.data.supportForms
                            .map(
                              (form) => SUPPORT_FORM_LABELS[form as SupportForm],
                            )
                            .join("، ")}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>موافقة الإظهار</CardTitle>
                <CardDescription>
                  أنتم تقررون ظهور اسم جهتكم وشعارها. السحب متاح في أي وقت ولا
                  يؤثر على الشراكة.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {(
                  [
                    [
                      "publicNameConsent",
                      "إظهار اسم الجهة",
                      organization.data.publicNameConsent,
                    ],
                    [
                      "publicLogoConsent",
                      "إظهار شعار الجهة",
                      organization.data.publicLogoConsent,
                    ],
                  ] as const
                ).map(([key, label, granted]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {label}:{" "}
                      <span
                        className={
                          granted ? "text-success" : "text-muted-foreground"
                        }
                      >
                        {granted ? "ممنوحة" : "غير ممنوحة"}
                      </span>
                    </span>

                    {can(CAPABILITIES.partnerConsentManage) &&
                    !organization.data.isSuspended ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={consent.isPending}
                        onClick={() => consent.mutate({ [key]: !granted })}
                      >
                        {granted ? "سحب" : "منح"}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>الإقرار بالميثاق</CardTitle>
              </CardHeader>
              <CardContent>
                {organization.data.acknowledgements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    لا يوجد إقرار مسجّل.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {organization.data.acknowledgements.map((item) => (
                      <li
                        key={`${item.charterVersion}-${item.acknowledgedAt}`}
                        className="rounded-md border border-border p-3"
                      >
                        الإصدار {item.charterVersion} ·{" "}
                        {item.acknowledgedByNameAr} ·{" "}
                        {formatDateTime(item.acknowledgedAt)}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
