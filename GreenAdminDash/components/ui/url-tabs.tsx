"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/lib/hooks/use-url-state";

export type UrlTab = {
  value: string;
  label: string;
  count?: number;
  content: React.ReactNode;
  hidden?: boolean;
};

/**
 * تبويبات مربوطة بعنوان الصفحة (`?tab=`): الرجوع من صفحة أخرى يعيد
 * التبويب نفسه، والرابط المنسوخ يفتح عليه. المحتوى يُركَّب حين يُفتح
 * تبويبه وحده، فلا تُجلب بيانات تبويب لم يُنظر إليه.
 */
export function UrlTabs({
  tabs,
  param = "tab",
  label,
}: {
  tabs: readonly UrlTab[];
  param?: string;
  label: string;
}) {
  const shown = tabs.filter((tab) => !tab.hidden);
  const fallback = shown[0]?.value ?? "";
  const [state, setState] = useUrlState({ [param]: fallback });
  const active = shown.some((tab) => tab.value === state[param]) ? state[param] : fallback;

  return (
    <Tabs value={active} onValueChange={(value) => setState({ [param]: value })}>
      <TabsList aria-label={label}>
        {shown.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {tab.count !== undefined ? (
              <span className="numeric rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                {tab.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {shown.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
