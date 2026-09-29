import { describe, expect, it } from 'vitest'

import type { AuthContext } from '../../src/modules/access/access.service.js'
import {
  ADMIN_CAPABILITIES,
  ALL_CAPABILITIES,
  CAPABILITY_CATALOG,
  type Capability,
  PARTNER_CAPABILITIES,
  STAFF_CAPABILITIES,
  assertKnownCapabilities,
  capabilitiesMatchScope,
  effectiveCapabilities,
  isCapability,
} from '../../src/modules/access/capabilities.js'
import { canDelegate } from '../../src/modules/access/delegation.js'
import { ROLE_SEEDS, resolveSeedCapabilities } from '../../src/db/seed-data.js'

const bySlug = (slug: string) =>
  resolveSeedCapabilities(ROLE_SEEDS.find((role) => role.slug === slug)!)

/** سياق مصادقة مصطنع بلا قاعدة: القدرات ونطاقاتها وحدها ما يلزم القواعد. */
function actorWith(
  capabilities: readonly Capability[],
  officeScopes: Record<string, readonly string[]> = {},
): AuthContext {
  return {
    userId: 'actor',
    email: 'actor@greencities.test',
    fullNameAr: 'منفّذ',
    kind: 'STAFF',
    status: 'ACTIVE',
    tokenVersion: 0,
    capabilities,
    memberships: [],
    partner: null,
    officeScopes: new Map(
      Object.entries(officeScopes).map(([capability, offices]) => [
        capability as Capability,
        new Set(offices),
      ]),
    ),
  }
}

