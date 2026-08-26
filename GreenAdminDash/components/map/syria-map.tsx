"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useCallback, useEffect, useMemo } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import {
  POINT_KIND_LABELS,
  type MapArea,
  type MapPoint,
} from "@/lib/api/map";
import { buildOutline, type Ring } from "@/lib/map/outline";

/** سورية كاملة — يمنع الانجراف بعيدًا عن نطاق العمل. */
const SYRIA_BOUNDS: L.LatLngBoundsExpression = [
  [32.0, 35.5],
  [37.5, 42.5],
];

const AREA_STYLE = {
  weight: 1,
  color: "#94a3b8",
  fillColor: "#86efac",
  fillOpacity: 0.25,
};

const AREA_HOVER_STYLE = {
  weight: 2,
  color: "#15803d",
  fillColor: "#22c55e",
  fillOpacity: 0.55,
};

const AREA_SELECTED_STYLE = {
  weight: 2.5,
  color: "#166534",
  fillColor: "#16a34a",
  fillOpacity: 0.45,
};

/**
 * من هذا التقريب فصاعدًا تُطفأ تعبئة المحافظات: اللون يفيد وهو يلخّص البلد
 * كلها في لمحة، ويحجب الشوارع والأحياء حين يقترب الناظر ليقرأ الخريطة نفسها.
 */
const DETAIL_ZOOM = 9;

/**
 * القناع خارج الحدود. الألوان هنا احتياط فقط: التلوين الفعلي في `.map-mask`
 * ضمن globals.css كي يتبع متغيّرات السمة ويصحّ في الوضع الليلي.
 *
 * و`interactive: false` كي لا يبتلع القناع نقرات الخريطة وتمريرات الماوس.
 */
const MASK_STYLE: L.PolylineOptions = {
  className: "map-mask",
  interactive: false,
  // بلا قصّ: قصّ Leaflet يغلق كل حلقة على حافة الرسم، وقاعدة even-odd تقلب
  // ما تحصره تلك الإغلاقات — فينكشف عندها جزء من الجوار بدل أن يُغطّى.
  noClip: true,
  color: "#166534",
  weight: 1.2,
  fillColor: "#f8faf8",
  fillOpacity: 1,
};

/**
 * إطار القناع: مستطيل يتجاوز `SYRIA_BOUNDS` بأضعافها فلا تبلغه حافة الشاشة
 * مهما اتّسعت عند أبعد تصغير، ولا يمتدّ إلى العالم كله فتصير إحداثيات المسار
 * بالملايين عند أقصى تقريب.
 */
const MASK_FRAME: L.LatLngExpression[] = [
  [12, 12],
  [12, 68],
  [56, 68],
  [56, 12],
];

/**
 * دبّوس مرسوم بـSVG لا صورة: لا طلب شبكة إضافي، ولونه يتبع التصنيف
 * فيُقرأ نوع النقطة قبل النقر عليها.
 */
