"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type TeamMember, getPerson } from "@/lib/api/people";
import { OPEN_STATUSES, WORK_STATUS_LABELS, listTasks } from "@/lib/api/work";
import { formatDate, formatDateTime } from "@/lib/utils";

const STATUS_LABELS: Record<TeamMember["status"], string> = {
  ACTIVE: "نشط",
  SUSPENDED: "موقوف",
  DISABLED: "معطّل",
};

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();

  const member = useQuery({
    queryKey: ["people", id],
    queryFn: () => getPerson(id),
  });

  /**
   * المهام تُقرأ من مسار العمل نفسه بمرشّح المُسنَد إليه، لا من مسار
   * جديد في وحدة الفريق. تكرار الاستعلام يعني تعريفين لـ«مهمة مفتوحة»
   * ينحرف أحدهما عن الآخر أول مرة تتغير الحالات.
   */
  const tasks = useQuery({
    queryKey: ["work", "tasks", { assigneeUserId: id, open: true }],
    queryFn: () => listTasks({ assigneeUserId: id, status: OPEN_STATUSES }),
    enabled: Boolean(member.data),
  });

  if (member.isPending) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (member.isError) {
    return (
      <div className="space-y-4">
        <Alert>تعذّر تحميل ملف العضو، أو أنه غير موجود.</Alert>
        <BackLink />
      </div>
    );
  }

  const active = member.data.memberships.filter(
    (membership) => membership.status === "ACTIVE",
  );
  const ended = member.data.memberships.filter(
    (membership) => membership.status === "ENDED",
  );

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <CardHeader>
          <CardTitle>{member.data.fullNameAr}</CardTitle>
          <CardDescription dir="ltr" className="text-start">
            {member.data.email}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">الحالة</dt>
              <dd className="font-medium">
                {STATUS_LABELS[member.data.status]}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">البريد موثَّق</dt>
              <dd className="font-medium">
                {member.data.emailVerifiedAt
                  ? formatDate(member.data.emailVerifiedAt)
                  : "لا"}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">في الفريق منذ</dt>
              <dd className="font-medium">
                {formatDate(member.data.createdAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>العضويات</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {active.length === 0 ? (
            <Alert>
              لا عضوية نشطة. الحساب قائم لكنه بلا مكتب ولا دور، فلا يرى شيئًا
              في اللوحة.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {active.map((membership) => (
                <li
                  key={membership.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {membership.officeNameAr}
                      {membership.isPrimary ? (
                        <span className="ms-2 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          رئيسي
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {membership.roleNameAr}
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    منذ {formatDate(membership.startedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {ended.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                عضويات سابقة
              </p>

              <ul className="space-y-1 text-sm text-muted-foreground">
                {ended.map((membership) => (
                  <li key={membership.id}>
                    {membership.officeNameAr} — {membership.roleNameAr} (
                    {formatDate(membership.startedAt)}
                    {membership.endedAt
                      ? ` ← ${formatDate(membership.endedAt)}`
                      : ""}
                    )
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المهام المفتوحة</CardTitle>
          <CardDescription>
            ما هو مسنَد إليه ولم يُغلق بعد.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {tasks.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : tasks.isError ? (
            <Alert>تعذّر تحميل المهام.</Alert>
          ) : tasks.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا مهام مفتوحة.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.data.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <span className="font-medium">{task.titleAr}</span>

                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{WORK_STATUS_LABELS[task.status]}</span>
                    {task.dueAt ? (
                      <span>تستحق {formatDateTime(task.dueAt)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/people"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowRight className="size-4" aria-hidden />
      دليل الفريق
    </Link>
  );
}
