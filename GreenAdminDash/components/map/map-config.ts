import type { Bbox } from "@/lib/map/geometry";

/**
 * ثوابت الخريطة بلا استيراد من `mapbox-gl`: تقرؤها الصفحات والنماذج التي
 * تُصيَّر على الخادم أيضًا، والمكتبة نفسها لا تُحمَّل إلا في المتصفح.
 */

/**
 * رمز Mapbox العام (`pk.`). يُضمَّن في الحزمة وقت البناء كأي متغير
 * `NEXT_PUBLIC_`، فغيابه يعني بناءً بلا خريطة: تظهر مكانها رسالة تشرح
 * السبب بدل مساحة فارغة.
 */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** نمط هادئ: التلوين الذي يحمل المعنى يأتي من طبقاتنا لا من الخلفية. */
export const MAP_STYLE = "mapbox://styles/mapbox/light-v11";

/** بدونها تظهر الحروف العربية في التسميات منفصلةً ومعكوسة الترتيب. */
export const RTL_TEXT_PLUGIN_URL =
  "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.js";

/** سورية كاملة، بترتيب Mapbox `[lng, lat]` — عكس ما كان في Leaflet. */
export const SYRIA_BOUNDS: Bbox = [
  [35.5, 32.0],
  [42.5, 37.5],
];

/**
 * حدود التجوال أوسع من سورية عمدًا: Mapbox يُبقي الشاشة كلها داخل
 * `maxBounds` ويرفع التقريب حتى تمتلئ بها. بحدود سورية نفسها كانت
 * الشاشة العريضة تُجبَر على تقريب لا يتسع لطول البلد من الشمال إلى
 * الجنوب. والهامش بعدها مغطّى بالقناع، فلا يُرى منه إلا لون الخلفية.
 */
export const MAX_BOUNDS: Bbox = [
  [32.5, 30.0],
  [45.5, 39.5],
];

export const MIN_ZOOM = 6;
export const MAX_ZOOM = 17;

/**
 * من هذا التقريب فصاعدًا تنطفئ تعبئة المحافظات: اللون يفيد وهو يلخّص
 * البلد كلها في لمحة، ويحجب الشوارع والأحياء حين يقترب الناظر ليقرأ
 * الخريطة نفسها.
 */
export const DETAIL_ZOOM = 9;

/** التقريب الذي تُفتح عليه نقطة بعينها: يكفي لتمييز الشارع حولها. */
export const POINT_ZOOM = 13;

/** لون النقطة يتبع نوعها، فيُقرأ النوع قبل النقر. نفس ألوان دبابيس Leaflet. */
export const KIND_COLORS = {
  CAMPAIGN: "#15803d",
  GREEN_POINT: "#0891b2",
} as const;

/**
 * نصوص أدوات الخريطة بالعربية. هي تسميات أزرار التقريب والإسناد عند
 * قارئ الشاشة، وتلميحاتها عند المرور.
 */
export const MAP_LOCALE = {
  "AttributionControl.ToggleAttribution": "إظهار مصادر الخريطة أو إخفاؤها",
  "LogoControl.Title": "شعار Mapbox",
  "NavigationControl.ZoomIn": "تكبير",
  "NavigationControl.ZoomOut": "تصغير",
  "NavigationControl.ResetBearing": "إعادة الاتجاه إلى الشمال",
  "ScrollZoomBlocker.CtrlMessage": "اضغط Ctrl مع التمرير لتكبير الخريطة",
  "ScrollZoomBlocker.CmdMessage": "اضغط ⌘ مع التمرير لتكبير الخريطة",
  "TouchPanBlocker.Message": "حرّك الخريطة بإصبعين",
};
