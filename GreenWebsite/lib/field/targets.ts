import type { FieldTarget } from "./api";

/**
 * ما أُدخل كله على المؤشر — الموثَّق وما ينتظر التحقق.
 *
 * يتفرّع على دالة المؤشر كما يفعل الخادم: العدّاد يُجمع، و«أكبر قيمة»
 * و«آخر قراءة» لا يُجمعان — جمع قراءتين رقمٌ لم يقله أحد.
 */
export function enteredValue(target: FieldTarget) {
  switch (target.aggregation) {
    case "SUM":
      return target.actual + target.unverified;

    case "MAX":
      return Math.max(target.actual, target.unverified);

    case "LATEST":
      // ما ينتظر التحقق أحدث مما وُثّق: التوثيق يأتي بعد الإدخال.
      return target.unverified > 0 ? target.unverified : target.actual;
  }
}

/** المؤشر بعد رقم أُدخل من الميدان ولم يُتحقَّق منه بعد. */
export function withReading(target: FieldTarget, value: number): FieldTarget {
  switch (target.aggregation) {
    case "SUM":
      return { ...target, unverified: target.unverified + value };

    case "MAX":
      return { ...target, unverified: Math.max(target.unverified, value) };

    case "LATEST":
      return { ...target, unverified: value };
  }
}

/** العدّاد يُزاد عليه، والقراءة تُكتب كاملة: «كم زرعنا الآن؟» غير «كم المنسوب؟». */
export const isCounter = (target: FieldTarget) => target.aggregation === "SUM";
