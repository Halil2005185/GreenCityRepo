import { randomBytes } from 'node:crypto'

import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../common/utils/db-errors.js'
import { nameKey, normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { type LookupValue, lookupLists, lookupValues } from '../../db/schema/lookups.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type { LookupRef } from './lookup-ref.schema.js'
import {
  LOOKUP_CODES,
  type LookupCode,
  canEditLookup,
  isLockedValue,
  isLookupCode,
  isSystemValue,
  lookupDefinition,
} from './lookups.registry.js'
import type * as dto from './lookups.schemas.js'

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── القيم على السجلات ──────────────────────────────────────────────────

/**
 * مراجع كل القيم التي تحملها صفحة من السجلات، في استعلام واحد.
 *
 * بديل عن `join` على `lookup_values` لكل عمود: جهة واحدة تحمل أربع قيم
 * (النوع والأولوية والأفق ونوع العلاقة)، وأربعة أسماء مستعارة للجدول نفسه
 * في كل استعلام قائمة تجعله أطول بلا فائدة.
 */
export async function lookupRefs(
  ids: Iterable<string | null | undefined>,
  tx: Executor = db,
): Promise<Map<string, LookupRef>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))]

  if (unique.length === 0) return new Map()

  const rows = await tx
    .select({
      id: lookupValues.id,
      code: lookupValues.code,
      nameAr: lookupValues.nameAr,
      isActive: lookupValues.isActive,
    })
    .from(lookupValues)
    .where(inArray(lookupValues.id, unique))

  return new Map(rows.map((row) => [row.id, row]))
}

/** مرجع قيمة إلزامية؛ غيابها خلل في القاعدة لا حالة تُعرض. */
export function requireRef(refs: Map<string, LookupRef>, id: string): LookupRef {
  const ref = refs.get(id)

  if (!ref) throw new Error(`Lookup value ${id} is missing.`)

  return ref
}

export function optionalRef(
  refs: Map<string, LookupRef>,
  id: string | null,
): LookupRef | null {
  return id ? requireRef(refs, id) : null
}

/**
 * معرّف قيمة يكتبها الكود برمزها، كتعبير SQL يُحسب داخل الإدراج نفسه.
 *
 * `STAGE_CHANGE` تُكتب مع كل نقل مرحلة، و`MEDIUM` مع كل جهة لا تُرسل
 * أولويتها. قراءتها مسبقًا كانت رحلة إضافية إلى القاعدة في كل منها،
 * وحفظها في الذاكرة يبقى صحيحًا حتى تُعاد تهيئة القاعدة — وهو ما تفعله
 * الاختبارات قبل كل حالة. القيمة مقفلة فلا تغيب، ولو غابت لرفض `NOT NULL`
 * الإدراج بدل أن يُكتب السجل بلا تصنيف.
 */
export function lookupValueIdSql(list: LookupCode, valueCode: string) {
  if (!isLockedValue(list, valueCode)) {
    throw new Error(
      `${list}.${valueCode} is written by code and must be listed as locked or system in lookups.registry.ts.`,
    )
  }

  return sql<string>`(
    select ${lookupValues.id} from ${lookupValues}
      join ${lookupLists} on ${lookupLists.id} = ${lookupValues.listId}
     where ${lookupLists.code} = ${list} and ${lookupValues.code} = ${valueCode}
  )`
}

type Expectation = {
  list: LookupCode
  /** اسم الحقل في جسم الطلب، فتصل رسالة الخطأ إلى حقلها في النموذج. */
  field: string
  ids: readonly (string | null | undefined)[]
  /**
   * القيم الحالية على السجل. تعديل سجل لا يُجبر على تغيير قيمة عُطّلت بعد
   * أن صُنّف بها؛ الإسناد الجديد وحده يحتاج قيمة نشطة.
   */
  current?: readonly (string | null | undefined)[]
}

