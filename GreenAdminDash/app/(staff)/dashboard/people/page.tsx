"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/field";
import { listOffices } from "@/lib/api/invitations";
import {
  type TeamMember,
  listPeople,
  primaryMembership,
} from "@/lib/api/people";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<TeamMember["status"], string> = {
  ACTIVE: "نشط",
  SUSPENDED: "موقوف",
  DISABLED: "معطّل",
};

const STATUS_STYLES: Record<TeamMember["status"], string> = {
  ACTIVE: "bg-success/15 text-success",
  SUSPENDED: "bg-warning/15 text-warning",
  DISABLED: "bg-muted text-muted-foreground",
};

export default function PeoplePage() {
  const [officeId, setOfficeId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const offices = useQuery({ queryKey: ["offices"], queryFn: listOffices });

  /**
   * المرشحات جزء من مفتاح الاستعلام لا حالة جانبية: كل تركيبة تُخزَّن
   * وحدها، فالعودة إلى مرشّح سابق فورية بلا طلب جديد.
   */
  const people = useQuery({
    queryKey: ["people", { officeId, status, q }],
    queryFn: () =>
      listPeople({
        officeId: officeId || undefined,
        status: (status || undefined) as TeamMember["status"] | undefined,
        q: q.trim() || undefined,
      }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>دليل الفريق</CardTitle>
          <CardDescription>
            أعضاء إيفا ومكاتبهم وأدوارهم. ممثلو الشركاء ليسوا هنا — سجلّهم في
            صفحة الشركاء لأن نطاقهم جهتهم لا مكتبًا.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="q" label="بحث">
              {(props) => (
                <Input
                  {...props}
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="بالاسم أو البريد"
                />
              )}
            </Field>

            <div className="space-y-1.5">
              <Label htmlFor="officeId">المكتب</Label>
              <select
                id="officeId"
                value={officeId}
                onChange={(event) => setOfficeId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">كل المكاتب</option>
                {offices.data?.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.nameAr}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">الحالة</Label>
              <select
                id="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">كل الحالات</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            الأعضاء
            {people.data ? (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {people.data.length}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {people.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : people.isError ? (
            <Alert>تعذّر تحميل دليل الفريق.</Alert>
          ) : people.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا أعضاء مطابقين للمرشّحات.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start font-medium">الاسم</th>
                    <th className="p-2 text-start font-medium">البريد</th>
                    <th className="p-2 text-start font-medium">المكتب</th>
                    <th className="p-2 text-start font-medium">الدور</th>
                    <th className="p-2 text-start font-medium">الحالة</th>
                    <th className="p-2 text-start font-medium">منذ</th>
                  </tr>
                </thead>

                <tbody>
                  {people.data.map((member) => {
                    const membership = primaryMembership(member);

                    return (
                      <tr
                        key={member.id}
                        className="border-b border-border/60 hover:bg-muted/40"
                      >
                        <td className="p-2">
                          <Link
                            href={`/dashboard/people/${member.id}`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {member.fullNameAr}
                          </Link>
                        </td>
                        <td className="p-2" dir="ltr">
                          <span className="block text-start text-muted-foreground">
                            {member.email}
                          </span>
                        </td>
                        <td className="p-2">
                          {membership?.officeNameAr ?? "—"}
                        </td>
                        <td className="p-2">{membership?.roleNameAr ?? "—"}</td>
                        <td className="p-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[member.status]}`}
                          >
                            {STATUS_LABELS[member.status]}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {membership
                            ? formatDate(membership.startedAt)
                            : formatDate(member.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
