"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  createCharterVersion,
  listCharterVersions,
  publishCharterVersion,
} from "@/lib/api/partners";
import { formatDateTime } from "@/lib/utils";

/** سطر لكل مبدأ أو التزام — أبسط مدخل لقائمة نصية قصيرة. */
function linesOf(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const charterFormSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1, "رقم الإصدار مطلوب.")
    .max(20, "رقم الإصدار طويل جدًا."),
  titleAr: z
    .string()
    .trim()
    .min(3, "العنوان يجب ألا يقل عن 3 أحرف.")
    .max(200, "العنوان طويل جدًا."),
  bodyAr: z
    .string()
    .trim()
    .min(20, "نص الميثاق يجب ألا يقل عن 20 حرفًا."),
  principlesAr: z.array(z.string()).refine(
    (lines) => lines.every((l) => l.trim().length >= 3),
    "كل مبدأ يجب ألا يقل عن 3 أحرف.",
  ),
  commitmentsAr: z.array(z.string()).refine(
    (lines) => lines.every((l) => l.trim().length >= 3),
    "كل التزام يجب ألا يقل عن 3 أحرف.",
  ),
});

export default function CharterPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [charterErrors, setCharterErrors] = useState<Record<string, string>>({});

  const versions = useQuery({
    queryKey: ["charter-versions"],
    queryFn: listCharterVersions,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["charter-versions"] });
    setError(null);
    setCharterErrors({});
  }

  function onFailed(caught: unknown) {
    setError(
      caught instanceof ApiError
        ? caught.message
        : "تعذّر تنفيذ الإجراء. حاول مجددًا.",
    );
  }

  const create = useMutation({
    mutationFn: createCharterVersion,
    onSuccess: invalidate,
    onError: onFailed,
  });

  const publish = useMutation({
    mutationFn: publishCharterVersion,
    onSuccess: invalidate,
    onError: onFailed,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">الميثاق</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الإقرارات تشير إلى إصدار محدد. المنشور لا يُعدَّل — التغيير يكون
          بإصدار جديد يحل محله دون أن يمحوه.
        </p>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>الإصدارات</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : versions.isError ? (
            <Alert>تعذّر تحميل الإصدارات.</Alert>
          ) : versions.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد إصدارات. أنشئ الإصدار الأول لتتمكن من تسجيل الإقرارات.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.data.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {version.titleAr}
                      <span className="ms-2 text-sm text-muted-foreground">
                        الإصدار {version.version}
                      </span>
                      {version.isCurrent ? (
                        <span className="ms-2 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">
                          الساري
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {version.publishedAt
                        ? `نُشر في ${formatDateTime(version.publishedAt)}`
                        : "مسودة غير منشورة"}
                      {" · "}
                      {version.principlesAr.length} مبادئ ·{" "}
                      {version.commitmentsAr.length} التزامات
                    </p>
                  </div>

                  {!version.publishedAt ? (
                    <Button
                      size="sm"
                      loading={
                        publish.isPending && publish.variables === version.id
                      }
                      onClick={() => publish.mutate(version.id)}
                    >
                      نشر
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إصدار جديد</CardTitle>
          <CardDescription>
            يُنشأ كمسودة. لا يصبح مرجعًا للإقرارات حتى يُنشر.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              setCharterErrors({});
              const form = new FormData(event.currentTarget);

              const raw = {
                version: String(form.get("version") ?? ""),
                titleAr: String(form.get("titleAr") ?? ""),
                bodyAr: String(form.get("bodyAr") ?? ""),
                principlesAr: linesOf(form.get("principlesAr")),
                commitmentsAr: linesOf(form.get("commitmentsAr")),
              };

              const parsed = charterFormSchema.safeParse(raw);
              if (!parsed.success) {
                const issues: Record<string, string> = {};
                for (const issue of parsed.error.issues) {
                  const key = String(issue.path[0] ?? "");
                  if (key && !issues[key]) issues[key] = issue.message;
                }
                setCharterErrors(issues);
                return;
              }

              create.mutate(parsed.data);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="version" label="رقم الإصدار" error={charterErrors.version}>
                {(props) => (
                  <Input
                    {...props}
                    name="version"
                    placeholder="1.0"
                    dir="ltr"
                    className="text-start"
                    required
                  />
                )}
              </Field>

              <Field id="titleAr" label="العنوان" error={charterErrors.titleAr}>
                {(props) => (
                  <Input
                    {...props}
                    name="titleAr"
                    defaultValue="ميثاق المدن الخضراء"
                    required
                  />
                )}
              </Field>
            </div>

            <Field id="bodyAr" label="نص الميثاق" error={charterErrors.bodyAr}>
              {(props) => (
                <textarea
                  {...props}
                  name="bodyAr"
                  rows={5}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            <Field
              id="principlesAr"
              label="المبادئ"
              hint="مبدأ في كل سطر."
              error={charterErrors.principlesAr}
            >
              {(props) => (
                <textarea
                  {...props}
                  name="principlesAr"
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            <Field
              id="commitmentsAr"
              label="التزامات الشركاء"
              hint="التزام في كل سطر."
              error={charterErrors.commitmentsAr}
            >
              {(props) => (
                <textarea
                  {...props}
                  name="commitmentsAr"
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            <Button type="submit" loading={create.isPending}>
              حفظ كمسودة
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
