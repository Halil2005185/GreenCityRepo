const rules = new Intl.PluralRules("ar");

/** صيغ المعدود: المفرد والمثنى يُكتبان بلا رقم («شهر»، «شهرين»). */
export type ArabicCountForms = {
  one: string;
  two: string;
  /** ٣–١٠: «أشهر». */
  few: string;
  /** ١١–٩٩: «شهرًا». */
  many: string;
  /** ١٠٠ فما فوق وما لا يدخل فيما سبق: «شهر». */
  other: string;
};

/**
 * العدد مع معدوده بقواعد العربية: «شهر»، «شهرين»، «٣ أشهر»، «١١ شهرًا».
 *
 * `${n} شهرًا` لكل عدد كانت تكتب «1 شهرًا» و«4 شهرًا». فئات العدد من
 * `Intl.PluralRules` لا من شروط مكتوبة يدويًا؛ والصيغ يمررها المستدعي
 * لأن المثنى والجمع لا يُشتقان آليًا.
 */
export function countAr(count: number, forms: ArabicCountForms) {
  const category = rules.select(count);

  if (category === "one") return forms.one;
  if (category === "two") return forms.two;

  const form = category === "few" ? forms.few : category === "many" ? forms.many : forms.other;

  return `${count} ${form}`;
}
