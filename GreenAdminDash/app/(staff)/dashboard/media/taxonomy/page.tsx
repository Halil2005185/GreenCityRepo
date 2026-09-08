"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus } from "lucide-react";
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
import { Input, Label } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  CATALOG_LABELS,
  type CatalogSegment,
  type MediaChannel,
  createCatalogEntry,
  listMediaChannels,
  listRelationshipTypes,
  updateCatalogEntry,
} from "@/lib/api/relations";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

/**
 * الـslug يُشتق من الاسم العربي بحروف لاتينية.
 *
 * الاسم العربي وحده لا يصلح مفتاحًا: يتغيّر تحريريًا، والمفتاح يجب أن
 * يثبت. وطلبُه من المستخدم يعني حقلًا تقنيًا في نموذج يملؤه مكتب علاقات،
 * فالاشتقاق مع إمكانية التحرير أفضل من كليهما.
 */
function suggestSlug(nameAr: string, existing: readonly string[]) {
  const base =
    nameAr
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      // الحروف العربية لا تصلح في الـslug، فيبقى ما هو لاتيني وأرقام.
      .replace(/[^a-z0-9-]/g, "") || "item";

  if (!existing.includes(base)) return base;

  let index = 2;

  while (existing.includes(`${base}-${index}`)) index += 1;

  return `${base}-${index}`;
}

function CatalogPanel({
  segment,
  rows,
  isPending,
  canManage,
}: {
  segment: CatalogSegment;
  rows: MediaChannel[];
  isPending: boolean;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const labels = CATALOG_LABELS[segment];

  const [adding, setAdding] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["relations", segment] });

  const fail = (fallback: string) => (caught: unknown) =>
    setError(caught instanceof ApiError ? caught.message : fallback);

  const create = useMutation({
    mutationFn: () =>
      createCatalogEntry(segment, {
        slug: slug.trim() || suggestSlug(nameAr, rows.map((row) => row.slug)),
        nameAr: nameAr.trim(),
        displayOrder: (rows.at(-1)?.displayOrder ?? 0) + 10,
      }),
    onSuccess: () => {
      setNameAr("");
      setSlug("");
      setAdding(false);
      setError(null);
      refresh();
    },
    onError: fail("تعذّرت الإضافة."),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCatalogEntry(segment, id, { isActive }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: fail("تعذّر التحديث."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.hint}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? <Alert>{error}</Alert> : null}

        {isPending ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className={cn(!row.isActive && "text-muted-foreground")}>
                  {row.nameAr}
                  {!row.isActive ? (
                    <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      معطّل
                    </span>
                  ) : null}
                </span>

                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ms-auto h-7 px-2 text-xs"
                    loading={toggle.isPending && toggle.variables?.id === row.id}
                    onClick={() =>
                      toggle.mutate({ id: row.id, isActive: !row.isActive })
                    }
                  >
                    {row.isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          adding ? (
            <form
              className="space-y-3 rounded-md border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();

                if (nameAr.trim().length < 2) return;

                create.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${segment}-name`}>الاسم بالعربية</Label>
                <Input
                  id={`${segment}-name`}
                  value={nameAr}
                  onChange={(event) => setNameAr(event.target.value)}
                  maxLength={160}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${segment}-slug`}>المفتاح</Label>
                <Input
                  id={`${segment}-slug`}
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  dir="ltr"
                  className="text-start"
                  placeholder={
                    nameAr
                      ? suggestSlug(nameAr, rows.map((row) => row.slug))
                      : "street-interview"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  اتركه فارغًا ليُشتق تلقائيًا. لا يتغيّر بعد الحفظ.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  loading={create.isPending}
                  disabled={nameAr.trim().length < 2}
                >
                  إضافة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAdding(false)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
              {labels.singular} جديد
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function RelationsTaxonomyPage() {
  const { can } = useAuth();
  const canManage = can(CAPABILITIES.relationsTaxonomyManage);

  const channels = useQuery({
    queryKey: ["relations", "media-channels", "all"],
    queryFn: () => listMediaChannels(true),
  });

  const types = useQuery({
    queryKey: ["relations", "relationship-types", "all"],
    queryFn: () => listRelationshipTypes(true),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">مرجعيات العلاقات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            المفردات التي يُصنَّف بها الأشخاص والجهات. تُحرَّر من هنا دون تدخّل
            تقني، والتعطيل يخفيها من الاختيار ولا يمحو من صُنّف بها.
          </p>
        </div>

        <Link
          href="/dashboard/media"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← الشبكة الإعلامية
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <CatalogPanel
          segment="media-channels"
          rows={channels.data ?? []}
          isPending={channels.isPending}
          canManage={canManage}
        />
        <CatalogPanel
          segment="relationship-types"
          rows={types.data ?? []}
          isPending={types.isPending}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
