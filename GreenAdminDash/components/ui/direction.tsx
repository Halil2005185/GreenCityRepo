"use client";

import { Direction } from "radix-ui";

/**
 * يخبر مكوّنات Radix باتجاه الصفحة: القوائم وأسهم لوحة المفاتيح والتبويبات
 * تقرؤه منه لا من `dir` على عنصر html.
 */
export function DirectionProvider({
  dir,
  children,
}: {
  dir: "rtl" | "ltr";
  children: React.ReactNode;
}) {
  return (
    <Direction.DirectionProvider dir={dir}>{children}</Direction.DirectionProvider>
  );
}

export const useDirection = Direction.useDirection;
