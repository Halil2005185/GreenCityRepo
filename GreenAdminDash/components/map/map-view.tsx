"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import type { Feature, FeatureCollection, Geometry, Point, Polygon } from "geojson";
import mapboxgl, {
  type ExpressionSpecification,
  type GeoJSONFeature,
  type GeoJSONSource,
} from "mapbox-gl";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import MapGL, {
  type ErrorEvent,
  Layer,
  type LayerProps,
  type MapMouseEvent,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/mapbox";

import { POINT_KIND_LABELS, type MapArea, type MapPoint } from "@/lib/api/map";
import { type Coordinates, bboxOf, rounded } from "@/lib/map/geometry";
import { buildOutline } from "@/lib/map/outline";
import { countAr } from "@/lib/text/plural-ar";
import { cn } from "@/lib/utils";

import {
  DETAIL_ZOOM,
  KIND_COLORS,
  MAPBOX_TOKEN,
  MAP_LOCALE,
  MAP_STYLE,
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  POINT_ZOOM,
  RTL_TEXT_PLUGIN_URL,
  SYRIA_BOUNDS,
} from "./map-config";

/**
 * إضافة النص العربي مرة واحدة للوحدة كلها لا لكل خريطة: هي إعداد عام على
 * المكتبة، وضبطها مرة ثانية يرمي خطأ. والفحص يحمي من إعادة تقييم الوحدة
 * في التطوير. و`lazy` يؤجل تنزيلها حتى تظهر أول تسمية عربية فعلًا.
 */
if (mapboxgl.getRTLTextPluginStatus() === "unavailable") {
  mapboxgl.setRTLTextPlugin(RTL_TEXT_PLUGIN_URL, null, true);
}

const MASK_SOURCE = "mask";
const AREAS_SOURCE = "areas";
const POINTS_SOURCE = "points";

const MASK_FILL = "mask-fill";
const MASK_LINE = "mask-line";
const AREA_FILL = "area-fill";
const AREA_LINE = "area-line";
const CLUSTERS = "point-clusters";
const CLUSTER_COUNT = "point-cluster-count";
const POINT_HALO = "point-halo";
const POINTS = "points";

/**
 * إطار القناع: مستطيل يتجاوز حدود التجوال بأضعافها فلا تبلغه حافة الشاشة،
 * ولا يمتدّ إلى العالم كله. `[lng, lat]` ومغلق كما يشترط GeoJSON.
 */
const MASK_FRAME = [
  [12, 12],
  [68, 12],
  [68, 56],
  [12, 56],
  [12, 12],
];

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** ألوان المحافظات كما كانت قبل Mapbox: عادية، وعند المرور، ومختارة. */
const AREA = {
  line: "#94a3b8",
  fill: "#86efac",
  opacity: 0.25,
  width: 1,
  hoverLine: "#15803d",
  hoverFill: "#22c55e",
  hoverOpacity: 0.55,
  hoverWidth: 2,
  selectedLine: "#166534",
  selectedFill: "#16a34a",
  selectedOpacity: 0.45,
  selectedWidth: 2.5,
};

/** المرور يغلب الاختيار كما كان: المحافظة المختارة تتلوّن أيضًا حين يمرّ عليها الماوس. */
function byState<T extends string | number>(hover: T, selected: T, normal: T) {
  return [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    hover,
    ["boolean", ["feature-state", "selected"], false],
    selected,
    normal,
  ] as ExpressionSpecification;
}

const IS_CLUSTER = ["has", "point_count"] as ExpressionSpecification;
const IS_POINT = ["!", ["has", "point_count"]] as ExpressionSpecification;
const KIND_COLOR = [
  "match",
  ["get", "kind"],
  "CAMPAIGN",
  KIND_COLORS.CAMPAIGN,
  KIND_COLORS.GREEN_POINT,
] as ExpressionSpecification;

const CAMPAIGNS = { one: "حملة واحدة", two: "حملتان", few: "حملات", many: "حملة", other: "حملة" };
const GREEN_POINTS = {
  one: "نقطة خضراء واحدة",
  two: "نقطتان خضراوان",
  few: "نقاط خضراء",
  many: "نقطة خضراء",
  other: "نقطة خضراء",
};
const POINT_COUNT = { one: "نقطة واحدة", two: "نقطتان", few: "نقاط", many: "نقطة", other: "نقطة" };

/**
 * لون متغيّر من السمة بصيغة يفهمها Mapbox. رموز `globals.css` كلها
 * `oklch()` ومحلّل ألوان Mapbox لا يعرفه، فيُرسم اللون بكسلًا واحدًا على
 * canvas ويُقرأ بقيم sRGB. هكذا تبقى السمة مصدر اللون الوحيد بدل نسخة
 * hex تتخلّف عنها إن عُدّلت.
 */
function themeColor(variable: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  if (!value || !context) return fallback;

  // قيمة لا يفهمها المتصفح تُهمَل بصمت ويبقى الاحتياط.
  context.fillStyle = fallback;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);

  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;

  return `rgb(${red}, ${green}, ${blue})`;
}

