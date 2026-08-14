"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Settings2, Sprout, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  INITIATIVE_STATUS_LABELS,
  type InitiativeDetail,
  getInitiative,
  updateInitiativeStory,
} from "@/lib/api/initiatives";
import { CONTRIBUTOR_KIND_LABELS, POINT_KIND_LABELS } from "@/lib/api/map";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * صفحة المبادرة كما تُقرأ، لا كما تُدار.
 *
 * القادم من الخريطة يريد القصة والأرقام لا أزرار التشغيل، والنقطة
 * الخضراء لا إدارة لها أصلًا. الإدارة تعيش في `/manage` ويصل إليها من
 * يملك صلاحيتها وحده.
 */
export default function InitiativeStoryPage() {
  const params = useParams<{ id: string }>();
  const initiativeId = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiative = useQuery({
    queryKey: ["initiative", initiativeId],
    queryFn: () => getInitiative(initiativeId),
  });

  const save = useMutation({
    mutationFn: (body: { storyAr?: string; coverImageUrl?: string }) =>
      updateInitiativeStory(initiativeId, body),
    onSuccess: (updated: InitiativeDetail) => {
      queryClient.setQueryData(["initiative", initiativeId], updated);
      setEditing(false);
      setError(null);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : "تعذّر الحفظ. حاول مجددًا.",
      ),
  });

  if (initiative.isPending) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (initiative.isError || !initiative.data) {
    return <Alert>تعذّر تحميل المبادرة.</Alert>;
  }

  const data = initiative.data;
  const isGreenPoint = data.kind === "GREEN_POINT";
  const canManage = can(CAPABILITIES.initiativesManage);
  const counted = data.progress.filter((row) => row.actual > 0);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      {error ? <Alert>{error}</Alert> : null}

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-medium",
              isGreenPoint
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                : "bg-primary/10 text-primary",
            )}
          >
            {POINT_KIND_LABELS[data.kind]}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
            {INITIATIVE_STATUS_LABELS[data.status]}
          </span>
          <span className="text-muted-foreground">{data.programNameAr}</span>
        </div>

        <h1 className="text-3xl font-bold leading-tight">{data.nameAr}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {data.contributorNameAr ? (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-4" />
              {data.contributorNameAr}
              {data.contributorKind
                ? ` · ${CONTRIBUTOR_KIND_LABELS[data.contributorKind]}`
                : ""}
            </span>
          ) : null}

          {data.areas.length > 0 || data.sites.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {data.areas[0]?.areaNameAr ??
                data.sites[0]?.areaNameAr ??
                data.sites[0]?.nameAr}
            </span>
          ) : null}

          {data.startsAt ? <span>{formatDateTime(data.startsAt)}</span> : null}
        </div>
      </header>

      {data.coverImageUrl ? (
        // صورة خارجية بلا معالجة: رفع الملفات لم يُبنَ بعد، فلا مجال
        // لتحسينها. تُستبدل بمكوّن الصورة عند وصل التخزين.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.coverImageUrl}
          alt={data.nameAr}
          className="w-full rounded-xl border border-border object-cover"
        />
      ) : null}

      {counted.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {counted.map((row) => (
            <Card key={row.metricId}>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">
                  {row.actual.toLocaleString("ar-SY")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.metricNameAr} ({row.unitAr})
                  {row.initiativeTarget !== null
                    ? ` · الهدف ${row.initiativeTarget.toLocaleString("ar-SY")}`
                    : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {data.summaryAr ? (
        <p className="text-lg leading-relaxed text-muted-foreground">
          {data.summaryAr}
        </p>
      ) : null}

      {editing ? (
        <Card>
          <CardContent className="p-4">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                save.mutate({
                  storyAr: String(form.get("storyAr") ?? ""),
                  coverImageUrl: String(form.get("coverImageUrl") ?? ""),
                });
              }}
            >
              <Field
                id="coverImageUrl"
                label="رابط صورة الغلاف"
                hint="مؤقت حتى يُبنى رفع الملفات."
              >
                {(props) => (
                  <Input
                    {...props}
                    name="coverImageUrl"
                    type="url"
                    dir="ltr"
                    className="text-start"
                    defaultValue={data.coverImageUrl ?? ""}
                  />
                )}
              </Field>

              <Field id="storyAr" label="التفاصيل">
                {(props) => (
                  <textarea
                    {...props}
                    name="storyAr"
                    rows={10}
                    defaultValue={data.storyAr ?? ""}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
                  />
                )}
              </Field>

              <div className="flex gap-2">
                <Button type="submit" loading={save.isPending}>
                  حفظ
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : data.storyAr ? (
        // الفقرات مفصولة بسطر فارغ — أبسط ما يكفي قبل محرّر نصوص.
        <div className="space-y-4 text-base leading-loose">
          {data.storyAr.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          لا تفاصيل مكتوبة بعد.
        </p>
      )}

      {!isGreenPoint && data.sites.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">مواقع التنفيذ</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.sites.map((site) => (
              <li
                key={site.id}
                className="rounded-md border border-border p-3 text-sm"
              >
                <p className="font-medium">{site.nameAr}</p>
                <p className="text-xs text-muted-foreground">
                  {site.areaNameAr ?? "—"}
                  {site.targets.length > 0
                    ? ` · ${site.targets
                        .map((target) => `${target.value} ${target.unitAr}`)
                        .join("، ")}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Link
          href="/dashboard/map"
          className={buttonVariants({ variant: "outline", className: "gap-2" })}
        >
          <MapPin className="size-4" />
          على الخريطة
        </Link>

        {canManage ? (
          <>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil className="size-4" />
              تحرير التفاصيل
            </Button>

            {!isGreenPoint ? (
              <Link
                href={`/dashboard/initiatives/${initiativeId}/manage`}
                className={buttonVariants({
                  variant: "outline",
                  className: "gap-2",
                })}
              >
                <Settings2 className="size-4" />
                إدارة المبادرة
              </Link>
            ) : null}
          </>
        ) : null}

        <Link
          href="/dashboard/initiatives"
          className={buttonVariants({ variant: "ghost", className: "gap-2" })}
        >
          <Sprout className="size-4" />
          كل المبادرات
        </Link>
      </footer>
    </article>
  );
}
