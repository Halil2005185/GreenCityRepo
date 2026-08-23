import type { Position } from "geojson";

import type { MapArea } from "@/lib/api/map";

export type Ring = Position[];

/** ست منازل ≈ عشرة سنتيمترات: تكفي لمطابقة رؤوس الحدود المشتركة دون ضجيج الفاصلة العائمة. */
const PRECISION = 6;

function keyOf(point: Position) {
  return `${point[0].toFixed(PRECISION)},${point[1].toFixed(PRECISION)}`;
}

/** مفتاح الضلع لا يميّز اتجاهه: المحافظتان المتجاورتان ترسمانه معكوسًا. */
function edgeKeyOf(from: string, to: string) {
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

function ringsOf(geometry: unknown): Ring[] {
  const shape = geometry as { type?: unknown; coordinates?: unknown };

  if (shape?.type === "Polygon") return (shape.coordinates as Ring[]) ?? [];

  if (shape?.type === "MultiPolygon") {
    return ((shape.coordinates as Ring[][]) ?? []).flat();
  }

  return [];
}

/**
 * يذيب حدود المحافظات في حدّ البلد: كل ضلع داخلي ترسمه محافظتان فيرد مرتين
 * فيسقط، ولا يبقى إلا ما ورد مرة واحدة — وهو الحد الخارجي.
 *
 * أرخص من اتحاد مضلّعات عام ولا يضيف اعتمادًا، ويصحّ هنا لأن حدود
 * geoBoundaries تتشارك رؤوسها بالضبط. وتسقط معها حلقة دمشق: ثقبٌ في ريف
 * دمشق ومضلّعٌ للمدينة، فترد مرتين وتبقى المدينة مكشوفة داخل القناع.
 */
function dissolve(rings: Ring[]): Ring[] {
  const edges = new Map<string, number>();
  const vertices = new Map<string, Position>();

  for (const ring of rings) {
    for (let index = 0; index + 1 < ring.length; index += 1) {
      const from = keyOf(ring[index]);
      const to = keyOf(ring[index + 1]);
      const edge = edgeKeyOf(from, to);

      vertices.set(from, ring[index]);
      vertices.set(to, ring[index + 1]);
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }

  const neighbours = new Map<string, string[]>();

  for (const [key, count] of edges) {
    if (count !== 1) continue;

    const [from, to] = key.split("|");

    for (const [vertex, other] of [
      [from, to],
      [to, from],
    ]) {
      const linked = neighbours.get(vertex);

      if (linked) linked.push(other);
      else neighbours.set(vertex, [other]);
    }
  }

  // خياطة الأضلاع الباقية حلقاتٍ مغلقة: البرّ الرئيس حلقة، وجزيرة أرواد أخرى.
  const visited = new Set<string>();
  const outline: Ring[] = [];

  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue;

    const path = [start];
    visited.add(start);

    for (let current = start; ; ) {
      const next = (neighbours.get(current) ?? []).find(
        (candidate) => !visited.has(candidate),
      );

      if (!next) break;

      visited.add(next);
      path.push(next);
      current = next;
    }

    // ثلاثة رؤوس فأقل ليست مساحة؛ والإغلاق بإعادة أول رأس إلى آخر الحلقة.
    if (path.length < 4) continue;

    outline.push([...path, start].map((key) => vertices.get(key) ?? [0, 0]));
  }

  return outline;
}

/**
 * حدود سورية الخارجية: حلقة للبرّ وأخرى لجزيرة أرواد.
 *
 * تُبنى من حدود المحافظات نفسها لا من ملف حدودٍ ثانٍ، فلا تتخلّف عن البيانات
 * إن عُدّلت. وتُستعمل ثقوبًا في قناع يغطي ما حولها، فتختفي تفاصيل الجوار.
 */
export function buildOutline(areas: MapArea[]): Ring[] {
  return dissolve(areas.flatMap((area) => ringsOf(area.boundary)));
}
