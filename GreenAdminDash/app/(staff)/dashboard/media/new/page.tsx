import { redirect } from "next/navigation";

/**
 * الإضافة صارت نافذة في صفحة القائمة. الرابط القديم يبقى صالحًا لمن حفظه
 * ويفتح النافذة نفسها.
 */
export default function NewMediaContactRedirect() {
  redirect("/dashboard/media?new=1");
}
