/**
 * خريطة ثابتة لموقع التنفيذ — صورة لا مكتبة.
 *
 * بطاقة المتطوع تُفتح على شبكة هاتف وتُقرأ مرة: خريطة تفاعلية تجرّ مئات
 * الكيلوبايتات ليرى نقطة واحدة. الصورة تكفي ليعرف الحي، وزر «افتح في
 * الخرائط» يأخذه إلى تطبيقه حيث الطريق والاتجاهات.
 *
 * الرمز عام (`pk.`) ومقيَّد بأصل الموقع من إعدادات Mapbox. بلا رمز لا صورة،
 * والبطاقة تبقى كاملة بزرها.
 */
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** أخضر الهوية العميق، بلا `#` كما تطلبه واجهة الصور. */
const PIN_COLOR = "103900";

/** شبكة شوارع بتسمياتها المحلية: في سوريا عربية. */
const STYLE = "mapbox/streets-v12";

export function staticMapUrl(
  lat: number,
  lng: number,
  size: { width: number; height: number } = { width: 640, height: 320 },
) {
  if (!TOKEN) return null;

  // ست خانات عشرية نحو عشرة سنتيمترات: تكفي، وتثبّت العنوان فيُحفظ مرة.
  const point = `${lng.toFixed(6)},${lat.toFixed(6)}`;

  return `https://api.mapbox.com/styles/v1/${STYLE}/static/pin-l+${PIN_COLOR}(${point})/${point},15,0/${size.width}x${size.height}@2x?access_token=${TOKEN}`;
}

/**
 * رابط يفتح تطبيق الخرائط على الموقع. عنوان عام لا مخطط `geo:`: يعمل على
 * Android وiOS والحاسوب، ويفتح التطبيق المثبَّت حيث وُجد.
 */
export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}