describe('capability catalog', () => {
  it('has no duplicate keys', () => {
    const keys = CAPABILITY_CATALOG.map((entry) => entry.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('splits cleanly into the two scopes', () => {
    expect(STAFF_CAPABILITIES.length + PARTNER_CAPABILITIES.length).toBe(
      ALL_CAPABILITIES.length,
    )
    expect(
      STAFF_CAPABILITIES.filter((key) => PARTNER_CAPABILITIES.includes(key)),
    ).toEqual([])
  })

  it('rejects unknown capabilities instead of ignoring them', () => {
    expect(isCapability('partners.approve')).toBe(true)
    expect(isCapability('partners.destroy-everything')).toBe(false)
    expect(() => assertKnownCapabilities(['users.view', 'nope'])).toThrow(
      /nope/,
    )
  })

  it('refuses a staff capability inside a partner role', () => {
    expect(capabilitiesMatchScope('PARTNER', ['partners.approve'])).toBe(false)
    expect(capabilitiesMatchScope('STAFF', ['partner.reports.view'])).toBe(false)
    expect(capabilitiesMatchScope('STAFF', ['partners.approve'])).toBe(true)
  })
})

/**
 * يمسك انحراف البذرة دون قاعدة بيانات: حذف قدرة من الكتالوج مع بقائها في
 * دور مبذور يفشل هنا فورًا بدل أن يمر بصمت إلى الإنتاج.
 */
describe('seeded roles', () => {
  it('only reference known capabilities within their scope', () => {
    for (const role of ROLE_SEEDS) {
      const capabilities = resolveSeedCapabilities(role)

      expect(() => assertKnownCapabilities([...capabilities])).not.toThrow()
      expect(
        capabilitiesMatchScope(role.scope, capabilities),
        `role ${role.slug} carries out-of-scope capabilities`,
      ).toBe(true)
    }
  })

  it('gives the general director every staff capability', () => {
    const director = ROLE_SEEDS.find((role) => role.slug === 'GENERAL_ADMIN')

    expect(director).toBeDefined()
    expect([...resolveSeedCapabilities(director!)].sort()).toEqual(
      [...STAFF_CAPABILITIES].sort(),
    )
  })

  /** قيد صريح من المحضر وPLAN.md: الاعتماد النهائي للمدير العام وحده. */
  it('keeps partner approval exclusive to the general director', () => {
    const holders = ROLE_SEEDS.filter((role) =>
      resolveSeedCapabilities(role).includes('partners.approve'),
    ).map((role) => role.slug)

    expect(holders).toEqual(['GENERAL_ADMIN'])
  })

  /** التقني يدير النظام ولا يعتمد قرارات تشغيلية أو يرى القيم المالية. */
  it('does not let the technology lead approve work or see financial values', () => {
    const tech = ROLE_SEEDS.find((role) => role.slug === 'TECH')
    const capabilities = resolveSeedCapabilities(tech!)

    expect(capabilities).toContain('users.manage')
    expect(capabilities).toContain('roles.manage')
    expect(capabilities).not.toContain('partners.approve')
    expect(capabilities).not.toContain('work.approve')
    expect(capabilities).not.toContain('contributions.verify')
    expect(capabilities).not.toContain('contributions.value.view')
    expect(capabilities).not.toContain('documents.confidential.view')
  })

  /** كل مسؤول فريق يدير فريقه، ودوره مرتبط بمكتبه. العضو دور عام بلا إدارة. */
  it('makes every lead a team manager of their own office', () => {
    for (const slug of ['RELATIONSHIPS', 'OPERATIONS', 'ADMIN_FINANCE', 'PEOPLE', 'MEDIA', 'TECH']) {
      const role = ROLE_SEEDS.find((seed) => seed.slug === slug)!

      expect(resolveSeedCapabilities(role), slug).toContain('team.manage')
      expect(role.officeSlug, slug).toBeDefined()
    }

    const member = ROLE_SEEDS.find((seed) => seed.slug === 'MEMBER')!

    expect(member.officeSlug).toBeUndefined()
    expect(
      bySlug('MEMBER').filter((capability) => ADMIN_CAPABILITIES.includes(capability)),
    ).toEqual([])
  })

  /** مسؤول شؤون الفريق يدعو الأعضاء، فيجب أن يحمل حزمة العضو كاملة. */
  it('lets the people lead delegate the member role', () => {
    const people = bySlug('PEOPLE')

    expect(bySlug('MEMBER').every((capability) => people.includes(capability))).toBe(true)
  })
})

describe('effective capabilities', () => {
  it('adds grants and removes revokes on top of the role bundle', () => {
    expect(
      effectiveCapabilities(
        ['work.view', 'work.manage', 'files.upload'],
        [
          { capability: 'media.view', effect: 'GRANT' },
          { capability: 'work.manage', effect: 'REVOKE' },
        ],
      ),
    ).toEqual(['files.upload', 'media.view', 'work.view'])
  })

  it('ignores dead capabilities in the role and in overrides', () => {
    expect(
      effectiveCapabilities(
        ['work.view', 'gone.capability'],
        [{ capability: 'also.gone', effect: 'GRANT' }],
      ),
    ).toEqual(['work.view'])
  })
})

describe('delegation', () => {
  const media = 'office-media'
  const operations = 'office-operations'

  it('lets a team manager delegate what they hold, not admin capabilities', () => {
    const lead = actorWith(bySlug('MEDIA'), { 'team.manage': [media] })

    expect(canDelegate(lead, 'media.view', media)).toBe(true)
    expect(canDelegate(lead, 'work.approve', media)).toBe(false)
    // لا يصنع مديرًا مثله ولا مشرفًا.
    expect(canDelegate(lead, 'team.manage', media)).toBe(false)
    expect(canDelegate(lead, 'audit.view', null)).toBe(false)
  })

  /** القدرة المقيّدة تُفوَّض حيث تُحمل: مدير الإعلام ليس مدير العمليات. */
  it('delegates office-scoped capabilities only inside the offices they apply to', () => {
    const admin = actorWith(['roles.manage', 'team.manage'], {
      'team.manage': [media],
    })

    expect(canDelegate(admin, 'team.manage', media)).toBe(true)
    expect(canDelegate(admin, 'team.manage', operations)).toBe(false)
  })

  it('treats the org-wide counterpart as holding the capability everywhere', () => {
    const director = actorWith(STAFF_CAPABILITIES)

    expect(canDelegate(director, 'team.manage', operations)).toBe(true)
    expect(canDelegate(director, 'partners.approve', null)).toBe(true)
  })

  /** `roles.manage` عند التقني لا تجعله قادرًا على منح ما لا يحمله. */
  it('keeps the tech lead from delegating what it does not hold', () => {
    const tech = actorWith(bySlug('TECH'), { 'team.manage': ['office-tech'] })

    expect(canDelegate(tech, 'audit.view', null)).toBe(true)
    expect(canDelegate(tech, 'partners.approve', null)).toBe(false)
    expect(canDelegate(tech, 'contributions.value.view', null)).toBe(false)
  })
})
