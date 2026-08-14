"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  ROLLUP_LABELS,
  type TargetRollup,
  createInitiative,
  listPrograms,
} from "@/lib/api/initiatives";

export default function NewInitiativePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState("");

  const programs = useQuery({ queryKey: ["programs"], queryFn: listPrograms });
  const selected = programs.data?.find((program) => program.id === programId);

  const create = useMutation({
    mutationFn: createInitiative,
    onSuccess: (initiative) =>
      router.replace(`/dashboard/initiatives/${initiative.id}`),
    onError: (caught) =>
      setError(
        caught instanceof ApiError
          ? caught.message
          : "تعذّر إنشاء المبادرة. حاول مجددًا.",
      ),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">مبادرة جديدة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تبدأ كمسودة. مراحل البرنامج ومهامه تُنسخ تلقائيًا عند الإنشاء.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>بيانات المبادرة</CardTitle>
          <CardDescription>
            المواقع والأهداف تُضاف من صفحتها بعد الإنشاء.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const rollup = String(form.get("targetRollup") ?? "");

              create.mutate({
                programId,
                nameAr: String(form.get("nameAr") ?? ""),
                ...(form.get("season")
                  ? { season: String(form.get("season")) }
                  : {}),
                ...(form.get("summaryAr")
                  ? { summaryAr: String(form.get("summaryAr")) }
                  : {}),
                ...(form.get("startsAt")
                  ? {
                      startsAt: new Date(
                        String(form.get("startsAt")),
                      ).toISOString(),
                    }
                  : {}),
                ...(rollup ? { targetRollup: rollup as TargetRollup } : {}),
              });
            }}
          >
            {error ? <Alert>{error}</Alert> : null}

            <div className="space-y-1.5">
              <Label htmlFor="programId">البرنامج</Label>
              <select
                id="programId"
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">اختر البرنامج…</option>
                {programs.data?.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.nameAr}
                    {program.templateCount > 0
                      ? ` — ${program.templateCount} قالب جاهز`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            <Field id="nameAr" label="اسم المبادرة">
              {(props) => <Input {...props} name="nameAr" required />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="season" label="الموسم" hint="نص حر مثل «موسم التشجير 2026».">
                {(props) => <Input {...props} name="season" />}
              </Field>

              <Field
                id="startsAt"
                label="تاريخ البدء"
                hint="مواعيد المهام المولّدة من القالب تُحسب منه."
              >
                {(props) => <Input {...props} name="startsAt" type="date" />}
              </Field>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="targetRollup">سياسة مطابقة الأهداف</Label>
              <select
                id="targetRollup"
                name="targetRollup"
                defaultValue=""
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">
                  {selected
                    ? `افتراضي البرنامج — ${ROLLUP_LABELS[selected.defaultTargetRollup]}`
                    : "افتراضي البرنامج"}
                </option>
                {(Object.keys(ROLLUP_LABELS) as TargetRollup[]).map((value) => (
                  <option key={value} value={value}>
                    {ROLLUP_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                تُنسخ من البرنامج ثم تستقل — مبادرتان تحت برنامج واحد قد
                تختلفان.
              </p>
            </div>

            <Field id="summaryAr" label="نبذة">
              {(props) => (
                <textarea
                  {...props}
                  name="summaryAr"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            <div className="flex gap-2">
              <Button type="submit" loading={create.isPending} disabled={!programId}>
                إنشاء المبادرة
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
