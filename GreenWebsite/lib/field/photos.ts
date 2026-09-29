/**
 * الصورة من الكاميرا إلى ما يُرفع على شبكة الميدان.
 */

/** الضلع الأطول بعد التصغير: يكفي لشاشة وتقرير، ويخفّ إلى ثلث ميغابايت. */
const MAX_SIDE = 1600;
const QUALITY = 0.8;

export const PHOTO_CONTENT_TYPE = "image/jpeg";

async function decode(file: Blob) {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    image.src = url;
    await image.decode();

    return image;
  } finally {
    // الصورة فُكّت إلى الذاكرة، فالعنوان المؤقت لم يعد لازمًا.
    URL.revokeObjectURL(url);
  }
}

/**
 * يصغّر الصورة ويعيد ترميزها JPEG.
 *
 * على الجهاز لا على الخادم: صورة الكاميرا أربعة ميغابايت أو أكثر، وشبكة
 * الموقع لا تحملها. وإعادة الترميز تمحو بيانات EXIF كلها — ومنها إحداثيات
 * الكاميرا — فلا يخرج من الهاتف موقع لم يُطلب إذنه صراحة.
 *
 * العنصر `<img>` يطبّق اتجاه الصورة من EXIF قبل الرسم، فتخرج قائمة كما
 * التُقطت دون قراءة الاتجاه باليد.
 */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const image = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");

  if (!context) throw new Error("تعذّر تجهيز الصورة على هذا الجهاز.");

  // خلفية بيضاء: ما كان شفافًا في الأصل يخرج أسود في JPEG لولاها.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, PHOTO_CONTENT_TYPE, QUALITY),
  );

  if (!blob) throw new Error("تعذّر تجهيز الصورة على هذا الجهاز.");

  return blob;
}

export type PhotoLocation = { lat: number; lng: number };

/**
 * موقع الالتقاط، أو `null`.
 *
 * يُطلب صراحةً من المتصفح، فيسأل صاحب الهاتف إذنه. رفضه أو تأخره لا يوقف
 * الصورة: الموقع زيادة في الدليل لا شرط له، والصورة مربوطة بموقع التنفيذ
 * على كل حال.
 */
export function locatePhoto(timeoutMs = 6000): Promise<PhotoLocation | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        }),
      () => resolve(null),
      // موضع قُرئ قبل دقيقة يكفي: القائد في الموقع نفسه.
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
