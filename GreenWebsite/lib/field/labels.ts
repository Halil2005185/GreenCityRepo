import type { FieldTask } from "./api";

/**
 * تسميات حالات المهمة كما تُقرأ في الميدان. الحالات عقد يفحصه الخادم،
 * ونصّها العربي قرار تحريري يعيش في الواجهة — كما في اللوحة.
 */
export const TASK_STATUS_LABELS: Record<FieldTask["status"], string> = {
  TODO: "لم تبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  BLOCKED: "متعثّرة",
  IN_REVIEW: "بانتظار الاعتماد",
  DONE: "منجزة",
  CANCELLED: "ملغاة",
};

export const TASK_STATUS_TONES: Record<
  FieldTask["status"],
  "primary" | "success" | "muted" | "warning"
> = {
  TODO: "muted",
  IN_PROGRESS: "primary",
  BLOCKED: "warning",
  IN_REVIEW: "muted",
  DONE: "success",
  CANCELLED: "muted",
};

const TIME_ZONE = "Asia/Damascus";

/**
 * «الجمعة، 9 تشرين الأول» — اليوم باسمه، فهو ما يُسأل عنه قبل الحملة.
 * والأرقام لاتينية كبقية أرقام التطبيق: يوم وساعة في سطر واحد لا يُكتبان
 * بنظامين.
 */
export function formatDay(value: string | Date) {
  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/** الساعة بأرقام لاتينية كبقية الأرقام، وبنظام 12 ساعة كما يُقال الموعد. */
export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/** «قبل 5 دقائق» — عمر ما على الشاشة حين يُقرأ من المحفوظ بلا شبكة. */
export function formatAge(value: string | Date, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const relative = new Intl.RelativeTimeFormat("ar-u-nu-latn", {
    numeric: "auto",
  });

  const minutes = Math.round(seconds / 60);

  if (Math.abs(minutes) < 1) return "الآن";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) return relative.format(hours, "hour");

  return relative.format(Math.round(hours / 24), "day");
}
