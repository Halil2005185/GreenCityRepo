import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import { formFields, formVersions, forms } from '../../db/schema/forms.js'
import { offices } from '../../db/schema/org.js'
import type {
  CreateFormBody,
  FieldBody,
  FieldCondition,
  ReorderBody,
  UpdateFormBody,
} from './forms.schemas.js'

type FieldRow = typeof formFields.$inferSelect

/** يجمع أعمدة الشرط الثلاثة في كائن واحد، أو `null` إن كان الحقل بلا شرط. */
function toCondition(row: FieldRow): FieldCondition | null {
  if (!row.conditionFieldKey || !row.conditionOp) return null

  if (row.conditionOp === 'notEmpty') {
    return { fieldKey: row.conditionFieldKey, op: 'notEmpty' }
  }

  if (row.conditionOp === 'in') {
    return {
      fieldKey: row.conditionFieldKey,
      op: 'in',
      value: (row.conditionValue ?? []) as string[],
    }
  }

  return {
    fieldKey: row.conditionFieldKey,
    op: 'eq',
    value: String(row.conditionValue ?? ''),
  }
}

function serializeField(row: FieldRow) {
  return {
    id: row.id,
    key: row.key,
    labelAr: row.labelAr,
    hintAr: row.hintAr,
    type: row.type,
    isRequired: row.isRequired,
    displayOrder: row.displayOrder,
    minSelections: row.minSelections,
    maxSelections: row.maxSelections,
    maxLength: row.maxLength,
    options: row.options,
    condition: toCondition(row),
  }
}

/** يفكّ الشرط إلى أعمدته الثلاثة كما يخزّنها الجدول. */
function conditionColumns(condition: FieldCondition | null | undefined) {
  if (!condition) {
    return {
      conditionFieldKey: null,
      conditionOp: null,
      conditionValue: null,
    }
  }

  return {
    conditionFieldKey: condition.fieldKey,
    conditionOp: condition.op,
    conditionValue: condition.op === 'notEmpty' ? null : condition.value,
  }
}

async function fieldsOf(versionId: string) {
  return db
    .select()
    .from(formFields)
    .where(eq(formFields.versionId, versionId))
    .orderBy(asc(formFields.displayOrder))
}

async function versionWithFields(versionId: string | null) {
  if (!versionId) return null

  const [version] = await db
    .select()
    .from(formVersions)
    .where(eq(formVersions.id, versionId))
    .limit(1)

  if (!version) return null

  return {
    id: version.id,
    version: version.version,
    status: version.status,
    publishedAt: version.publishedAt,
    fields: (await fieldsOf(version.id)).map(serializeField),
  }
}

async function requireForm(formId: string) {
  const [form] = await db
    .select({
      id: forms.id,
      slug: forms.slug,
      nameAr: forms.nameAr,
      descriptionAr: forms.descriptionAr,
      officeId: forms.officeId,
      officeNameAr: offices.nameAr,
      isAccepting: forms.isAccepting,
      createdAt: forms.createdAt,
    })
    .from(forms)
    .leftJoin(offices, eq(forms.officeId, offices.id))
    .where(eq(forms.id, formId))
    .limit(1)

  if (!form) throw errors.notFound('الاستمارة غير موجودة.')

  return form
}

/**
 * المسوّدة هي مكان التحرير الوحيد. غيابها يعني استمارة نُشرت ولم يُفتح
 * لها إصدار تالٍ بعد — وهو ما يفتحه النشر في المرحلة القادمة.
 */
async function requireDraft(formId: string) {
  const [draft] = await db
    .select()
    .from(formVersions)
    .where(
      and(eq(formVersions.formId, formId), eq(formVersions.status, 'DRAFT')),
    )
    .limit(1)

  if (!draft) {
    throw errors.conflict('لا مسوّدة قابلة للتحرير في هذه الاستمارة.')
  }

  return draft
}

async function draftIdOf(formId: string) {
  const [draft] = await db
    .select({ id: formVersions.id })
    .from(formVersions)
    .where(
      and(eq(formVersions.formId, formId), eq(formVersions.status, 'DRAFT')),
    )
    .limit(1)

  return draft?.id ?? null
}

