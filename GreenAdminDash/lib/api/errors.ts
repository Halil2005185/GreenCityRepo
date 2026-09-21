import { ApiError } from "./client";

export const NETWORK_ERROR_MESSAGE = "تعذّر الاتصال بالخادم. حاول مجددًا.";

/**
 * نص الخطأ الذي يُعرض للمستخدم: رسالة الخادم حين يرسلها — وهي بالعربية
 * ومحددة («المعرّف مستعمل») — وإلا رسالة عامة تخص العملية.
 */
export function errorMessage(error: unknown, fallback = NETWORK_ERROR_MESSAGE) {
  return error instanceof ApiError ? error.message : fallback;
}
