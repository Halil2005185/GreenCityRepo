import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { and, eq, inArray, isNull } from 'drizzle-orm'

import { db } from './client.js'
import { areas } from './schema/geo.js'
import { metrics } from './schema/metrics.js'
import { programs } from './schema/programs.js'
import { mediaChannels, relationshipTypes } from './schema/relations.js'
import { workTemplates } from './schema/work.js'
import {
  GOVERNORATE_SEEDS,
  METRIC_SEEDS,
  PROGRAM_SEEDS,
  TREE_PLANTING_TEMPLATE,
} from './seed-operational.js'
import {
  type CatalogSeed,
  MEDIA_CHANNEL_SEEDS,
  RELATIONSHIP_TYPE_SEEDS,
} from './seed-relations.js'

/**
 * بذر البيانات المرجعية للتشغيل. يُشغَّل بعد الترحيل في كل نشر، فالقاعدة
 * الحاكمة هي من يملك الصف بعد إنشائه:
 *
 * - ما لا تحرّره اللوحة — حدود المحافظات من ملف البيانات — يملكه الكود،
 *   فيُحدَّث عند التعارض وتصل أي تصحيحات إلى الإنتاج بالدمج وحده.
 * - ما تحرّره اللوحة — البرامج والمؤشرات ومرجعيات العلاقات — تملكه القاعدة
 *   بعد إنشائه، فيُدرج الناقص منه ولا يُمَس الموجود. التحديث عند التعارض
 *   كان سيمحو في كل نشر ما عدّله الفريق من اسم أو ترتيب، بصمت.
 *
 * تصحيح اسم مرجعي موجود مكانه اللوحة لا هذا الملف.
 */

type OwnedByDatabase =
  | typeof programs
  | typeof metrics
  | typeof mediaChannels
  | typeof relationshipTypes

/**
 * معرّفات الصفوف بالـslug بعد إدراج الناقص.
 *
 * `onConflictDoNothing` لا يعيد الصفوف الموجودة في `returning`، فالقراءة
 * بعد الإدراج هي الطريقة الوحيدة لمعرفة معرّف ما لم يُدرج الآن.
 */
async function idsBySlug(
  table: OwnedByDatabase,
  seeds: readonly { slug: string }[],
) {
  const slugs = seeds.map((seed) => seed.slug)

  const rows = await db
    .select({ id: table.id, slug: table.slug })
    .from(table)
    .where(inArray(table.slug, slugs))

  const bySlug = new Map(rows.map((row) => [row.slug, row.id]))
  const missing = slugs.filter((slug) => !bySlug.has(slug))

  if (missing.length > 0) {
    throw new Error(`Seed rows missing after insert: ${missing.join(', ')}`)
  }

  return bySlug
}

/**
 * حدود المحافظات من geoBoundaries — المصدر UN OCHA، برخصة CC BY 3.0 IGO
 * التي تفرض نسب المصدر (يظهر في حاشية الخريطة).
 *
 * يُقرأ نسبةً إلى هذا الملف لا إلى مجلد التنفيذ، فلا يتعلّق نجاح البذر
 * بالمكان الذي شُغّل منه الأمر.
 */
function loadBoundaries() {
  const path = fileURLToPath(new URL('./data/syria-adm1.json', import.meta.url))
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    features: Array<{
      properties: { iso: string }
      geometry: Record<string, unknown>
    }>
  }

  return new Map(
    parsed.features.map((feature) => [feature.properties.iso, feature.geometry]),
  )
}

export async function seedGovernorates() {
  const bySlug = new Map<string, string>()
  const boundaries = loadBoundaries()

  for (const governorate of GOVERNORATE_SEEDS) {
    // المحافظة جذر: لا أب، والعمق صفر، والمسار هو الـslug وحده.
    const [row] = await db
      .insert(areas)
      .values({
        slug: governorate.slug,
        nameAr: governorate.nameAr,
        nameEn: governorate.nameEn,
        level: 'GOVERNORATE',
        depth: 0,
        path: governorate.slug,
        centerLat: String(governorate.centerLat),
        centerLng: String(governorate.centerLng),
        boundary: boundaries.get(governorate.iso) ?? null,
      })
      .onConflictDoUpdate({
        target: areas.path,
        set: {
          nameAr: governorate.nameAr,
          nameEn: governorate.nameEn,
          centerLat: String(governorate.centerLat),
          centerLng: String(governorate.centerLng),
          boundary: boundaries.get(governorate.iso) ?? null,
        },
      })
      .returning({ id: areas.id })

    if (!row) throw new Error(`Failed to upsert governorate "${governorate.slug}".`)

    bySlug.set(governorate.slug, row.id)
  }

  return bySlug
}

/** تحرّرها اللوحة (`PATCH /admin/programs/:id`)، فتُدرج ولا تُحدَّث. */
export async function seedPrograms() {
  await db
    .insert(programs)
    .values(
      PROGRAM_SEEDS.map((program) => ({
        slug: program.slug,
        nameAr: program.nameAr,
        nameEn: program.nameEn,
        descriptionAr: program.descriptionAr,
        defaultTargetRollup: program.defaultTargetRollup,
        displayOrder: program.displayOrder,
      })),
    )
    .onConflictDoNothing({ target: programs.slug })

  return idsBySlug(programs, PROGRAM_SEEDS)
}

