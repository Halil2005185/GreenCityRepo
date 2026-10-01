import { redirect } from "next/navigation";

/**
 * «الإعدادات» قسم واحد اليوم: تعريفات النظام. الرابط يبقى للقسم كله كي
 * لا يتغيّر عنوان القائمة الجانبية حين تُضاف إليه أقسام أخرى.
 */
export default function SettingsPage() {
  redirect("/dashboard/settings/lookups");
}