function readTheme() {
  return {
    background: themeColor("--background", "#fcfefc"),
    foreground: themeColor("--foreground", "#131d17"),
    primary: themeColor("--primary", "#137d41"),
  };
}

type Theme = ReturnType<typeof readTheme>;

function layerStyles(theme: Theme) {
  return {
    maskFill: {
      id: MASK_FILL,
      type: "fill",
      paint: { "fill-color": theme.background, "fill-opacity": 1 },
    },
    maskLine: {
      id: MASK_LINE,
      type: "line",
      paint: { "line-color": theme.primary, "line-opacity": 0.5, "line-width": 1.2 },
    },
    areaFill: {
      id: AREA_FILL,
      type: "fill",
      paint: {
        "fill-color": byState(AREA.hoverFill, AREA.selectedFill, AREA.fill),
        // تنطفئ التعبئة تدريجيًا قبيل حدّ التفاصيل بدل أن تختفي دفعة واحدة.
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          DETAIL_ZOOM - 0.5,
          byState(AREA.hoverOpacity, AREA.selectedOpacity, AREA.opacity),
          DETAIL_ZOOM,
          0,
        ],
      },
    },
    areaLine: {
      id: AREA_LINE,
      type: "line",
      paint: {
        "line-color": byState(AREA.hoverLine, AREA.selectedLine, AREA.line),
        "line-width": byState(AREA.hoverWidth, AREA.selectedWidth, AREA.width),
      },
    },
    // التجمّع حلقة فاتحة برقم لا دائرة ممتلئة: لونا النوعين للنقاط المفردة وحدها.
    clusters: {
      id: CLUSTERS,
      type: "circle",
      filter: IS_CLUSTER,
      paint: {
        "circle-color": theme.background,
        "circle-stroke-color": theme.primary,
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 23],
      },
    },
    clusterCount: {
      id: CLUSTER_COUNT,
      type: "symbol",
      filter: IS_CLUSTER,
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": theme.foreground },
    },
    pointHalo: {
      id: POINT_HALO,
      type: "circle",
      paint: { "circle-color": KIND_COLOR, "circle-opacity": 0.25, "circle-radius": 15 },
    },
    points: {
      id: POINTS,
      type: "circle",
      filter: IS_POINT,
      paint: {
        "circle-color": KIND_COLOR,
        "circle-radius": 6.5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
  } satisfies Record<string, LayerProps>;
}

/** Mapbox يقرأ الإسناد HTML، والنص قادم من الـAPI. */
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * عزل اتجاه النص العربي داخل سطر الإسناد (RLI … PDI). Mapbox ينزع من
 * الإسناد كل وسم عدا الروابط فلا يبقى `<span dir>`؛ محارف العزل نصٌّ
 * فتبقى، ولولاها لانقلب ترتيب «حدود المحافظات: …» حول الأسماء اللاتينية.
 */
