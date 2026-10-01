import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type MapArea = components["schemas"]["MapArea"];
export type MapPoint = components["schemas"]["MapPoint"];

export const POINT_KIND_LABELS = {
  CAMPAIGN: "حملة تشجير",
  GREEN_POINT: "نقطة خضراء",
} as const;

export function listMapAreas() {
  return apiFetch<{ data: MapArea[]; attribution: string }>("/admin/map/areas");
}

export function listMapPoints(filters: { kind?: string; areaId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.areaId) params.set("areaId", filters.areaId);
  const query = params.toString();

  return apiFetch<{ data: MapPoint[] }>(
    `/admin/map/points${query ? `?${query}` : ""}`,
  ).then((response) => response.data);
}

/**
 * حذف نقطة خضراء وُثّقت خطأً — تُمحى هي وموقعها وقيود أثرها.
 * الحملات لا تُحذف من هنا؛ لها الإلغاء من صفحتها.
 */
export function deleteGreenPoint(siteId: string) {
  return apiFetch<void>(`/admin/map/green-points/${siteId}`, {
    method: "DELETE",
  });
}

export function createGreenPoint(body: {
  nameAr: string;
  contributorNameAr: string;
  contributorKindId?: string;
  areaId?: string;
  lat: number;
  lng: number;
  storyAr?: string;
  coverImageUrl?: string;
  metricId?: string;
  metricValue?: number;
}) {
  return apiFetch<MapPoint>("/admin/map/green-points", {
    method: "POST",
    body,
  });
}
