import type { Position } from "geojson";

/** إحداثيات بترتيب الـAPI: خط العرض ثم الطول. Mapbox يقلبها `[lng, lat]`. */
export type Coordinates = { lat: number; lng: number };

/** `[[غرب، جنوب], [شرق، شمال]]` — الشكل الذي يأخذه `fitBounds`. */
export type Bbox = [[number, number], [number, number]];

/**
 * ست منازل عشرية ≈ عشرة سنتيمترات: دقة تفوق ما يميّزه نقر على الشاشة،
 * وتكفّ عن إرسال خمس عشرة منزلة من ضجيج الفاصلة العائمة إلى الخادم.
 */
export function rounded({ lat, lng }: Coordinates): Coordinates {
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (value === null || typeof value !== "object") return false;

  const { lat, lng } = value as Partial<Coordinates>;

  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** مضلّعات الهندسة كلها بحلقاتها: الأولى حدٌّ خارجي وما بعدها ثقوب. */
function polygonsOf(geometry: unknown): Position[][][] {
  const shape = geometry as { type?: unknown; coordinates?: unknown } | null;

  if (shape?.type === "Polygon") return [(shape.coordinates as Position[][]) ?? []];
  if (shape?.type === "MultiPolygon") return (shape.coordinates as Position[][][]) ?? [];

  return [];
}

export function bboxOf(geometry: unknown): Bbox | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const polygon of polygonsOf(geometry)) {
    // الحد الخارجي يكفي: الثقوب داخله دائمًا.
    for (const [lng, lat] of polygon[0] ?? []) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }

  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

/** اختبار الشعاع: كل عبور لضلع يقلب الحكم بين داخل وخارج. */
function ringContains(ring: Position[], [x, y]: Position) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * النقطة داخل الحد الخارجي وخارج ثقوبه. الثقوب ليست تفصيلًا هنا: دمشق
 * ثقبٌ في ريف دمشق، فبدونها تُنسب نقطة وسط المدينة إلى الريف.
 */
export function geometryContains(geometry: unknown, { lat, lng }: Coordinates) {
  const point: Position = [lng, lat];

  return polygonsOf(geometry).some(
    ([outer, ...holes]) =>
      Boolean(outer) && ringContains(outer, point) && !holes.some((hole) => ringContains(hole, point)),
  );
}

/** المحافظة التي تقع فيها النقطة، أو `null` خارج الحدود كلها. */
export function areaAt<TArea extends { boundary?: unknown }>(
  areas: readonly TArea[],
  location: Coordinates,
) {
  return areas.find((area) => geometryContains(area.boundary, location)) ?? null;
}