/**
 * يتحقق من القيم المرسلة قبل الكتابة، في استعلام واحد لكل الحقول.
 *
 * المفتاح الأجنبي يضمن أن القيمة موجودة، ولا يضمن أنها من التعريف الصحيح:
 * معرّف من «نوع الوثيقة» يمرّ عليه في عمود «نوع الجهة». فالتعريف والتفعيل
 * وقيم النظام كلها تُفحص هنا، والخطأ يعود بموضع الحقل كأخطاء التحقق.
 */
export async function assertLookupValues(
  expectations: readonly Expectation[],
  tx: Executor = db,
): Promise<Map<string, LookupRef>> {
  const wanted = expectations.flatMap((expectation) =>
    expectation.ids.filter((id): id is string => Boolean(id)),
  )

  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({
      id: lookupValues.id,
      code: lookupValues.code,
      nameAr: lookupValues.nameAr,
      isActive: lookupValues.isActive,
      listCode: lookupLists.code,
    })
    .from(lookupValues)
    .innerJoin(lookupLists, eq(lookupLists.id, lookupValues.listId))
    .where(inArray(lookupValues.id, [...new Set(wanted)]))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const issues: { in: 'body'; path: string; message: string }[] = []

  for (const expectation of expectations) {
    const { nameAr } = lookupDefinition(expectation.list)
    const current = new Set(expectation.current ?? [])

    for (const id of expectation.ids) {
      if (!id) continue

      const row = byId.get(id)

      if (!row || row.listCode !== expectation.list) {
        issues.push({
          in: 'body',
          path: expectation.field,
          message: `القيمة ليست من «${nameAr}».`,
        })
      } else if (isSystemValue(expectation.list, row.code)) {
        issues.push({
          in: 'body',
          path: expectation.field,
          message: `«${row.nameAr}» يسجّلها النظام وحده.`,
        })
      } else if (!row.isActive && !current.has(id)) {
        issues.push({
          in: 'body',
          path: expectation.field,
          message: `«${row.nameAr}» معطّلة في «${nameAr}». اختر قيمة أخرى.`,
        })
      }
    }
  }

  if (issues.length > 0) {
    throw errors.unprocessable('البيانات المرسلة غير صالحة.', issues)
  }

  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, code: row.code, nameAr: row.nameAr, isActive: row.isActive },
    ]),
  )
}

// ── الإدارة ────────────────────────────────────────────────────────────

function resolveCode(code: string): LookupCode {
  if (!isLookupCode(code)) throw errors.notFound('التعريف غير موجود.')

  return code
}

async function loadList(code: LookupCode, tx: Executor = db) {
  const [row] = await tx
    .select()
    .from(lookupLists)
    .where(eq(lookupLists.code, code))
    .limit(1)

  // التعريف في السجل ولم تُنشئه المزامنة بعد: خلل نشر لا طلب خاطئ.
  if (!row) throw new Error(`Lookup list ${code} is not seeded.`)

  return row
}

function assertEditor(code: LookupCode, actor: AuthContext) {
  if (!canEditLookup(code, actor.capabilities)) {
    throw errors.forbidden('لا تملك تحرير قيم هذا التعريف.')
  }
}

/** عدد السجلات المصنّفة بكل قيمة، عبر كل الأعمدة التي تشير إلى التعريف. */
async function usageCounts(
  code: LookupCode,
  valueIds: readonly string[],
  tx: Executor = db,
) {
  const counts = new Map<string, number>()

  if (valueIds.length === 0) return counts

  for (const usage of lookupDefinition(code).usages) {
    const rows = await tx
      .select({ id: usage.column, total: count() })
      .from(usage.table)
      .where(inArray(usage.column, [...valueIds]))
      .groupBy(usage.column)

    for (const row of rows) {
      const id = row.id as string

      counts.set(id, (counts.get(id) ?? 0) + row.total)
    }
  }

  return counts
}

function serializeValue(
  code: LookupCode,
  row: LookupValue,
  usage: Map<string, number> | null,
) {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    descriptionAr: row.descriptionAr,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    isLocked: isLockedValue(code, row.code),
    isSystem: isSystemValue(code, row.code),
    usageCount: usage ? (usage.get(row.id) ?? 0) : null,
  }
}