async function publishedOf(formId: string) {
  const [published] = await db
    .select({ id: formVersions.id, version: formVersions.version })
    .from(formVersions)
    .where(
      and(
        eq(formVersions.formId, formId),
        eq(formVersions.status, 'PUBLISHED'),
      ),
    )
    .orderBy(desc(formVersions.version))
    .limit(1)

  return published ?? null
}

export async function getForm(formId: string) {
  const form = await requireForm(formId)
  const published = await publishedOf(formId)
  const draftId = await draftIdOf(formId)

  const draft = await versionWithFields(draftId)

  return {
    ...form,
    publishedVersion: published?.version ?? null,
    draftFieldCount: draft?.fields.length ?? 0,
    draft,
    published: await versionWithFields(published?.id ?? null),
  }
}

export async function listForms() {
  const rows = await db
    .select({
      id: forms.id,
      slug: forms.slug,
      nameAr: forms.nameAr,
      descriptionAr: forms.descriptionAr,
      officeId: forms.officeId,
      officeNameAr: offices.nameAr,
      isAccepting: forms.isAccepting,
      createdAt: forms.createdAt,
    })
    .from(forms)
    .leftJoin(offices, eq(forms.officeId, offices.id))
    .orderBy(asc(forms.nameAr))

  if (rows.length === 0) return []

  // إصدارات كل الاستمارات دفعة واحدة بدل استعلام لكل صف.
  const versions = await db
    .select({
      formId: formVersions.formId,
      id: formVersions.id,
      version: formVersions.version,
      status: formVersions.status,
    })
    .from(formVersions)
    .where(
      inArray(
        formVersions.formId,
        rows.map((row) => row.id),
      ),
    )

  const draftIds = versions
    .filter((version) => version.status === 'DRAFT')
    .map((version) => version.id)

  const counts = draftIds.length
    ? await db
        .select({
          versionId: formFields.versionId,
          count: sql<number>`count(*)::int`,
        })
        .from(formFields)
        .where(inArray(formFields.versionId, draftIds))
        .groupBy(formFields.versionId)
    : []

  const countByVersion = new Map(
    counts.map((row) => [row.versionId, row.count]),
  )

  return rows.map((row) => {
    const own = versions.filter((version) => version.formId === row.id)
    const draft = own.find((version) => version.status === 'DRAFT')
    const publishedNumbers = own
      .filter((version) => version.status === 'PUBLISHED')
      .map((version) => version.version)

    return {
      ...row,
      publishedVersion:
        publishedNumbers.length > 0 ? Math.max(...publishedNumbers) : null,
      draftFieldCount: draft ? (countByVersion.get(draft.id) ?? 0) : 0,
    }
  })
}

export async function createForm(body: CreateFormBody, createdById: string) {
  const [existing] = await db
    .select({ id: forms.id })
    .from(forms)
    .where(eq(forms.slug, body.slug))
    .limit(1)

  if (existing) throw errors.conflict('هذا المعرّف مستعمل في استمارة أخرى.')

  // الاستمارة ومسوّدتها معًا: استمارة بلا مسوّدة حالة لا معنى لها.
  const formId = await db.transaction(async (tx) => {
    const [form] = await tx
      .insert(forms)
      .values({
        slug: body.slug,
        nameAr: body.nameAr,
        descriptionAr: body.descriptionAr ?? null,
        officeId: body.officeId ?? null,
        createdById,
      })
      .returning({ id: forms.id })

    if (!form) throw errors.unprocessable('تعذّر إنشاء الاستمارة.')

    await tx.insert(formVersions).values({ formId: form.id, version: 1 })

    return form.id
  })

  return getForm(formId)
}

export async function updateForm(
  formId: string,
  body: UpdateFormBody,
  canPublish: boolean,
) {
  await requireForm(formId)

  if (body.isAccepting !== undefined) {
    if (!canPublish) {
      throw errors.forbidden('فتح الاستقبال وإغلاقه يحتاج القدرة forms.publish.')
    }

    // استمارة بلا إصدار منشور ليس لها ما تعرضه على الزائر.
    if (body.isAccepting && !(await publishedOf(formId))) {
      throw errors.conflict(
        'لا يمكن فتح الاستقبال قبل نشر إصدار من الاستمارة.',
      )
    }
  }

  await db
    .update(forms)
    .set({
      ...(body.nameAr === undefined ? {} : { nameAr: body.nameAr }),
      ...(body.descriptionAr === undefined
        ? {}
        : { descriptionAr: body.descriptionAr }),
      ...(body.officeId === undefined ? {} : { officeId: body.officeId }),
      ...(body.isAccepting === undefined
        ? {}
        : { isAccepting: body.isAccepting }),
    })
    .where(eq(forms.id, formId))

  return getForm(formId)
}