/** تحرّرها اللوحة (`PATCH /admin/metrics/:id`)، فتُدرج ولا تُحدَّث. */
export async function seedMetrics() {
  await db
    .insert(metrics)
    .values(
      METRIC_SEEDS.map((metric) => ({
        slug: metric.slug,
        nameAr: metric.nameAr,
        nameEn: metric.nameEn,
        unitAr: metric.unitAr,
        aggregation: metric.aggregation,
        decimals: metric.decimals,
        displayOrder: metric.displayOrder,
        ...(metric.descriptionAr ? { descriptionAr: metric.descriptionAr } : {}),
      })),
    )
    .onConflictDoNothing({ target: metrics.slug })

  return idsBySlug(metrics, METRIC_SEEDS)
}

/**
 * قوالب برنامج التشجير.
 *
 * لا يوجد مفتاح طبيعي للقالب، فإعادة البذر تتخطّى البرنامج الذي يملك
 * قوالب أصلًا بدل مضاعفتها — والفريق قد يكون عدّلها من الشاشة.
 */
export async function seedTreePlantingTemplates(programId: string, officeIds: Map<string, string>) {
  const [existing] = await db
    .select({ id: workTemplates.id })
    .from(workTemplates)
    .where(eq(workTemplates.programId, programId))
    .limit(1)

  if (existing) return 0

  let inserted = 0
  let order = 0

  for (const milestone of TREE_PLANTING_TEMPLATE) {
    order += 10

    const [milestoneRow] = await db
      .insert(workTemplates)
      .values({
        programId,
        kind: 'MILESTONE',
        titleAr: milestone.titleAr,
        dueOffsetDays: milestone.dueOffsetDays,
        displayOrder: order,
        ...(milestone.officeSlug && officeIds.get(milestone.officeSlug)
          ? { defaultOfficeId: officeIds.get(milestone.officeSlug) }
          : {}),
      })
      .returning({ id: workTemplates.id })

    if (!milestoneRow) throw new Error('Failed to insert milestone template.')

    inserted += 1
    let taskOrder = 0

    for (const task of milestone.tasks ?? []) {
      taskOrder += 10

      await db.insert(workTemplates).values({
        programId,
        parentId: milestoneRow.id,
        kind: 'TASK',
        titleAr: task.titleAr,
        dueOffsetDays: task.dueOffsetDays,
        priority: task.priority ?? 'NORMAL',
        displayOrder: taskOrder,
        ...(task.officeSlug && officeIds.get(task.officeSlug)
          ? { defaultOfficeId: officeIds.get(task.officeSlug) }
          : {}),
      })

      inserted += 1
    }
  }

  return inserted
}

/**
 * مرجعيات العلاقات — الجدولان متطابقا الشكل، فدالة واحدة تخدمهما.
 *
 * يحرّرهما مكتب العلاقات من شاشة المرجعيات، فتُدرج المفردة الناقصة ولا
 * يُمَس الموجود: لا اسم أعاد المكتب صياغته، ولا مفردة عطّلها قصدًا.
 */
async function seedCatalog(
  table: typeof mediaChannels | typeof relationshipTypes,
  seeds: readonly CatalogSeed[],
) {
  await db
    .insert(table)
    .values(
      seeds.map((seed) => ({
        slug: seed.slug,
        nameAr: seed.nameAr,
        nameEn: seed.nameEn,
        displayOrder: seed.displayOrder,
        ...(seed.descriptionAr ? { descriptionAr: seed.descriptionAr } : {}),
      })),
    )
    .onConflictDoNothing({ target: table.slug })

  return idsBySlug(table, seeds)
}

export type ReferenceSeedResult = {
  areaIds: Map<string, string>
  programIds: Map<string, string>
  metricIds: Map<string, string>
  mediaChannelIds: Map<string, string>
  relationshipTypeIds: Map<string, string>
  templateCount: number
}

export async function seedReferenceData(
  officeIds: Map<string, string>,
): Promise<ReferenceSeedResult> {
  const areaIds = await seedGovernorates()
  const programIds = await seedPrograms()
  const metricIds = await seedMetrics()
  const mediaChannelIds = await seedCatalog(mediaChannels, MEDIA_CHANNEL_SEEDS)
  const relationshipTypeIds = await seedCatalog(
    relationshipTypes,
    RELATIONSHIP_TYPE_SEEDS,
  )

  const treePlantingId = programIds.get('tree-planting')
  const templateCount = treePlantingId
    ? await seedTreePlantingTemplates(treePlantingId, officeIds)
    : 0

  return {
    areaIds,
    programIds,
    metricIds,
    mediaChannelIds,
    relationshipTypeIds,
    templateCount,
  }
}

/** يُستدعى من الاختبارات التي تحتاج مرجعيات دون بذر كامل. */
export async function findAreaBySlug(slug: string) {
  const [row] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.slug, slug), isNull(areas.parentId)))
    .limit(1)

  return row?.id ?? null
}
