import { type FieldPushKey, OfflineError, fieldFetch } from "./api";
import { FIELD_SCOPE } from "./config";

/**
 * حال الإشعارات على هذا الجهاز، كما تُقال لصاحبه.
 *
 * - `unsupported`: المتصفح لا يعرف الإشعارات، أو لا عامل خدمة (بناء التطوير).
 * - `needs-install`: iPhone في متصفحه — الإشعارات هناك للتطبيق المثبَّت وحده.
 * - `disabled`: الخادم بلا مفاتيح؛ لا شيء يُشترك فيه.
 * - `denied`: صاحب الجهاز منعها، ولا يعيدها إلا هو من إعدادات متصفحه.
 */
export type PushState =
  | "unsupported"
  | "needs-install"
  | "disabled"
  | "denied"
  | "off"
  | "on";

function isApple() {
  const agent = navigator.userAgent;

  // iPadOS يعرّف نفسه حاسوبًا؛ اللمس هو ما يفرّقه عن Mac.
  return (
    /iPad|iPhone|iPod/.test(agent) ||
    (agent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

const supported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** بلا عامل خدمة مسجَّل لا اشتراك؛ و`ready` لا يعود أبدًا إن لم يُسجَّل. */
async function registration() {
  return (await navigator.serviceWorker.getRegistration(FIELD_SCOPE)) ?? null;
}

function keyBytes(key: string) {
  const padded = key + "=".repeat((4 - (key.length % 4)) % 4);
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** هل اشترك المتصفح بالمفتاح الذي يوقّع به الخادم اليوم؟ */
function signedWith(subscription: PushSubscription, key: string) {
  const current = subscription.options.applicationServerKey;

  if (!current) return false;

  const left = new Uint8Array(current);
  const right = keyBytes(key);

  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

const register = (subscription: PushSubscription) =>
  fieldFetch<{ subscribed: boolean }>("/field/push/subscriptions", {
    method: "POST",
    body: subscription.toJSON(),
  });

export async function readPushState(): Promise<PushState> {
  if (!supported()) {
    return isApple() && !isInstalled() ? "needs-install" : "unsupported";
  }

  const worker = await registration();

  if (!worker) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const subscription = await worker.pushManager.getSubscription();

  try {
    const key = await fieldFetch<FieldPushKey>("/field/push/key");

    if (!key.enabled || !key.publicKey) return "disabled";

    return subscription && signedWith(subscription, key.publicKey)
      ? "on"
      : "off";
  } catch (error) {
    // بلا شبكة يُقال ما عند المتصفح؛ والتحقق من المفتاح عند أول اتصال.
    if (error instanceof OfflineError) return subscription ? "on" : "off";

    throw error;
  }
}

/**
 * يفعّل الإشعارات. يُستدعى من نقرة: المتصفح لا يعرض طلب الإذن إلا جوابًا
 * لفعلٍ من صاحب الجهاز.
 */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return readPushState();

  const worker = await registration();

  if (!worker) return "unsupported";

  const key = await fieldFetch<FieldPushKey>("/field/push/key");

  if (!key.enabled || !key.publicKey) return "disabled";

  const permission = await Notification.requestPermission();

  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  let subscription = await worker.pushManager.getSubscription();

  // اشتراك بمفتاح سابق لا يوقّع له الخادم: يُستبدل.
  if (subscription && !signedWith(subscription, key.publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key.publicKey),
  });

  await register(subscription);

  return "on";
}

/**
 * يوقف الإشعارات على هذا الجهاز. الخادم أولًا ما دام يعرف صاحب الطلب؛ وإن
 * تعذّر الوصول إليه يكفي إلغاء المتصفح: خدمة الإشعار تردّ بعدها بأن الاشتراك
 * زال، فيحذفه الخادم عند أول إرسال.
 */
export async function disablePush() {
  if (!supported()) return;

  const worker = await registration();
  const subscription = await worker?.pushManager.getSubscription();

  if (!subscription) return;

  await fieldFetch("/field/push/subscriptions/remove", {
    method: "POST",
    body: { endpoint: subscription.endpoint },
  }).catch(() => undefined);

  await subscription.unsubscribe();
}

/**
 * عند كل فتح: ما عند المتصفح يُعاد تسجيله باسم صاحب الجلسة الآن. به يتبع
 * الإشعار من دخل آخرًا، ويعود اشتراك من جُدّد رابطه بلا أن يُسأل ثانية.
 *
 * بلا نقرة، فلا يطلب إذنًا: يعمل فقط حين أُذن من قبل.
 */
export async function syncPush() {
  if (!supported() || Notification.permission !== "granted") return;

  const worker = await registration();
  const subscription = await worker?.pushManager.getSubscription();

  if (!worker || !subscription) return;

  const key = await fieldFetch<FieldPushKey>("/field/push/key");

  if (!key.enabled || !key.publicKey) return;

  if (signedWith(subscription, key.publicKey)) {
    await register(subscription);

    return;
  }

  // دُوّر مفتاح الخادم: الاشتراك القديم لا يصله شيء، فيُجدَّد بالمفتاح الجديد.
  await subscription.unsubscribe();
  await register(
    await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key.publicKey),
    }),
  );
}
