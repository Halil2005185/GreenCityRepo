import type { FieldSheet } from "./api";
import { FIELD_ROUTES } from "./config";

export type CheckinSettings = FieldSheet["checkin"];

/**
 * رمز الحضور الذاتي على هاتف القائد: رقم يتبدّل كل دقيقة، يُحسب من سرّ
 * المجموعة ومن الوقت وحدهما، فيُعرض بلا شبكة.
 *
 * الخوارزمية هي التي يتحقق بها الخادم (HOTP على SHA-256، RFC 4226 و6238):
 * عدّاده الوقت مقسومًا على مدة الرمز، ومنه أرقامه الأخيرة.
 */
function bytesOf(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

/**
 * واجهة التشفير تعمل على اتصال آمن وحده. في الإنتاج هو HTTPS دائمًا؛ وعلى
 * عنوان شبكة محلية بلا شهادة تغيب، فيُقال ذلك بدل رمز خاطئ.
 */
export function canComputeCodes() {
  return typeof crypto !== "undefined" && crypto.subtle !== undefined;
}

export async function oneTimeCode(
  key: Uint8Array<ArrayBuffer>,
  counter: number,
  digits: number,
) {
  const message = new ArrayBuffer(8);

  new DataView(message).setBigUint64(0, BigInt(counter));

  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, message),
  );
  const offset = digest[digest.length - 1]! & 0x0f;
  // الضرب لا الإزاحة في البايت الأعلى: الإزاحة تعطي عددًا سالبًا فوق 2^31.
  const value =
    (digest[offset]! & 0x7f) * 0x1000000 +
    (digest[offset + 1]! << 16) +
    (digest[offset + 2]! << 8) +
    digest[offset + 3]!;

  return String(value % 10 ** digits).padStart(digits, "0");
}

export function checkinCode(settings: CheckinSettings, moment = Date.now()) {
  return oneTimeCode(
    bytesOf(settings.secret),
    Math.floor(moment / 1000 / settings.periodSeconds),
    settings.digits,
  );
}

/** كم ثانية بقيت لهذا الرمز قبل أن يتبدّل. */
export function secondsLeft(settings: CheckinSettings, moment = Date.now()) {
  const elapsed = Math.floor(moment / 1000) % settings.periodSeconds;

  return settings.periodSeconds - elapsed;
}

/**
 * ما يحمله الرمز المربّع: عنوان صفحة في التطبيق، والمجموعة ورمزها في **جزء
 * العنوان**. كاميرا الهاتف تفتحه في المتصفح، فيُسجَّل الحضور من بطاقة
 * صاحبه المحفوظة فيه.
 */
export function checkinUrl(groupId: string, code: string) {
  return `${window.location.origin}${FIELD_ROUTES.checkin}#${groupId}.${code}`;
}

const FRAGMENT =
  /^#?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9]{6})$/i;

export function readCheckinFragment(hash: string) {
  const match = FRAGMENT.exec(hash);

  return match ? { groupId: match[1]!.toLowerCase(), code: match[2]! } : null;
}