function serializeList(
  code: LookupCode,
  row: typeof lookupLists.$inferSelect,
  actor: AuthContext,
) {
  return {
    code,
    nameAr: row.nameAr,
    descriptionAr: row.descriptionAr,
    groupAr: lookupDefinition(code).groupAr,
    canEdit: canEditLookup(code, actor.capabilities),
  }
}

export async function listLookupSummaries(actor: AuthContext) {
  /**
   * العدّ في استعلام مجمَّع مستقل لا استعلام فرعي مترابط: Drizzle يكتب
   * الأعمدة بلا اسم جدولها حين يخلو الاستعلام من ربط، فيصير `"id"` داخل
   * الاستعلام الفرعي معرّف القيمة لا التعريف، ويعود العدّ صفرًا بصمت.
   */
  const [lists, counts] = await Promise.all([
    db.select().from(lookupLists),
    db
      .select({
        listId: lookupValues.listId,
        valueCount: count(),
        activeCount: sql<number>`count(*) filter (where ${lookupValues.isActive})::int`,
      })
      .from(lookupValues)
      .groupBy(lookupValues.listId),
  ])

  const byCode = new Map(lists.map((list) => [list.code, list]))
  const countsByList = new Map(counts.map((row) => [row.listId, row]))

  // ترتيب السجل لا ترتيب القاعدة: التعريفات مجمّعة حسب مجالها هناك.
  return LOOKUP_CODES.flatMap((code) => {
    const list = byCode.get(code)

    if (!list) return []

    const listCounts = countsByList.get(list.id)

    return [
      {
        ...serializeList(code, list, actor),
        valueCount: listCounts?.valueCount ?? 0,
        activeCount: listCounts?.activeCount ?? 0,
      },
    ]
  })
}

export async function getLookupList(
  rawCode: string,
  query: dto.GetLookupQuery,
  actor: AuthContext,
) {
  const code = resolveCode(rawCode)
  const list = await loadList(code)

  const values = await db
    .select()
    .from(lookupValues)
    .where(
      and(
        eq(lookupValues.listId, list.id),
        query.includeInactive ? undefined : eq(lookupValues.isActive, true),
      ),
    )
    .orderBy(asc(lookupValues.displayOrder), asc(lookupValues.nameAr))

  const usage = query.includeUsage
    ? await usageCounts(
        code,
        values.map((value) => value.id),
      )
    : null

  return {
    ...serializeList(code, list, actor),
    values: values.map((value) => serializeValue(code, value, usage)),
  }
}

export async function updateLookupList(
  rawCode: string,
  input: dto.UpdateLookupListBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const code = resolveCode(rawCode)
  const list = await loadList(code)

  const changes = {
    ...(input.nameAr ? { nameAr: normalizeText(input.nameAr) } : {}),
    ...(input.descriptionAr !== undefined
      ? { descriptionAr: input.descriptionAr || null }
      : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(lookupLists).set(changes).where(eq(lookupLists.id, list.id))

      await recordAudit(
        {
          action: 'lookup_list.updated',
          actorUserId: actor.userId,
          entityType: 'lookup_list',
          entityId: list.id,
          entityLabel: changes.nameAr ?? list.nameAr,
          summaryAr: `تعديل التعريف «${list.nameAr}»`,
          metadata: { code, fields: Object.keys(changes) },
          ...trace,
        },
        tx,
      )
    })
  }

  return getLookupList(code, { includeInactive: true, includeUsage: true }, actor)
}

async function loadValue(listId: string, id: string, tx: Executor = db) {
  const [row] = await tx
    .select()
    .from(lookupValues)
    .where(and(eq(lookupValues.id, id), eq(lookupValues.listId, listId)))
    .limit(1)

  if (!row) throw errors.notFound('القيمة غير موجودة في هذا التعريف.')

  return row
}

/**
 * «صيدلية» و«صيدليه» قيمة واحدة: المطابقة على صورة الاسم لا نصّه، كي لا
 * يضيف زر «+» قيمة مكررة لأن كاتبها نسي الهمزة.
 */
