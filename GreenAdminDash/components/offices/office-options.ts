"use client";

import { useQuery } from "@tanstack/react-query";

import type { SelectOption } from "@/components/ui/select";
import { listOffices, type Office } from "@/lib/api/invitations";

/**
 * المكاتب بتدرّجها: الفرعي تحت أبيه بمسافة بادئة، لا بشرطة تُلصق باسمه.
 * المعطّل لا يُدعى إليه، فلا يظهر.
 */
export function officeOptions(offices: readonly Office[]): SelectOption[] {
  const active = offices.filter((office) => office.isActive);
  const children = new Map<string | null, Office[]>();

  for (const office of active) {
    const parent = office.parentId && active.some((item) => item.id === office.parentId) ? office.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), office]);
  }

  const options: SelectOption[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const office of (children.get(parent) ?? []).sort((a, b) => a.displayOrder - b.displayOrder)) {
      options.push({ value: office.id, label: office.nameAr, depth });
      walk(office.id, depth + 1);
    }
  };

  walk(null, 0);

  return options;
}

export function useOffices() {
  return useQuery({ queryKey: ["offices"], queryFn: listOffices, staleTime: 5 * 60 * 1000 });
}
