import { hash, verify } from '@node-rs/argon2'

/**
 * معاملات Argon2id بحسب توصية OWASP: 19 ميغابايت ذاكرة، تكرارتان،
 * تفرّع واحد. الذاكرة هي ما يجعل التخمين بالعتاد المتخصص مكلفًا، لذلك
 * لا تُخفَّض بحجة السرعة — عملية الدخول تحتمل عشرات الميلي ثانية.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(plainPassword: string) {
  return hash(plainPassword, ARGON2_OPTIONS)
}

export function verifyPassword(passwordHash: string, plainPassword: string) {
  return verify(passwordHash, plainPassword, ARGON2_OPTIONS)
}

/**
 * تجزئة خادعة تُحسب عند أول استعمال وتُخزَّن.
 *
 * بدونها يرد الخادم على بريد غير موجود أسرع بكثير من بريد موجود، فيكشف
 * فرق الزمن أي الحسابات مسجلة عندنا.
 */
let decoyHash: string | null = null

/** يُستدعى في مسار «المستخدم غير موجود» ليتساوى زمن الرد. */
export async function burnPasswordTime() {
  decoyHash ??= await hashPassword('decoy-password-6f3a91c2-not-a-real-secret')

  await verify(decoyHash, 'any-input', ARGON2_OPTIONS).catch(() => false)
}