function pinFor(kind: MapPoint["kind"]) {
  const color = kind === "CAMPAIGN" ? "#15803d" : "#0891b2";

  return L.divIcon({
    className: "",
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 34S25 20.5 25 13A12 12 0 1 0 1 13c0 7.5 12 21 12 21Z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.5" fill="#fff"/>
    </svg>`,
  });
}

/**
 * قناعٌ يغطي ما حول سورية: إطارٌ واسع وثقوبه حدود البلد، فتختفي تفاصيل الجوار.
 *
 * طبقة Leaflet مباشرةً لا `<GeoJSON/>`: القناع مضلّع بثقوب لا هندسة GeoJSON،
 * ويحتاج `noClip` وهي ليست من خيارات `style` التي يمرّرها المكوّن.
 */
function OutsideMask({ outline }: { outline: Ring[] }) {
  const map = useMap();

  useEffect(() => {
    if (!outline.length) return;

    const mask = L.polygon(
      [
        MASK_FRAME,
        ...outline.map((ring) => ring.map(([lng, lat]) => L.latLng(lat, lng))),
      ],
      MASK_STYLE,
    ).addTo(map);

    // خلف مضلّعات المحافظات كي لا يحجب تلوينها ولا حدودها.
    mask.bringToBack();

    return () => {
      mask.remove();
    };
  }, [map, outline]);

  return null;
}

/**
 * يقرّب على المحافظة المختارة.
 *
 * داخل `useEffect` لا في جسم التصيير: الطيران أثر جانبي، وتشغيله أثناء
 * الرسم يعيد إطلاقه مع كل إعادة تصيير فتبقى الخريطة تتحرك بلا سبب.
 */
function AreaFocus({ area }: { area: MapArea | null }) {
  const map = useMap();

  useEffect(() => {
    if (!area?.boundary) return;

    const bounds = L.geoJSON(area.boundary as never).getBounds();

    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [32, 32], duration: 0.7 });
    }
  }, [area, map]);

  return null;
}

/**
 * يضع `map-detail` على حاوية الخريطة بعد حدّ التقريب، وإطفاء التعبئة يتم
 * في CSS.
 *
 * صنفٌ لا حالة React: التقريب لا يغيّر الهندسة، ورفعه إلى الحالة يعيد تصيير
 * الشجرة وربما بناء المضلّعات من جديد مع كل درجة.
 */
function DetailZoomClass() {
  const map = useMap();

  useEffect(() => {
    const sync = () => {
      map
        .getContainer()
        .classList.toggle("map-detail", map.getZoom() >= DETAIL_ZOOM);
    };

    sync();
    map.on("zoomend", sync);

    return () => {
      map.off("zoomend", sync);
    };
  }, [map]);

  return null;
}

/** يلتقط نقرة الخريطة أثناء وضع تحديد الموقع فقط. */
function ClickCapture({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (enabled) onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export type SyriaMapProps = {
  areas: MapArea[];
  points: MapPoint[];
  selectedAreaId: string | null;
  onAreaSelect: (area: MapArea) => void;
  attribution: string;
  /** وضع تحديد موقع نقطة جديدة: نقرة الخريطة تُرجع إحداثيات بدل اختيار محافظة. */
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
  pendingPin: { lat: number; lng: number } | null;
  /** حذف نقطة خضراء. يُترك فارغًا لمن لا يملك الصلاحية فيختفي الزر. */
  onPointDelete?: ((point: MapPoint) => void) | undefined;
  deletingSiteId?: string | null | undefined;
};

export function SyriaMap({
  areas,
  points,
  selectedAreaId,
  onAreaSelect,
  attribution,
  picking,
  onPick,
  pendingPin,
  onPointDelete,
  deletingSiteId,
}: SyriaMapProps) {
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? null;

  /** الإذابة تمرّ على ثمانية وعشرين ألف رأس، فتُحسب مرة لكل تحميل لا مع كل تصيير. */
  const outline = useMemo(() => buildOutline(areas), [areas]);

  const icons = useMemo(
    () => ({
      CAMPAIGN: pinFor("CAMPAIGN"),
      GREEN_POINT: pinFor("GREEN_POINT"),
    }),
    [],
  );

  /**
   * التلوين عند المرور يُدار بأحداث Leaflet مباشرة لا بحالة React:
   * تمريرة الماوس على مضلّع تُعيد رسم الشجرة كلها لو مرّت بـuseState،
   * وهي أربعة عشر مضلّعًا بثمانية وعشرين ألف نقطة.
   */
  const onEachArea = useCallback(
    (area: MapArea) => (_feature: unknown, layer: L.Layer) => {
      const path = layer as L.Path;
      const isSelected = area.id === selectedAreaId;

      path.setStyle(isSelected ? AREA_SELECTED_STYLE : AREA_STYLE);

      path.bindTooltip(
        `${area.nameAr} — ${area.campaignCount} حملة · ${area.greenPointCount} نقطة`,
        { sticky: true, direction: "top" },
      );

      path.on({
        mouseover: () => path.setStyle(AREA_HOVER_STYLE),
        mouseout: () =>
          path.setStyle(
            area.id === selectedAreaId ? AREA_SELECTED_STYLE : AREA_STYLE,
          ),
        // أثناء تحديد الموقع لا تسرق المضلّعات النقرة من الخريطة.
        click: () => {
          if (!picking) onAreaSelect(area);
        },
      });
    },
    [onAreaSelect, picking, selectedAreaId],
  );

  return (
    <MapContainer
      center={[34.8, 38.5]}
      zoom={7}
      minZoom={6}
      maxZoom={17}
      maxBounds={SYRIA_BOUNDS}
      maxBoundsViscosity={0.7}
      scrollWheelZoom
      className="h-[70vh] w-full rounded-xl"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ${attribution}`}
      />

      {areas
        .filter((area) => area.boundary)
        .map((area) => (
          <GeoJSON
            // المفتاح يحمل الاختيار كي يُعاد بناء الطبقة عند تغيّره،
            // فالنمط يُضبط داخل onEachFeature وهو لا يُستدعى إلا عند البناء.
            key={`${area.id}-${area.id === selectedAreaId}`}
            data={area.boundary as never}
            // الصنف يصل عبر خيارات المسار: به يُطفئ CSS التعبئة عند التقريب.
            style={{ className: "map-area" }}
            onEachFeature={onEachArea(area)}
          />
        ))}

      {points.map((point) => (
        <Marker
          key={point.siteId}
          position={[point.lat, point.lng]}
          icon={icons[point.kind]}
          title={point.siteNameAr}
        >
          <Popup>
            <div dir="rtl" className="text-end text-xs">
              <p className="mb-1 font-bold">{point.initiativeNameAr}</p>
              <p className="mb-1 text-[11px] opacity-80">
                {POINT_KIND_LABELS[point.kind]}
                {point.areaNameAr ? ` · ${point.areaNameAr}` : ""}
              </p>
              {point.contributorNameAr ? (
                <p className="mb-1 text-[11px]">
                  نفّذها: {point.contributorNameAr}
                </p>
              ) : null}
              <a
                href={`/dashboard/initiatives/${point.initiativeId}`}
                className="font-semibold text-emerald-700 underline"
              >
                عرض التفاصيل ←
              </a>

              {/*
                الحذف من النافذة نفسها: النقطة الخاطئة تُكتشف وهي منظورة على
                الخريطة، فيكون تصحيحها حيث رُئيت لا في شاشة أخرى تُبحث.
                والحملات لا تُحذف — لها الإلغاء من صفحتها.
              */}
              {onPointDelete && point.kind === "GREEN_POINT" ? (
                <button
                  type="button"
                  disabled={deletingSiteId === point.siteId}
                  onClick={() => onPointDelete(point)}
                  className="mt-2 block w-full rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingSiteId === point.siteId ? "…جارٍ الحذف" : "حذف النقطة"}
                </button>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}

      {pendingPin ? (
        <Marker
          position={[pendingPin.lat, pendingPin.lng]}
          icon={icons.GREEN_POINT}
        />
      ) : null}

      {/* يحجب تفاصيل الدول المجاورة ويترك سورية وحدها مكشوفة. */}
      <OutsideMask outline={outline} />
      <DetailZoomClass />
      <ClickCapture enabled={picking} onPick={onPick} />
      <AreaFocus area={selectedArea} />
    </MapContainer>
  );
}
