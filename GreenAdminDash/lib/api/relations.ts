import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type MediaChannel = components["schemas"]["MediaChannel"];
export type RelationshipType = components["schemas"]["RelationshipType"];

/**
 * مرجعيتان بشكل واحد، فالنداءات مولَّدة على القطعة من المسار. النوعان
 * منفصلان في العقد كي لا يقبل المترجم تمرير معرّف أحدهما مكان الآخر.
 */
type CatalogSegment = "media-channels" | "relationship-types";

export type CatalogBody = {
  slug: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  displayOrder?: number;
};

function listCatalog<T>(segment: CatalogSegment, includeInactive = false) {
  const query = includeInactive ? "?includeInactive=true" : "";

  return apiFetch<{ data: T[] }>(`/admin/relations/${segment}${query}`).then(
    (response) => response.data,
  );
}

export function listMediaChannels(includeInactive = false) {
  return listCatalog<MediaChannel>("media-channels", includeInactive);
}

export function listRelationshipTypes(includeInactive = false) {
  return listCatalog<RelationshipType>("relationship-types", includeInactive);
}

export function createCatalogEntry(segment: CatalogSegment, body: CatalogBody) {
  return apiFetch<MediaChannel>(`/admin/relations/${segment}`, {
    method: "POST",
    body,
  });
}

export function updateCatalogEntry(
  segment: CatalogSegment,
  id: string,
  body: Partial<Omit<CatalogBody, "slug">> & { isActive?: boolean },
) {
  return apiFetch<MediaChannel>(`/admin/relations/${segment}/${id}`, {
    method: "PATCH",
    body,
  });
}

export const CATALOG_LABELS = {
  "media-channels": {
    title: "أشكال العمل الإعلامي",
    hint: "بأي شكل يعمل الشخص أو الجهة: سؤال شارع، ريبورتاج، بودكاست…",
    singular: "شكل عمل",
  },
  "relationship-types": {
    title: "أنواع العلاقة",
    hint: "طبيعة العلاقة عمليًا. غير نوع الشراكة الذي يحدده الميثاق.",
    singular: "نوع علاقة",
  },
} as const satisfies Record<
  CatalogSegment,
  { title: string; hint: string; singular: string }
>;

export type { CatalogSegment };
