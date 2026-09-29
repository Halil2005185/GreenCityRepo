import type { components } from "@/lib/api/types.gen";

/** ما تقوله الشهادة لمن يتحقق منها: لا وسيلة تواصل فيها ولا معرّف. */
export type VerifiedCertificate = components["schemas"]["VerifiedCertificate"];

/**
 * رمز شهادة المشاركة: عشرة محارف بلا ما يلتبس على من يقرؤه من ورقة — لا
 * صفر ولا O، ولا واحد ولا I. يُكتب بشرطة في وسطه أو بلا، وبحروف صغيرة أو
 * كبيرة؛ وهنا يعود إلى صورته الواحدة.
 */
const CODE = /^[2-9A-HJ-NP-Z]{10}$/;

export function readCertificateCode(value: string) {
  const code = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s-]/g, "");

  return CODE.test(code) ? code : null;
}

/** الرمز كما يُقرأ من ورقة: خمسة محارف ثم خمسة. */
export const formatCertificateCode = (code: string) =>
  `${code.slice(0, 5)}-${code.slice(5)}`;

/** صفحة التحقق برمزها — العنوان الذي يحمله الرمز المربّع على الورقة. */
export const verifyPath = (code: string) => `/verify?code=${code}`;

/**
 * جواب السجل عن رمز. «لا شهادة» و«تعذّر السؤال» جوابان لا جواب واحد: من
 * يتحقق من ورقة في يده يبني على ما يقرأ، وانقطاعٌ يُعرض «لا شهادة» اتهامٌ
 * لصاحبها بلا سبب.
 */
export type Verification =
  | { kind: "valid"; certificate: VerifiedCertificate }
  | { kind: "missing" }
  | { kind: "busy" }
  | { kind: "failed" };

/**
 * السؤال من متصفح الزائر مباشرةً إلى الـAPI، لا عبر خادم الموقع: حدّ التحقق
 * على العنوان، ولو مرّ كل سؤال بخادم الموقع لصار السائلون عنوانًا واحدًا
 * فيحجب مَن يكثر السؤال كلَّ مَن بعده.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

export async function verifyCertificate(
  code: string,
  signal?: AbortSignal,
): Promise<Verification> {
  try {
    const response = await fetch(
      `${API_ORIGIN}/api/public/certificates/${encodeURIComponent(code)}`,
      {
        headers: { accept: "application/json" },
        // السجل يتغير: حضور يُتراجع عنه يُنقص ما تشهد به الشهادة.
        cache: "no-store",
        signal,
      },
    );

    if (response.status === 404) return { kind: "missing" };
    if (response.status === 429) return { kind: "busy" };
    if (!response.ok) return { kind: "failed" };

    const body = (await response.json()) as { data?: VerifiedCertificate };

    return body.data
      ? { kind: "valid", certificate: body.data }
      : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