/**
 * النشر: يجمّد المسوّدة ويفتح التالية بنسخة من أسئلتها.
 *
 * الفتح الفوري للمسوّدة التالية مقصود — لا «استمارة بلا مكان للتحرير»
 * ولا خطوة إضافية قبل أول تعديل. والنسخ لا الإحالة: الإصدار المجمَّد لا
 * يجوز أن تتغير أسئلته لأن طلبًا قُدّم عليه يُقرأ مقابلها.
 */
export async function publishDraft(formId: string, publishedById: string) {
  await requireForm(formId)

  const draft = await requireDraft(formId)
  const fields = await fieldsOf(draft.id)

  if (fields.length === 0) {
    throw errors.conflict('لا يمكن نشر استمارة بلا أسئلة.')
  }

  await db.transaction(async (tx) => {
    // المنشور الحالي يصير تاريخًا قبل أن يحل محله الجديد.
    await tx
      .update(formVersions)
      .set({ status: 'ARCHIVED' })
      .where(
        and(
          eq(formVersions.formId, formId),
          eq(formVersions.status, 'PUBLISHED'),
        ),
      )

    await tx
      .update(formVersions)
      .set({
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById,
      })
      .where(eq(formVersions.id, draft.id))

    const [next] = await tx
      .insert(formVersions)
      .values({ formId, version: draft.version + 1 })
      .returning({ id: formVersions.id })

    if (!next) throw errors.unprocessable('تعذّر فتح المسوّدة التالية.')

    await tx.insert(formFields).values(
      fields.map((field) => ({
        versionId: next.id,
        key: field.key,
        labelAr: field.labelAr,
        hintAr: field.hintAr,
        type: field.type,
        isRequired: field.isRequired,
        displayOrder: field.displayOrder,
        minSelections: field.minSelections,
        maxSelections: field.maxSelections,
        maxLength: field.maxLength,
        options: field.options,
        conditionFieldKey: field.conditionFieldKey,
        conditionOp: field.conditionOp,
        conditionValue: field.conditionValue,
      })),
    )
  })

  return getForm(formId)
}

/**
 * الشرط يجب أن يشير إلى سؤال **يسبقه** ترتيبًا.
 *
 * السبب أن الشرطية تُقيَّم أثناء ملء الاستمارة بالتسلسل: شرط على سؤال
 * لاحق لا يملك إجابة بعد، فيصير الحقل مخفيًا دائمًا. والتحقق هنا لا في
 * الواجهة لأن الواجهة تجميل، والخادم هو الحقيقة.
 */
function assertConditionOrder(
  condition: FieldCondition | null | undefined,
  ownOrder: number,
  siblings: Array<{ key: string; displayOrder: number }>,
) {
  if (!condition) return

  const target = siblings.find((field) => field.key === condition.fieldKey)

  if (!target) {
    throw errors.conflict(
      `شرط الظهور يشير إلى سؤال غير موجود: ${condition.fieldKey}`,
    )
  }

  if (target.displayOrder >= ownOrder) {
    throw errors.conflict(
      'شرط الظهور يجب أن يشير إلى سؤال يسبقه، وإلا بقي الحقل مخفيًا دائمًا.',
    )
  }
}

export async function addField(formId: string, body: FieldBody) {
  const draft = await requireDraft(formId)
  const siblings = await fieldsOf(draft.id)

  if (siblings.some((field) => field.key === body.key)) {
    throw errors.conflict('هذا المفتاح مستعمل في سؤال آخر ضمن المسوّدة.')
  }

  const displayOrder =
    siblings.reduce((max, field) => Math.max(max, field.displayOrder), 0) + 1

  assertConditionOrder(body.condition, displayOrder, siblings)

  const [created] = await db
    .insert(formFields)
    .values({
      versionId: draft.id,
      key: body.key,
      labelAr: body.labelAr,
      hintAr: body.hintAr ?? null,
      type: body.type,
      isRequired: body.isRequired,
      displayOrder,
      minSelections: body.minSelections ?? null,
      maxSelections: body.maxSelections ?? null,
      maxLength: body.maxLength ?? null,
      options: body.options,
      ...conditionColumns(body.condition),
    })
    .returning()

  if (!created) throw errors.unprocessable('تعذّر إضافة السؤال.')

  return serializeField(created)
}

