import { describe, expect, it } from 'vitest'

import {
  ALL_CAPABILITIES,
  CAPABILITY_CATALOG,
  PARTNER_CAPABILITIES,
  STAFF_CAPABILITIES,
  assertKnownCapabilities,
  canGrantRole,
  capabilitiesMatchScope,
  isCapability,
} from '../../src/modules/access/capabilities.js'
import { ROLE_SEEDS, resolveSeedCapabilities } from '../../src/db/seed-data.js'

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

  /** `roles.manage` عند التقني لا تجعله قادرًا على رفع أحد إلى المدير العام. */
  it('lets a role grant only roles within its own capabilities', () => {
    const bySlug = (slug: string) =>
      resolveSeedCapabilities(ROLE_SEEDS.find((role) => role.slug === slug)!)

    const tech = bySlug('TECH')
    const director = bySlug('GENERAL_ADMIN')

    expect(canGrantRole(tech, director)).toBe(false)
    expect(canGrantRole(tech, bySlug('OPERATIONS'))).toBe(false)
    expect(canGrantRole(tech, bySlug('MEMBER'))).toBe(true)
    expect(canGrantRole(director, director)).toBe(true)
    // قدرة ميتة في القاعدة لا تمنع المنح ولا تمنح شيئًا.
    expect(canGrantRole(['work.view'], ['work.view', 'gone.capability'])).toBe(true)
  })
})
