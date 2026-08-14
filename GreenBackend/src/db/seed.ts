import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '../common/utils/text.js'
import {
  assertKnownCapabilities,
  capabilitiesMatchScope,
} from '../modules/access/capabilities.js'
import { recordAudit } from '../modules/audit/audit.service.js'
import { hashPassword } from '../modules/auth/password.service.js'
import { db } from './client.js'
import { memberships } from './schema/access.js'
import { users } from './schema/identity.js'
import { offices, roles } from './schema/org.js'
import { OFFICE_SEEDS, ROLE_SEEDS, resolveSeedCapabilities } from './seed-data.js'
import { type ReferenceSeedResult, seedReferenceData } from './seed-reference.js'

/**
 * بذرة قابلة لإعادة التشغيل.
 *
 * تُحدَّث الأسماء والقدرات في كل تشغيل، ولا يُلمس ما يملكه المستخدمون:
 * كلمة مرور المدير لا تُعاد كتابتها إن كان الحساب موجودًا، وعضويته لا
 * تُكرَّر. تشغيلها على قاعدة عاملة آمن.
 */

export type SeedOptions = {
  adminEmail?: string
  adminPassword?: string
  adminName?: string
  quiet?: boolean
}

export type SeedResult = {
  officeIds: Map<string, string>
  roleIds: Map<string, string>
  reference: ReferenceSeedResult
  admin: { email: string; userId: string; generatedPassword: string | null }
}

export async function seedOffices() {
  const bySlug = new Map<string, string>()

  // جولتان: المكاتب الجذرية أولًا حتى يوجد الأب قبل ابنه.
  const ordered = [
    ...OFFICE_SEEDS.filter((office) => !office.parentSlug),
    ...OFFICE_SEEDS.filter((office) => office.parentSlug),
  ]

  for (const office of ordered) {
    const parentId = office.parentSlug ? bySlug.get(office.parentSlug) : null

    if (office.parentSlug && !parentId) {
      throw new Error(
        `Office "${office.slug}" references unknown parent "${office.parentSlug}".`,
      )
    }

    const [row] = await db
      .insert(offices)
      .values({
        slug: office.slug,
        nameAr: office.nameAr,
        nameEn: office.nameEn,
        descriptionAr: office.descriptionAr,
        displayOrder: office.displayOrder,
        parentId: parentId ?? null,
      })
      .onConflictDoUpdate({
        target: offices.slug,
        set: {
          nameAr: office.nameAr,
          nameEn: office.nameEn,
          descriptionAr: office.descriptionAr,
          displayOrder: office.displayOrder,
          parentId: parentId ?? null,
        },
      })
      .returning({ id: offices.id })

    if (!row) throw new Error(`Failed to upsert office "${office.slug}".`)

    bySlug.set(office.slug, row.id)
  }

  return bySlug
}

export async function seedRoles() {
  const bySlug = new Map<string, string>()

  for (const role of ROLE_SEEDS) {
    const capabilities = assertKnownCapabilities([
      ...resolveSeedCapabilities(role),
    ])

    // يمنع تسرّب قدرة بوابة شريك إلى دور فريق أو العكس.
    if (!capabilitiesMatchScope(role.scope, capabilities)) {
      throw new Error(
        `Role "${role.slug}" carries capabilities outside its ${role.scope} scope.`,
      )
    }

    const [row] = await db
      .insert(roles)
      .values({
        slug: role.slug,
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        descriptionAr: role.descriptionAr,
        scope: role.scope,
        displayOrder: role.displayOrder,
        capabilities: [...capabilities],
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.slug,
        set: {
          nameAr: role.nameAr,
          nameEn: role.nameEn,
          descriptionAr: role.descriptionAr,
          scope: role.scope,
          displayOrder: role.displayOrder,
          capabilities: [...capabilities],
        },
      })
      .returning({ id: roles.id })

    if (!row) throw new Error(`Failed to upsert role "${role.slug}".`)

    bySlug.set(role.slug, row.id)
  }

  return bySlug
}

export async function runSeed(options: SeedOptions = {}): Promise<SeedResult> {
  const officeIds = await seedOffices()
  const roleIds = await seedRoles()
  const reference = await seedReferenceData(officeIds)

  const requestedEmail = options.adminEmail ?? process.env['SEED_ADMIN_EMAIL']
  const fullNameAr =
    options.adminName ?? process.env['SEED_ADMIN_NAME'] ?? 'المدير العام'

  const officeId = officeIds.get('general-admin')
  const roleId = roleIds.get('GENERAL_ADMIN')

  if (!officeId || !roleId) {
    throw new Error('General administration office or role is missing.')
  }

  /**
   * البريد الافتراضي لا يُستعمل إلا على قاعدة بلا مستخدمين.
   *
   * بدون هذا الشرط كانت إعادة البذر لتحديث المرجعيات تُنشئ حساب
   * `admin@greencities.local` بجانب حساب الفريق الحقيقي — وهو بالضبط
   * نوع المخلّفات التي يفترض أن ينظفها `db:reset` لا أن يزرعها.
   */
  if (!requestedEmail) {
    const [anyStaff] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.kind, 'STAFF'))
      .limit(1)

    if (anyStaff) {
      return {
        officeIds,
        roleIds,
        reference,
        admin: { email: '', userId: anyStaff.id, generatedPassword: null },
      }
    }
  }

  const email = normalizeEmail(requestedEmail ?? 'admin@greencities.local')

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing) {
    await db
      .insert(memberships)
      .values({ userId: existing.id, officeId, roleId, isPrimary: true })
      .onConflictDoNothing()

    return {
      officeIds,
      roleIds,
      reference,
      admin: { email, userId: existing.id, generatedPassword: null },
    }
  }

  /**
   * كلمة مرور عشوائية تُطبع مرة واحدة عند الإنشاء. تمريرها صراحةً مدعوم
   * للنشر الآلي وللاختبارات، لكن التوليد أفضل لأن القيمة لا تمر بملف
   * ولا بسجل أوامر الصدفة.
   */
  const explicitPassword =
    options.adminPassword ?? process.env['SEED_ADMIN_PASSWORD']
  const password = explicitPassword ?? randomBytes(15).toString('base64url')
  const passwordHash = await hashPassword(password)

  const userId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        fullNameAr,
        kind: 'STAFF',
        status: 'ACTIVE',
        jobTitleAr: 'المدير العام',
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id })

    if (!created) throw new Error('Failed to create the root admin user.')

    await tx.insert(memberships).values({
      userId: created.id,
      officeId,
      roleId,
      isPrimary: true,
    })

    await recordAudit(
      {
        action: 'seed.root_admin_created',
        actorType: 'SYSTEM',
        severity: 'WARNING',
        entityType: 'user',
        entityId: created.id,
        entityLabel: email,
        summaryAr: 'إنشاء حساب المدير العام من البذرة',
      },
      tx,
    )

    return created.id
  })

  return {
    officeIds,
    roleIds,
    reference,
    admin: {
      email,
      userId,
      generatedPassword: explicitPassword ? null : password,
    },
  }
}
