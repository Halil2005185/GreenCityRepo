import { apiFetch } from "./client";
import type { components } from "./types.gen";

/** مرآةٌ لتعداد الخادم: الغرض يقرّر المجلّد والقدرة المطلوبة معًا. */
export type UploadPurpose =
  | "FORM_COVER"
  | "INITIATIVE_COVER"
  | "GREEN_POINT_COVER";

export type SignedUpload = components["schemas"]["SignedUpload"];

/** خمسة ميغابايت — الحدّ نفسه الذي يوقّعه الخادم ويفرضه على الرفع. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function signUpload(input: {
  purpose: UploadPurpose;
  contentType: string;
  size: number;
}) {
  return apiFetch<{ data: SignedUpload }>("/admin/uploads/sign", {
    method: "POST",
    body: input,
  }).then((response) => response.data);
}

/**
 * يرفع الملف إلى التخزين مباشرةً بعد أن يوقّع الخادم الرفع.
 *
 * الملف لا يمرّ بالـAPI: يوقّع الخادم مفتاحًا ونوعًا وحجمًا، ثم يذهب
 * المتصفح إلى التخزين وحده. ولذلك لا `apiFetch` هنا — الطلب الثاني ليس
 * إلى الـAPI ولا يحمل جلسته.
 */
export async function uploadFile(file: File, purpose: UploadPurpose) {
  if (!UPLOAD_TYPES.includes(file.type as (typeof UPLOAD_TYPES)[number])) {
    throw new Error("الصيغ المقبولة: JPEG وPNG وWebP.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("حجم الصورة يتجاوز خمسة ميغابايت.");
  }

  const signed = await signUpload({
    purpose,
    contentType: file.type,
    size: file.size,
  });

  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    // النوع جزء من التوقيع: تغييره هنا يُبطل الرابط بدل أن يُخزَّن ملف
    // بنوع غير الذي أُذن به.
    headers: { "content-type": file.type },
    body: file,
  });

  if (!response.ok) {
    throw new Error("تعذّر رفع الصورة إلى التخزين. حاول مجددًا.");
  }

  return signed.publicUrl;
}
