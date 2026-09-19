import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import { users } from '../../src/db/schema/identity.js'
import { metrics } from '../../src/db/schema/metrics.js'
import { roles } from '../../src/db/schema/org.js'
import { programs } from '../../src/db/schema/programs.js'
import { mediaChannels } from '../../src/db/schema/relations.js'
import { syncSystemData } from '../../src/db/seed.js'
import {
  closeTestDatabase,
  ensureTestDatabase,
  resetDatabase,
} from '../helpers/database.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

async function roleCapabilities(slug: string) {
  const [row] = await db
    .select({ capabilities: roles.capabilities })
    .from(roles)
    .where(eq(roles.slug, slug))
    .limit(1)

  if (!row) throw new Error(`Seed role "${slug}" is missing.`)

  return row.capabilities
}

/**
 * المزامنة تُشغَّل في كل نشر بلا إنسان يراقبها، فكل ضمانة هنا عطلٌ صامت
 * في الإنتاج لو انكسرت: حساب يُنشأ بكلمة مرور في سجل، أو تعديل للفريق
 * يُمحى مع كل دمج، أو قدرة تُمنح بلا أثر.
 */
describe.runIf(ready)('deploy-time sync', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('never creates an account, even on an empty database', async () => {
    await syncSystemData()
    await syncSystemData()

    const accounts = await db.select({ id: users.id }).from(users)

    expect(accounts).toHaveLength(0)
  })

  it('is idempotent — a second run changes nothing and audits nothing', async () => {
    const first = await syncSystemData()
    const second = await syncSystemData()

    expect([...second.roleIds]).toEqual([...first.roleIds])
    expect([...second.reference.mediaChannelIds]).toEqual([
      ...first.reference.mediaChannelIds,
    ])

    const drift = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'role.capabilities_synced'))

    expect(drift).toHaveLength(0)
  })

  it('keeps what the team edited from the dashboard', async () => {
    const { reference } = await syncSystemData()

    const metricId = reference.metricIds.values().next().value!
    const programId = reference.programIds.values().next().value!
    const channelId = reference.mediaChannelIds.get('street-interview')!

    await db
      .update(metrics)
      .set({ nameAr: 'اسم عدّله الفريق', displayOrder: 999 })
      .where(eq(metrics.id, metricId))
    await db
      .update(programs)
      .set({ nameAr: 'برنامج بصياغة الفريق' })
      .where(eq(programs.id, programId))
    await db
      .update(mediaChannels)
      .set({ nameAr: 'سؤال الشارع', isActive: false })
      .where(eq(mediaChannels.id, channelId))

    await syncSystemData()

    const [metric] = await db
      .select()
      .from(metrics)
      .where(eq(metrics.id, metricId))
    const [program] = await db
      .select()
      .from(programs)
      .where(eq(programs.id, programId))
    const [channel] = await db
      .select()
      .from(mediaChannels)
      .where(eq(mediaChannels.id, channelId))

    expect(metric).toMatchObject({ nameAr: 'اسم عدّله الفريق', displayOrder: 999 })
    expect(program?.nameAr).toBe('برنامج بصياغة الفريق')
    expect(channel).toMatchObject({ nameAr: 'سؤال الشارع', isActive: false })
  })

  it('restores a missing reference row without duplicating the rest', async () => {
    const { reference } = await syncSystemData()
    const before = await db.select({ id: mediaChannels.id }).from(mediaChannels)

    await db
      .delete(mediaChannels)
      .where(eq(mediaChannels.id, reference.mediaChannelIds.get('podcast')!))

    const again = await syncSystemData()
    const after = await db.select({ id: mediaChannels.id }).from(mediaChannels)

    expect(after).toHaveLength(before.length)
    expect(again.reference.mediaChannelIds.get('podcast')).toBeDefined()
  })

  it('brings role capabilities back to the code and audits the grant', async () => {
    await syncSystemData()

    const seeded = await roleCapabilities('RELATIONSHIPS')

    expect(seeded).toContain('media.view')

    // انحراف: قاعدة سبقت إضافة القدرة إلى الكود — حال الإنتاج قبل هذا التغيير.
    await db
      .update(roles)
      .set({
        capabilities: seeded.filter(
          (capability) => capability !== 'media.view',
        ),
      })
      .where(eq(roles.slug, 'RELATIONSHIPS'))

    await syncSystemData()

    expect(await roleCapabilities('RELATIONSHIPS')).toContain('media.view')

    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'role.capabilities_synced'),
          eq(auditLogs.actorType, 'SYSTEM'),
        ),
      )

    expect(entry).toMatchObject({
      severity: 'WARNING',
      entityType: 'role',
      metadata: { added: ['media.view'], removed: [] },
    })
  })

  it('audits a pure revocation at a lower severity', async () => {
    await syncSystemData()

    const seeded = await roleCapabilities('MEMBER')

    await db
      .update(roles)
      .set({ capabilities: [...seeded, 'audit.view'] })
      .where(eq(roles.slug, 'MEMBER'))

    await syncSystemData()

    expect(await roleCapabilities('MEMBER')).not.toContain('audit.view')

    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'role.capabilities_synced'))

    expect(entry).toMatchObject({
      severity: 'NOTICE',
      metadata: { added: [], removed: ['audit.view'] },
    })
  })
})
