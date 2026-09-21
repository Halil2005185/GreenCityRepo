import { redirect } from "next/navigation";

/**
 * الإنشاء صار نافذة في صفحة القائمة. الرابط القديم يبقى صالحًا لمن حفظه
 * ويفتح النافذة نفسها.
 */
export default function NewInitiativeRedirect() {
  redirect("/dashboard/initiatives?new=1");
}