async function assertNameFree(
  listId: string,
  nameAr: string,
  exceptId: string | null,
  tx: Executor = db,
) {
  const siblings = await tx
    .select({ id: lookupValues.id, nameAr: lookupValues.nameAr })
    .from(lookupValues)
    .where(eq(lookupValues.listId, listId))

  const key = nameKey(nameAr)
  const clash = siblings.find(
    (sibling) => sibling.id !== exceptId && nameKey(sibling.nameAr) === key,
  )

  if (clash) {
    throw errors.conflict(`«${clash.nameAr}» موجودة في التعريف.`, [
      { in: 'body', path: 'nameAr', message: `«${clash.nameAr}» موجودة في التعريف.` },
    ])
  }
}

export async function createLookupValue(
  rawCode: string,
  input: dto.CreateLookupValueBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const code = resolveCode(rawCode)

  assertEditor(code, actor)

  const list = await loadList(code)
  const nameAr = normalizeText(input.nameAr)

  await assertNameFree(list.id, nameAr, null)

  try {
    const created = await db.transaction(async (tx) => {
      const [last] = await tx
        .select({
          order: sql<number>`coalesce(max(${lookupValues.displayOrder}), 0)::int`,
        })
        .from(lookupValues)
        .where(eq(lookupValues.listId, list.id))

      const [row] = await tx
        .insert(lookupValues)
        .values({
          listId: list.id,
          // الرمز للكود وحده: من لم يكتبه يأخذ رمزًا مولّدًا كالأدوار.
          code: input.code ?? `CUSTOM_${randomBytes(4).toString('hex').toUpperCase()}`,
          nameAr,
          displayOrder: (last?.order ?? 0) + 10,
          ...(input.nameEn ? { nameEn: normalizeText(input.nameEn) } : {}),
          ...(input.descriptionAr ? { descriptionAr: input.descriptionAr } : {}),
        })
        .returning()

      if (!row) throw new Error('Failed to create lookup value.')

      await recordAudit(
        {
          action: 'lookup_value.created',
          severity: 'NOTICE',
          actorUserId: actor.userId,
          entityType: 'lookup_value',
          entityId: row.id,
          entityLabel: row.nameAr,
          summaryAr: `إضافة «${row.nameAr}» إلى «${list.nameAr}»`,
          metadata: { list: code, code: row.code },
          ...trace,
        },
        tx,
      )

      return row
    })

    return serializeValue(code, created, new Map())
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw errors.conflict('الرمز مستخدم بقيمة أخرى في التعريف.', [
        { in: 'body', path: 'code', message: 'الرمز مستخدم بقيمة أخرى في التعريف.' },
      ])
    }

    throw error
  }
}

export async function updateLookupValue(
  rawCode: string,
  id: string,
  input: dto.UpdateLookupValueBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const code = resolveCode(rawCode)

  assertEditor(code, actor)

  const list = await loadList(code)
  const value = await loadValue(list.id, id)

  if (input.isActive === false && isLockedValue(code, value.code)) {
    throw errors.conflict(
      `«${value.nameAr}» يعتمد عليها النظام، فلا تُعطَّل. يمكن تغيير اسمها.`,
    )
  }

  const nameAr = input.nameAr ? normalizeText(input.nameAr) : undefined

  if (nameAr && nameAr !== value.nameAr) {
    await assertNameFree(list.id, nameAr, value.id)
  }

  const changes = {
    ...(nameAr ? { nameAr } : {}),
    ...(input.nameEn !== undefined
      ? { nameEn: input.nameEn ? normalizeText(input.nameEn) : null }
      : {}),
    ...(input.descriptionAr !== undefined
      ? { descriptionAr: input.descriptionAr || null }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  }

  if (Object.keys(changes).length === 0) {
    return serializeValue(code, value, await usageCounts(code, [value.id]))
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(lookupValues)
      .set(changes)
      .where(eq(lookupValues.id, value.id))
      .returning()

    if (!row) throw new Error('Failed to update lookup value.')

    await recordAudit(
      {
        action: 'lookup_value.updated',
        actorUserId: actor.userId,
        entityType: 'lookup_value',
        entityId: value.id,
        entityLabel: row.nameAr,
        summaryAr:
          input.isActive === false
            ? `تعطيل «${value.nameAr}» في «${list.nameAr}»`
            : input.isActive === true && !value.isActive
              ? `تفعيل «${value.nameAr}» في «${list.nameAr}»`
              : `تعديل «${value.nameAr}» في «${list.nameAr}»`,
        metadata: { list: code, code: value.code, fields: Object.keys(changes) },
        ...trace,
      },
      tx,
    )

    return row
  })

  return serializeValue(code, updated, await usageCounts(code, [value.id]))
}

