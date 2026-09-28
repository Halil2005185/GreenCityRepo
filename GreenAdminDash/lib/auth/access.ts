"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useOffices } from "@/components/offices/office-options";
import type { Office } from "@/lib/api/invitations";
import { type CapabilityDefinition, listCapabilities } from "@/lib/api/roles";

import { type AuthUser, useAuth } from "./auth-context";

/**
 * مرآة قواعد التفويض في الخادم (`access/scope.ts` و`access/delegation.ts`)
 * لتعرض الواجهة ما يمكن فعله وحده: فرق يديرها المستخدم، وأدوار يستطيع
 * منحها فيها. الإخفاء تحسين تجربة لا حماية — الخادم يعيد الفحص.
 *
 * ما يخص عضوية قائمة بعينها لا يُعاد حسابه هنا: الخادم يرسل `canManage`
 * و`canCustomize` مع ملف العضو.
 */

/** القدرة العامة المقابلة لكل قدرة مقيّدة بمكتب. */
const ORG_WIDE_COUNTERPART: Record<string, string> = {
  "team.manage": "team.all",
};

export type OfficeScope = "ALL" | ReadonlySet<string>;

function descendantsOf(offices: readonly Office[]) {
  const children = new Map<string, string[]>();

  for (const office of offices) {
    if (!office.parentId) continue;
    children.set(office.parentId, [...(children.get(office.parentId) ?? []), office.id]);
  }

  return (officeId: string) => {
    const found = new Set([officeId]);
    const queue = [officeId];

    while (queue.length > 0) {
      for (const child of children.get(queue.pop()!) ?? []) {
        if (!found.has(child)) {
          found.add(child);
          queue.push(child);
        }
      }
    }

    return found;
  };
}

export function officeScopeOf(
  user: AuthUser,
  capability: string,
  offices: readonly Office[],
): OfficeScope {
  const orgWide = ORG_WIDE_COUNTERPART[capability];

  if (orgWide && user.capabilities.includes(orgWide)) return "ALL";

  const descendants = descendantsOf(offices);
  const found = new Set<string>();

  for (const membership of user.memberships) {
    if (!membership.capabilities.includes(capability)) continue;

    for (const officeId of descendants(membership.officeId)) found.add(officeId);
  }

  return found;
}

export function canDelegate(
  user: AuthUser,
  capability: string,
  officeId: string | null,
  catalog: readonly CapabilityDefinition[],
  offices: readonly Office[],
): boolean {
  const definition = catalog.find((entry) => entry.key === capability);

  // قدرة ميتة: الخادم يتجاهلها، فلا تمنع شيئًا هنا.
  if (!definition) return true;

  if (definition.tier === "ADMIN" && !user.capabilities.includes("roles.manage")) {
    return false;
  }

  if (officeId !== null && definition.officeScoped) {
    const scope = officeScopeOf(user, capability, offices);

    return scope === "ALL" || scope.has(officeId);
  }

  return user.capabilities.includes(capability);
}

export function useCapabilityCatalog(enabled = true) {
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: listCapabilities,
    enabled,
    // الكتالوج جزء من كود الخادم، لا يتغيّر إلا بنشر.
    staleTime: Infinity,
  });
}

/**
 * ما يستطيع المستخدم الحالي فعله في الفرق. `ready` تبقى `false` حتى
 * تصل المكاتب والكتالوج، وقبلها لا يُعرض فعل إداري بدل أن يُعرض ثم يختفي.
 */
export function useAccess() {
  const { user } = useAuth();
  const offices = useOffices();
  const catalog = useCapabilityCatalog(Boolean(user));

  return useMemo(() => {
    const officeList = offices.data ?? [];
    const definitions = catalog.data ?? [];
    const ready = Boolean(user && offices.data && catalog.data);
    const teamScope: OfficeScope = user
      ? officeScopeOf(user, "team.manage", officeList)
      : new Set<string>();

    return {
      ready,
      catalog: definitions,
      /** مكاتب يدير المستخدم أعضاءها، أو `ALL`. */
      teamScope,
      managesAnyTeam: teamScope === "ALL" || teamScope.size > 0,
      canManageOffice: (officeId: string) =>
        teamScope === "ALL" || teamScope.has(officeId),
      /** هل يستطيع منح كل قدرات هذه الحزمة في هذا المكتب؟ */
      canDelegateAll: (capabilities: readonly string[], officeId: string | null) =>
        Boolean(user) &&
        capabilities.every((capability) =>
          canDelegate(user!, capability, officeId, definitions, officeList),
        ),
      canDelegate: (capability: string, officeId: string | null) =>
        Boolean(user) && canDelegate(user!, capability, officeId, definitions, officeList),
    };
  }, [user, offices.data, catalog.data]);
}
