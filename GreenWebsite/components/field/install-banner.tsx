"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/field/button";
import { FIELD_APP_NAME } from "@/lib/field/config";
import { useDisplayMode } from "@/lib/field/display-mode";

/** حدث Chromium الذي يؤجَّل ليُستدعى من زر؛ لا نوع له في مكتبة DOM. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "other";

const DISMISSED_KEY = "gc-field-install-dismissed";
const DISMISS_DAYS = 7;

let deferredPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

/**
 * الحدث يُطلَق مرة عند تحميل الصفحة، وقد يسبق تركيب اللافتة. يُلتقط هنا عند
 * تحميل الملف ويُحفظ، فتجده اللافتة متى رُكّبت.
 */
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    for (const listener of promptListeners) listener();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    for (const listener of promptListeners) listener();
  });
}

function subscribePrompt(onChange: () => void) {
  promptListeners.add(onChange);

  return () => {
    promptListeners.delete(onChange);
  };
}

const noSubscription = () => () => {};

function detectPlatform(): Platform {
  const agent = navigator.userAgent;

  // iPadOS يعرّف نفسه حاسوبَ Mac؛ اللمس المتعدد هو ما يفرّقه.
  const isIos =
    /iPad|iPhone|iPod/.test(agent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIos) return "ios";

  return /Android/.test(agent) ? "android" : "other";
}

function wasDismissedRecently() {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0);

    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * دعوة التثبيت، في وضع المتصفح وحده.
 *
 * الوظائف كلها متاحة في المتصفح — قائد نسي التثبيت لا يُعطَّل يوم الحملة —
 * لكن العمل بلا شبكة والدخول من الأيقونة أفضل في التطبيق، فاللافتة تبقى
 * حتى يثبّت أو يصرفها. وتعود بعد أسبوع: من صرفها على عجل يُذكَّر مرة.
 *
 * التعليمات بحسب المنصة لأن التثبيت نفسه يختلف: Chrome يعرض نافذته بزر،
 * وSafari على iOS لا يملك إلا قائمة المشاركة.
 */
export function InstallBanner() {
  const mode = useDisplayMode();
  const platform = useSyncExternalStore<Platform | null>(
    noSubscription,
    detectPlatform,
    () => null,
  );
  const prompt = useSyncExternalStore(
    subscribePrompt,
    () => deferredPrompt,
    () => null,
  );
  const dismissedBefore = useSyncExternalStore(
    noSubscription,
    wasDismissedRecently,
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);

  if (mode === "standalone" || !platform || dismissed || dismissedBefore) {
    return null;
  }

  function dismiss() {
    setDismissed(true);

    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // مخزن محجوب: تعود اللافتة في الفتح التالي، وهذا مقبول.
    }
  }

  async function install() {
    if (!prompt) return;

    await prompt.prompt();

    // الحدث يُستعمل مرة واحدة، قبِل المستخدم أو رفض.
    deferredPrompt = null;
    for (const listener of promptListeners) listener();
  }

  return (
    <aside
      aria-label="تثبيت التطبيق"
      className="app:hidden border-b border-border bg-surface"
    >
      <div className="mx-auto flex w-full max-w-[30rem] items-start gap-3 px-4 py-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-ink/10 text-accent-ink">
          <Download className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            ثبّت «{FIELD_APP_NAME}» على هاتفك
          </p>

          {prompt ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                يُفتح من أيقونته ويعمل حين تضعف الشبكة في الموقع.
              </p>
              <Button size="sm" onClick={() => void install()}>
                تثبيت التطبيق
              </Button>
            </>
          ) : platform === "ios" ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              في Safari: اضغط زر المشاركة{" "}
              <Share className="inline size-3.5 align-text-bottom" aria-hidden />{" "}
              ثم «إضافة إلى الشاشة الرئيسية»{" "}
              <SquarePlus
                className="inline size-3.5 align-text-bottom"
                aria-hidden
              />
              .
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              من قائمة المتصفح (⋮) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة
              الرئيسية».
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء دعوة التثبيت"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
