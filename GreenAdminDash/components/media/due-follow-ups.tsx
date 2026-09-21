"use client";

import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useMediaCache } from "@/components/media/media-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import {
  INTERACTION_KIND_LABELS,
  listFollowUps,
  setFollowUpCompletion,
  type MediaFollowUp,
} from "@/lib/api/media";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { cn, formatDate } from "@/lib/utils";

/** الأقدم ثلاث: تكفي لبدء اليوم، ولا تدفع الجدول إلى ما تحت الطيّة. */
const PREVIEW = 3;

/**
 * المتابعات المستحقة أعلى الشاشة لا خلف نقرة: هي السبب الذي يفتح لأجله
 * مكتب العلاقات هذه الشاشة صباحًا، ودفنها يجعلها تُنسى كما في دفتر الورق.
 *
 * كانت تتوقف عند ستة بلا طريق إلى البقية؛ صارت الأقدم ظاهرة وزر يعرض
 * الباقي في مكانه، ولكل واحدة زر يغلقها دون فتح ملف صاحبها.
 */
export function DueFollowUps() {
  const { can } = useAuth();
  const apply = useMediaCache();
  const [expanded, setExpanded] = useState(false);

  const followUps = useQuery({
    queryKey: ["media", "follow-ups"],
    queryFn: () => listFollowUps(),
  });

  const close = useApiMutation({
    mutationFn: (item: MediaFollowUp) => setFollowUpCompletion(item.contactId, item.id, true),
    successMessage: (_, item) => `أُغلقت متابعة «${item.contactNameAr}».`,
    errorFallback: "تعذّر إغلاق المتابعة.",
    onSuccess: apply,
  });

  const rows = followUps.data ?? [];

  // لوحة مساعدة فوق الجدول: لا مكان لها وهي فارغة، وفشل تحميلها لا يستحق
  // أن يزاحم الجدول نفسه برسالة خطأ.
  if (rows.length === 0) return null;

  const shown = expanded ? rows : rows.slice(0, PREVIEW);
  const canManage = can(CAPABILITIES.mediaManage);

  return (
    <Section
      id="due-follow-ups"
      title={
        <span className="flex items-center gap-2">
          متابعات مستحقة
          <Badge tone="warning">
            <span className="numeric">{rows.length}</span>
          </Badge>
        </span>
      }
      description="ما حان موعده ولم يُغلق بعد، الأقدم أولًا."
    >
      <ul
        id="due-follow-ups-list"
        className="divide-y divide-border rounded-xl border border-warning/40 bg-card text-card-foreground"
      >
        {shown.map((item) => {
          const pending = close.isPendingFor((variables) => variables.id === item.id);

          return (
            // شبكة لا صف مرن: على الجوال يهبط الموعد تحت الخلاصة ويبقى الزر
            // أيقونة في جهة النهاية، وعلى الشاشة الواسعة سطر واحد.
            <li
              key={item.id}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm sm:grid-cols-[1fr_auto_auto]"
            >
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/dashboard/media/${item.contactId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {item.contactNameAr}
                </Link>
                <span className="min-w-0 text-muted-foreground">
                  {INTERACTION_KIND_LABELS[item.kind]}: {item.summaryAr}
                </span>
              </p>
              <span
                className={cn(
                  "col-start-1 row-start-2 text-xs sm:col-start-2 sm:row-start-1",
                  item.isOverdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {item.isOverdue ? "فات موعدها" : "تستحق"} {formatDate(item.dueAt)}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={pending}
                  onClick={() => close.mutate(item)}
                  className="col-start-2 row-span-2 row-start-1 max-sm:size-8 max-sm:px-0 sm:col-start-3 sm:row-span-1"
                >
                  {pending ? null : <Check aria-hidden />}
                  {/* نص الزر للقارئ الآلي دائمًا، وللعين على الشاشة الواسعة. */}
                  <span className="max-sm:sr-only">إغلاق المتابعة</span>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {rows.length > PREVIEW ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls="due-follow-ups-list"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "عرض الأقدم فقط" : `عرض كل المتابعات (${rows.length})`}
        </Button>
      ) : null}
    </Section>
  );
}
