import { redirect } from "next/navigation";

/**
 * التسجيل صار نافذة في صفحة القائمة. الرابط القديم يبقى صالحًا لمن حفظه
 * ويفتح النافذة نفسها.
 */
export default function NewPartnerRedirect() {
  redirect("/dashboard/partners?new=1");
}
