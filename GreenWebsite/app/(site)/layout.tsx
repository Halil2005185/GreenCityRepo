import { SiteShell } from "@/components/layout/site-shell";

/**
 * مجموعة الموقع: كل ما يتصفّحه الزائر داخل القشرة.
 *
 * الفصل عن `(form)` مقصود وبنيوي لا استثناء يُنسى — الشرح في `SiteShell`.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}
