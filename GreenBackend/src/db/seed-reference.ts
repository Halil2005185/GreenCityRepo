import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from './client.js'
import { areas } from './schema/geo.js'
import { metrics } from './schema/metrics.js'
import { programs } from './schema/programs.js'
import { workTemplates } from './schema/work.js'
import {
  GOVERNORATE_SEEDS,
  METRIC_SEEDS,
  PROGRAM_SEEDS,
  TREE_PLANTING_TEMPLATE,
} from './seed-operational.js'

/**
 * بذر البيانات المرجعية للتشغيل. كلها `onConflictDoUpdate` على الـslug،
 * فإعادة التشغيل تحدّث الأسماء ولا تُكرّر الصفوف ولا تلمس ما بُني فوقها.
 */

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

export async function seedPrograms() {
  const bySlug = new Map<string, string>()

  for (const program of PROGRAM_SEEDS) {
    const [row] = await db
      .insert(programs)
      .values({
        slug: program.slug,
        nameAr: program.nameAr,
        nameEn: program.nameEn,
        descriptionAr: program.descriptionAr,
        defaultTargetRollup: program.defaultTargetRollup,
        displayOrder: program.displayOrder,
      })
      .onConflictDoUpdate({
        target: programs.slug,
        set: {
          nameAr: program.nameAr,
          nameEn: program.nameEn,
          descriptionAr: program.descriptionAr,
          defaultTargetRollup: program.defaultTargetRollup,
          displayOrder: program.displayOrder,
        },
      })
      .returning({ id: programs.id })

    if (!row) throw new Error(`Failed to upsert program "${program.slug}".`)

    bySlug.set(program.slug, row.id)
  }

  return bySlug
}

export async function seedMetrics() {
  const bySlug = new Map<string, string>()

  for (const metric of METRIC_SEEDS) {
    const [row] = await db
      .insert(metrics)
      .values({
        slug: metric.slug,
        nameAr: metric.nameAr,
        nameEn: metric.nameEn,
        unitAr: metric.unitAr,
        aggregation: metric.aggregation,
        decimals: metric.decimals,
        displayOrder: metric.displayOrder,
        ...(metric.descriptionAr ? { descriptionAr: metric.descriptionAr } : {}),
      })
      .onConflictDoUpdate({
        target: metrics.slug,
        set: {
          nameAr: metric.nameAr,
          nameEn: metric.nameEn,
          unitAr: metric.unitAr,
          aggregation: metric.aggregation,
          decimals: metric.decimals,
          displayOrder: metric.displayOrder,
        },
      })
      .returning({ id: metrics.id })

    if (!row) throw new Error(`Failed to upsert metric "${metric.slug}".`)

    bySlug.set(metric.slug, row.id)
  }

  return bySlug
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

export type ReferenceSeedResult = {
  areaIds: Map<string, string>
  programIds: Map<string, string>
  metricIds: Map<string, string>
  templateCount: number
}

export async function seedReferenceData(
  officeIds: Map<string, string>,
): Promise<ReferenceSeedResult> {
  const areaIds = await seedGovernorates()
  const programIds = await seedPrograms()
  const metricIds = await seedMetrics()

  const treePlantingId = programIds.get('tree-planting')
  const templateCount = treePlantingId
    ? await seedTreePlantingTemplates(treePlantingId, officeIds)
    : 0

  return { areaIds, programIds, metricIds, templateCount }
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