export async function updateField(
  formId: string,
  fieldId: string,
  body: FieldBody,
) {
  const draft = await requireDraft(formId)
  const siblings = await fieldsOf(draft.id)
  const current = siblings.find((field) => field.id === fieldId)

  if (!current) throw errors.notFound('السؤال غير موجود في المسوّدة.')

  if (siblings.some((field) => field.key === body.key && field.id !== fieldId)) {
    throw errors.conflict('هذا المفتاح مستعمل في سؤال آخر ضمن المسوّدة.')
  }

  assertConditionOrder(body.condition, current.displayOrder, siblings)

  // تغيير المفتاح يكسر أي شرط يشير إليه بالاسم القديم.
  if (body.key !== current.key) {
    const dependent = siblings.find(
      (field) => field.conditionFieldKey === current.key,
    )

    if (dependent) {
      throw errors.conflict(
        `لا يمكن تغيير المفتاح: السؤال «${dependent.labelAr}» يشترط عليه.`,
      )
    }
  }

  const [updated] = await db
    .update(formFields)
    .set({
      key: body.key,
      labelAr: body.labelAr,
      hintAr: body.hintAr ?? null,
      type: body.type,
      isRequired: body.isRequired,
      minSelections: body.minSelections ?? null,
      maxSelections: body.maxSelections ?? null,
      maxLength: body.maxLength ?? null,
      options: body.options,
      ...conditionColumns(body.condition),
    })
    .where(eq(formFields.id, fieldId))
    .returning()

  if (!updated) throw errors.unprocessable('تعذّر تعديل السؤال.')

  return serializeField(updated)
}

export async function deleteField(formId: string, fieldId: string) {
  const draft = await requireDraft(formId)
  const siblings = await fieldsOf(draft.id)
  const current = siblings.find((field) => field.id === fieldId)

  if (!current) throw errors.notFound('السؤال غير موجود في المسوّدة.')

  const dependent = siblings.find(
    (field) => field.conditionFieldKey === current.key,
  )

  if (dependent) {
    throw errors.conflict(
      `لا يمكن الحذف: السؤال «${dependent.labelAr}» يشترط على هذا السؤال.`,
    )
  }

  await db.delete(formFields).where(eq(formFields.id, fieldId))
}

export async function reorderFields(formId: string, body: ReorderBody) {
  const draft = await requireDraft(formId)
  const siblings = await fieldsOf(draft.id)

  if (body.keys.length !== siblings.length) {
    throw errors.conflict('الترتيب يجب أن يشمل كل أسئلة المسوّدة.')
  }

  const byKey = new Map(siblings.map((field) => [field.key, field]))
  const nextOrder = new Map<string, number>()

  body.keys.forEach((key, index) => {
    if (!byKey.has(key)) {
      throw errors.conflict(`مفتاح غير موجود في المسوّدة: ${key}`)
    }

    nextOrder.set(key, index + 1)
  })

  // الترتيب الجديد قد يجعل شرطًا يشير إلى سؤال صار بعده.
  const projected = siblings.map((field) => ({
    key: field.key,
    displayOrder: nextOrder.get(field.key) ?? field.displayOrder,
  }))

  for (const field of siblings) {
    assertConditionOrder(
      toCondition(field),
      nextOrder.get(field.key) ?? field.displayOrder,
      projected,
    )
  }

  /**
   * مرحلتان لأن `(version_id, display_order)` فريد وغير مؤجَّل: تحديث
   * واحد يبدّل قيمتين يصطدم بالفهرس في منتصفه. الإزاحة إلى نطاق سالب
   * تخلي المدى الموجب ثم يُكتب الترتيب النهائي.
   */
  await db.transaction(async (tx) => {
    await tx
      .update(formFields)
      .set({ displayOrder: sql`-${formFields.displayOrder}` })
      .where(eq(formFields.versionId, draft.id))

    for (const [key, order] of nextOrder) {
      await tx
        .update(formFields)
        .set({ displayOrder: order })
        .where(
          and(eq(formFields.versionId, draft.id), eq(formFields.key, key)),
        )
    }
  })

  return (await fieldsOf(draft.id)).map(serializeField)
}