export async function reorderLookupValues(
  rawCode: string,
  input: dto.ReorderLookupValuesBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const code = resolveCode(rawCode)

  assertEditor(code, actor)

  const list = await loadList(code)

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: lookupValues.id })
      .from(lookupValues)
      .where(eq(lookupValues.listId, list.id))

    const known = new Set(existing.map((row) => row.id))
    const sent = new Set(input.ids)

    /**
     * ترتيب كامل أو لا شيء: قائمة ناقصة تعني أن الشاشة لم ترَ قيمة أُضيفت
     * من زر «+» في نافذة أخرى، وحفظها كان سيدفع تلك القيمة إلى موضع
     * عشوائي بلا علم من رتّب.
     */
    if (
      sent.size !== input.ids.length ||
      sent.size !== known.size ||
      input.ids.some((id) => !known.has(id))
    ) {
      throw errors.unprocessable(
        'الترتيب لا يطابق قيم التعريف الحالية. حدّث الصفحة وأعد الترتيب.',
      )
    }

    for (const [index, id] of input.ids.entries()) {
      await tx
        .update(lookupValues)
        .set({ displayOrder: (index + 1) * 10 })
        .where(eq(lookupValues.id, id))
    }

    await recordAudit(
      {
        action: 'lookup_list.reordered',
        actorUserId: actor.userId,
        entityType: 'lookup_list',
        entityId: list.id,
        entityLabel: list.nameAr,
        summaryAr: `إعادة ترتيب قيم «${list.nameAr}»`,
        metadata: { code },
        ...trace,
      },
      tx,
    )
  })

  return getLookupList(code, { includeInactive: true, includeUsage: true }, actor)
}

export async function deleteLookupValue(
  rawCode: string,
  id: string,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const code = resolveCode(rawCode)

  assertEditor(code, actor)

  const list = await loadList(code)
  const value = await loadValue(list.id, id)

  if (isLockedValue(code, value.code)) {
    throw errors.conflict(`«${value.nameAr}» يعتمد عليها النظام، فلا تُحذف.`)
  }

  /**
   * العدّ قبل الحذف يعطي رسالة تقول أين استُعملت القيمة؛ المفتاح الأجنبي
   * `restrict` يبقى الحارس الأخير إن صُنّف بها سجل بين العدّ والحذف.
   */
  const usages = lookupDefinition(code).usages
  const used: string[] = []

  for (const usage of usages) {
    const [row] = await db
      .select({ total: count() })
      .from(usage.table)
      .where(eq(usage.column, value.id))

    if (row && row.total > 0) used.push(`${row.total} ${usage.labelAr}`)
  }

  if (used.length > 0) {
    throw errors.conflict(
      `«${value.nameAr}» مستعملة في ${used.join(' و')}. عطّلها بدل حذفها.`,
    )
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(lookupValues).where(eq(lookupValues.id, value.id))

      await recordAudit(
        {
          action: 'lookup_value.deleted',
          severity: 'NOTICE',
          actorUserId: actor.userId,
          entityType: 'lookup_value',
          entityId: value.id,
          entityLabel: value.nameAr,
          summaryAr: `حذف «${value.nameAr}» من «${list.nameAr}»`,
          metadata: { list: code, code: value.code },
          ...trace,
        },
        tx,
      )
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw errors.conflict(
        `«${value.nameAr}» صارت مستعملة للتو. عطّلها بدل حذفها.`,
      )
    }

    throw error
  }
}
