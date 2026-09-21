"use client";

import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * تبويبات بخط سفلي تبدأ من جهة البداية. تُربط بعنوان الصفحة عبر
 * `UrlTabs` في `url-tabs.tsx`؛ هذا الملف هو الشكل وحده.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // التمرير الأفقي حين تزيد التبويبات عن عرض الجوال، بلا شريط ظاهر.
        "flex w-full items-end gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "data-active:border-primary data-active:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("pt-5 outline-none", className)}
      {...props}
    />
  );
}
