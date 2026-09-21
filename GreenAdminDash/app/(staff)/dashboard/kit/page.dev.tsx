import { KitShowcase } from "./kit-showcase";

export const metadata = { title: "مكتبة المكوّنات" };

/**
 * صفحة عرض المكوّنات بكل حالاتها. امتداد `.dev.tsx` يجعلها صفحة في
 * التطوير وحده (انظر `pageExtensions` في `next.config.ts`)، وليست في
 * قائمة التنقل.
 */
export default function KitPage() {
  return <KitShowcase />;
}
