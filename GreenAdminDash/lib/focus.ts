/**
 * إعادة التركيز إلى زر الفتح بعد إغلاق نافذة.
 *
 * Radix يعيده إلى `Trigger` حين يوجد، لكن نوافذ اللوحة تُفتح بالحالة: من
 * قائمة «⋯» أو من زر في صف أو من دالة `useConfirm()`. بلا هذا يسقط التركيز
 * على `body` بعد الإغلاق، فيبدأ مستخدم لوحة المفاتيح من أول الصفحة.
 *
 * عنصر القائمة يختفي مع إغلاقها، فحين يأتي الفتح من قائمة يُعاد التركيز
 * إلى زر «⋯» الذي فتحها — تسجّله `ActionMenu` لحظة الاختيار.
 */
let lastMenuInvoker: HTMLElement | null = null;

export function rememberMenuInvoker(element: HTMLElement | null) {
  lastMenuInvoker = element;
}

/** يُستدعى لحظة فتح النافذة، قبل أن ينتقل التركيز إلى داخلها. */
export function captureInvoker(): HTMLElement | null {
  const active =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (active?.closest("[role='menu']")) {
    return lastMenuInvoker?.isConnected ? lastMenuInvoker : null;
  }

  return active && active !== document.body ? active : null;
}

export function restoreFocus(element: HTMLElement | null) {
  if (element?.isConnected) element.focus();
}