const RTL_ISOLATE = String.fromCharCode(0x2067);
const POP_ISOLATE = String.fromCharCode(0x2069);

type TooltipContent = { title: string; detail: string };
type TooltipHandle = {
  show: (x: number, y: number, content: TooltipContent) => void;
  hide: () => void;
};

/**
 * تلميح المرور بحالته الخاصة: حركة الماوس تعيد رسم التلميح وحده، لا
 * الخريطة بمصادرها وطبقاتها.
 */
function HoverTooltip({ handle }: { handle: React.Ref<TooltipHandle> }) {
  const [tip, setTip] = useState<{ x: number; y: number; content: TooltipContent } | null>(null);

  useImperativeHandle(
    handle,
    () => ({
      show: (x, y, content) => setTip({ x, y, content }),
      hide: () => setTip(null),
    }),
    [],
  );

  if (!tip) return null;

  // قرب الحافة العليا ينزل التلميح تحت المؤشر بدل أن يُقصّ.
  const below = tip.y < 72;

  return (
    <div
      role="tooltip"
      dir="rtl"
      className="pointer-events-none absolute z-10 max-w-64 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      // إحداثيات المؤشر من canvas فعلية لا منطقية، فالموضع بـ`left` عمدًا.
      style={{
        left: tip.x,
        top: tip.y,
        transform: below ? "translate(-50%, 16px)" : "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <p className="font-medium">{tip.content.title}</p>
      <p className="text-muted-foreground">{tip.content.detail}</p>
    </div>
  );
}

/** دبوس DOM لا طبقة: يُسحب، ولونه من متغيّر السمة مباشرة بلا تحويل. */
function Pin() {
  return (
    <svg width="28" height="36" viewBox="0 0 26 34" aria-hidden className="drop-shadow-md">
      <path
        d="M13 34S25 20.5 25 13A12 12 0 1 0 1 13c0 7.5 12 21 12 21Z"
        className="fill-primary stroke-white"
        strokeWidth="2"
      />
      <circle cx="13" cy="13" r="4.5" className="fill-white" />
    </svg>
  );
}

export type MapViewProps = {
  areas: MapArea[];
  /** إسناد مصدر الحدود القادم من `listMapAreas()` — ترخيصه يفرض ظهوره. */
  attribution: string;
  /** تسمية الخريطة عند قارئ الشاشة. */
  label?: string;
  /**
   * خريطة مصغّرة داخل نموذج: حدود بلا تعبئة ولا تلميح، وإيماءات تعاونية
   * (Ctrl مع التمرير) كي لا تبتلع الخريطة تمرير النافذة.
   */
  compact?: boolean;
  /** بلا نقاط لا يُنشأ مصدرها أصلًا. */
  points?: MapPoint[];
  selectedAreaId?: string | null;
  onAreaSelect?: (area: MapArea) => void;
  selectedPointId?: string | null;
  onPointSelect?: (point: MapPoint) => void;
  /** وضع تحديد موقع: مؤشر تقاطع، والنقر يعيد إحداثيات بدل أن يختار شيئًا. */
  picking?: boolean;
  onPick?: (location: Coordinates) => void;
  /** دبوس الموقع المختار. مع `onPinMove` يُسحب لضبط الموقع. */
  pin?: Coordinates | null;
  onPinMove?: (location: Coordinates) => void;
  /** يبدأ العرض مقرّبًا على هذه النقطة بدل سورية كاملة. */
  initialFocus?: Coordinates | null;
  /** تطير الخريطة إلى النقطة كلما تغيّرت. */
  focus?: Coordinates | null;
  className?: string;
};

export function MapView({
  areas,
  attribution,
  label = "خريطة سورية",
  compact = false,
  points,
  selectedAreaId = null,
  onAreaSelect,
  selectedPointId = null,
  onPointSelect,
  picking = false,
  onPick,
  pin = null,
  onPinMove,
  initialFocus = null,
  focus = null,
  className,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const tooltipRef = useRef<TooltipHandle>(null);
  const hoveredAreaRef = useRef<string | null>(null);
  const selectedAreaRef = useRef<string | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // تُقرأ مرة عند التركيب: خيارات الإنشاء لا تتغير بعده في Mapbox.
  const [theme] = useState(readTheme);
  const [endSide] = useState<"left" | "right">(() =>
    document.documentElement.dir === "rtl" ? "left" : "right",
  );
  const [initialViewState] = useState(() =>
    initialFocus
      ? { longitude: initialFocus.lng, latitude: initialFocus.lat, zoom: POINT_ZOOM }
      : { bounds: SYRIA_BOUNDS, fitBoundsOptions: { padding: 24 } },
  );

  const styles = useMemo(() => layerStyles(theme), [theme]);
  const locale = useMemo(() => ({ ...MAP_LOCALE, "Map.Title": label }), [label]);
  const customAttribution = attribution
    ? `${RTL_ISOLATE}${escapeHtml(attribution)}${POP_ISOLATE}`
    : undefined;

  const areasById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
  const pointsById = useMemo(
    () => new Map((points ?? []).map((point) => [point.siteId, point])),
    [points],
  );

  const areasData = useMemo<FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: areas
        .filter((area) => area.boundary)
        .map((area) => ({
          type: "Feature",
          geometry: area.boundary as Geometry,
          properties: { id: area.id },
        })),
    }),
    [areas],
  );

  /**
   * قناع يغطي ما حول سورية: إطار واسع وثقوبه حدود البلد، فتختفي تفاصيل
   * الجوار. الإذابة تمرّ على ثمانية وعشرين ألف رأس، فتُحسب مرة لكل تحميل.
   * والمصدر قائم دائمًا ولو فارغًا، كي تبقى طبقاته تحت المحافظات مهما
   * تأخّر وصول الحدود.
   */
  const maskData = useMemo<Feature<Polygon> | FeatureCollection>(() => {
    const outline = buildOutline(areas);

    return outline.length
      ? {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [MASK_FRAME, ...outline] },
        }
      : EMPTY;
  }, [areas]);

  const pointsData = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: (points ?? []).map((point) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lng, point.lat] },
        properties: { siteId: point.siteId, kind: point.kind },
      })),
    }),
    [points],
  );

  const hasPoints = Boolean(points);
  const interactiveLayerIds = useMemo(
    () => (picking || compact ? [] : [AREA_FILL, ...(hasPoints ? [CLUSTERS, POINTS] : [])]),
    [picking, compact, hasPoints],
  );

  const describe = useCallback(
    (feature: GeoJSONFeature): TooltipContent | null => {
      const properties = feature.properties ?? {};

      switch (feature.layer?.id) {
        case AREA_FILL: {
          const area = areasById.get(String(properties.id));

          return area
            ? {
                title: area.nameAr,
                detail: `${countAr(area.campaignCount, CAMPAIGNS)} · ${countAr(area.greenPointCount, GREEN_POINTS)}`,
              }
            : null;
        }
        case POINTS: {
          const point = pointsById.get(String(properties.siteId));

          if (!point) return null;

          const kind = POINT_KIND_LABELS[point.kind];

          return {
            title: point.initiativeNameAr,
            detail: point.siteNameAr === point.initiativeNameAr ? kind : `${kind} · ${point.siteNameAr}`,
          };
        }
        case CLUSTERS:
          return {
            title: countAr(Number(properties.point_count), POINT_COUNT),
            detail: "انقر للتقريب",
          };
        default:
          return null;
      }
    },
    [areasById, pointsById],
  );

  const clearHover = useCallback(() => {
    const map = mapRef.current;

    if (map && hoveredAreaRef.current && map.getSource(AREAS_SOURCE)) {
      map.setFeatureState({ source: AREAS_SOURCE, id: hoveredAreaRef.current }, { hover: false });
    }

    hoveredAreaRef.current = null;
    tooltipRef.current?.hide();
  }, []);

  /**
   * المرور يُدار بـ`feature-state` لا بحالة React: تمريرة الماوس تغيّر
   * لون المضلّع داخل Mapbox وحده، بلا إعادة تصيير ولا إعادة بناء للمصادر.
   */
  const onMouseMove = useCallback(
    (event: MapMouseEvent) => {
      const map = mapRef.current;

      // أثناء تحديد الموقع يبقى مؤشر التقاطع، فلا يمسّه المرور. وأثناء
      // الحركة تنزلق المعالم تحت مؤشر ثابت، فالتلميح يُخفى حتى تتوقف.
      if (!map || picking || compact || map.isMoving()) return;

      const feature = event.features?.[0];
      const areaId =
        feature?.layer?.id === AREA_FILL ? String(feature.properties?.id ?? "") || null : null;

      if (areaId !== hoveredAreaRef.current) {
        if (hoveredAreaRef.current) {
          map.setFeatureState({ source: AREAS_SOURCE, id: hoveredAreaRef.current }, { hover: false });
        }
        if (areaId) map.setFeatureState({ source: AREAS_SOURCE, id: areaId }, { hover: true });
        hoveredAreaRef.current = areaId;
      }

      map.getCanvas().style.cursor = feature ? "pointer" : "";

      const content = feature ? describe(feature) : null;

      if (content) tooltipRef.current?.show(event.point.x, event.point.y, content);
      else tooltipRef.current?.hide();
    },
    [picking, compact, describe],
  );

  const onClick = useCallback(
    (event: MapMouseEvent) => {
      if (picking) {
        onPick?.(rounded(event.lngLat));
        return;
      }

      const map = mapRef.current;
      const feature = event.features?.[0];

      if (!map || !feature) return;

      const properties = feature.properties ?? {};

      switch (feature.layer?.id) {
        case CLUSTERS: {
          // التجمّع يُفتح بالتقريب إلى أول مستوى تنفصل فيه نقاطه.
          const source = map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined;
          const [lng, lat] = (feature.geometry as Point).coordinates;

          source?.getClusterExpansionZoom(Number(properties.cluster_id), (error, zoom) => {
            if (!error && zoom != null) map.easeTo({ center: [lng, lat], zoom });
          });
          break;
        }
        case POINTS: {
          const point = pointsById.get(String(properties.siteId));
          if (point) onPointSelect?.(point);
          break;
        }
        case AREA_FILL: {
          const area = areasById.get(String(properties.id));
          if (area) onAreaSelect?.(area);
          break;
        }
      }
    },
    [picking, onPick, pointsById, areasById, onPointSelect, onAreaSelect],
  );

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();

    // الخريطة مسطّحة باتجاه الشمال دائمًا: الدوران لا يفيد قراءة المحافظات ويربك.
    map?.touchZoomRotate.disableRotation();
    map?.keyboard.disableRotation();
    setLoaded(true);
  }, []);

  const onError = useCallback((event: ErrorEvent) => {
    const status = (event.error as { status?: number } | undefined)?.status;

    if (status === 401 || status === 403) {
      setFailure(
        "رفض Mapbox رمز الوصول. تحقق من صلاحية الرمز، ومن أن عنوان اللوحة ضمن العناوين المسموح بها له.",
      );
    } else {
      console.error(event.error);
    }
  }, []);

  useEffect(() => {
    if (picking) clearHover();
  }, [picking, clearHover]);

  // الاختيار علامة على المعلم نفسه، ويُعاد وضعها إن استُبدلت بيانات المصدر.
  useEffect(() => {
    const map = mapRef.current;

    if (!loaded || !map || !map.getSource(AREAS_SOURCE)) return;

    const previous = selectedAreaRef.current;

    if (previous && previous !== selectedAreaId) {
      map.setFeatureState({ source: AREAS_SOURCE, id: previous }, { selected: false });
    }
    if (selectedAreaId) {
      map.setFeatureState({ source: AREAS_SOURCE, id: selectedAreaId }, { selected: true });
    }

    selectedAreaRef.current = selectedAreaId;
  }, [loaded, selectedAreaId, areasData]);

  // أحدث المحافظات دون أن يعيد وصول بيانات جديدة الطيرانَ إلى المختارة.
  const areasRef = useRef(areasById);
  useEffect(() => {
    areasRef.current = areasById;
  });

  useEffect(() => {
    const map = mapRef.current;
    const bbox = selectedAreaId ? bboxOf(areasRef.current.get(selectedAreaId)?.boundary) : null;

    if (loaded && map && bbox) map.fitBounds(bbox, { padding: 48, duration: 700 });
  }, [loaded, selectedAreaId]);

  const focusLat = focus?.lat;
  const focusLng = focus?.lng;

  useEffect(() => {
    const map = mapRef.current;

    if (!loaded || !map || focusLat === undefined || focusLng === undefined) return;

    map.flyTo({
      center: [focusLng, focusLat],
      zoom: Math.max(map.getZoom(), POINT_ZOOM),
      duration: 700,
    });
  }, [loaded, focusLat, focusLng]);

  return (
    // Mapbox يرسم أدواته وإسناده على افتراض اتجاه ltr، فالحاوية ltr
    // والنصوص العربية فوقها تعود إلى rtl صراحةً.
    <div
      dir="ltr"
      // خط اللوحة لأدوات Mapbox وإسنادها بدل Helvetica، فيُقرأ الإسناد العربي بخطها.
      className={cn(
        "relative size-full overflow-hidden bg-muted [&_.mapboxgl-map]:[font-family:inherit]",
        className,
      )}
    >
      <MapGL
        ref={mapRef}
        mapLib={mapboxgl}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        language="ar"
        locale={locale}
        // ضُبطت أعلى الوحدة بالإصدار 0.3.0؛ الافتراضي هنا 0.2.3.
        RTLTextPlugin={false}
        projection="mercator"
        initialViewState={initialViewState}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={MAX_BOUNDS}
        renderWorldCopies={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        maxPitch={0}
        cooperativeGestures={compact}
        customAttribution={customAttribution}
        interactiveLayerIds={interactiveLayerIds}
        cursor={picking ? "crosshair" : undefined}
        onLoad={onLoad}
        onError={onError}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseOut={clearHover}
        onMoveStart={clearHover}
      >
        {/* أدوات التقريب فعلٌ، فمكانها جهة النهاية. */}
        <NavigationControl position={`top-${endSide}`} showCompass={false} />

        <Source id={MASK_SOURCE} type="geojson" data={maskData}>
          <Layer {...styles.maskFill} />
          <Layer {...styles.maskLine} />
        </Source>

        <Source id={AREAS_SOURCE} type="geojson" data={areasData} promoteId="id">
          {compact ? null : <Layer {...styles.areaFill} />}
          <Layer {...styles.areaLine} />
        </Source>

        {points ? (
          <Source
            id={POINTS_SOURCE}
            type="geojson"
            data={pointsData}
            cluster
            clusterRadius={44}
            clusterMaxZoom={13}
          >
            <Layer {...styles.clusters} />
            <Layer {...styles.clusterCount} />
            <Layer
              {...styles.pointHalo}
              filter={["all", IS_POINT, ["==", ["get", "siteId"], selectedPointId ?? ""]]}
            />
            <Layer {...styles.points} />
          </Source>
        ) : null}

        {pin ? (
          <Marker
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="bottom"
            draggable={Boolean(onPinMove)}
            onDragEnd={(event) => onPinMove?.(rounded(event.lngLat))}
            style={{ cursor: onPinMove ? "grab" : "default" }}
          >
            <Pin />
          </Marker>
        ) : null}
      </MapGL>

      <HoverTooltip handle={tooltipRef} />

      {loaded ? null : (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-muted" aria-hidden />
      )}

      {failure ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6">
          <p dir="rtl" role="alert" className="max-w-md text-center text-sm">
            {failure}
          </p>
        </div>
      ) : null}
    </div>
  );
}
