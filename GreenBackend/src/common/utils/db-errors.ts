/**
 * Drizzle يغلّف خطأ السائق في `DrizzleQueryError`، فرمز SQLSTATE لا يظهر
 * على الكائن الخارجي بل في سلسلة `cause`. قراءة `code` من المستوى الأعلى
 * وحده تجعل الشرط لا يتحقق أبدًا، فيعود تعارضُ الفهرس خطأَ خادم 500.
 */
function hasSqlState(error: unknown, code: string): boolean {
  for (
    let current: unknown = error;
    typeof current === 'object' && current !== null;
    current = (current as { cause?: unknown }).cause
  ) {
    if ('code' in current && (current as { code?: unknown }).code === code) {
      return true
    }
  }

  return false
}

/** 23505: صف يخالف فهرسًا فريدًا — سبقه كاتب آخر، أو هو الطلب نفسه مُعادًا. */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, '23505')
}

/**
 * اسم الفهرس الذي خولف، ليعرف المستدعي أي قاعدة من قواعد الجدول كُسرت حين
 * يحمل الجدول أكثر من فهرس فريد.
 */
export function violatedConstraint(error: unknown): string | null {
  for (
    let current: unknown = error;
    typeof current === 'object' && current !== null;
    current = (current as { cause?: unknown }).cause
  ) {
    const constraint = (current as { constraint?: unknown }).constraint

    if (typeof constraint === 'string') return constraint
  }

  return null
}
