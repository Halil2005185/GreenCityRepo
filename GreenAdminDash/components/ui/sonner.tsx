"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner } from "sonner";

import { useDirection } from "@/components/ui/direction";

/**
 * الإشعارات في أسفل جهة النهاية، حيث تقع الأفعال التي تُبلغ عن نتيجتها.
 *
 * sonner لا يعرف إلا جهات فيزيائية، فتُشتق الجهة من اتجاه الصفحة بدل
 * تثبيت «يسار»: لو تغيّر الاتجاه يومًا انتقلت الإشعارات وحدها.
 */
export function Toaster() {
  const dir = useDirection();

  return (
    <Sonner
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      theme="light"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          fontFamily: "inherit",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans text-sm",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
