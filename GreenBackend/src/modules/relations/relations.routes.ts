import { asc, eq } from 'drizzle-orm'
import { Router } from 'express'
import type { RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import { normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { mediaChannels, relationshipTypes } from '../../db/schema/relations.js'
import { recordAudit, requestTrace } from '../audit/audit.service.js'
import {
  type CreateCatalogBody,
  type ListCatalogQuery,
  type UpdateCatalogBody,
  catalogIdParamsSchema,
  createCatalogBodySchema,
  listCatalogQuerySchema,
  updateCatalogBodySchema,
} from './relations.schemas.js'

/**
 * مرجعيتان بشكل واحد، فالمعالجات مولَّدة لا مكرّرة.
 *
 * نسخ الملف بحثًا واستبدالًا كان سيضاعف كل إصلاح لاحق: أي تشديد على
 * التحقق أو تغيير في صيغة التدقيق يلزم تطبيقه مرتين، ونسيان إحداهما لا
 * يكسر الترجمة فلا يظهر إلا في التشغيل.
 */
type Catalog = typeof mediaChannels | typeof relationshipTypes

function catalogHandlers(
  table: Catalog,
  entityType: 'media_channel' | 'relationship_type',
  notFoundAr: string,
) {
  const load = async (id: string) => {
    const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1)

    if (!row) throw errors.notFound(notFoundAr)

    return row
  }

  const list: RequestHandler = async (request, response) => {
    const query = request.validatedQuery as ListCatalogQuery

    const rows = await db
      .select()
      .from(table)
      .where(query.includeInactive ? undefined : eq(table.isActive, true))
      .orderBy(asc(table.displayOrder), asc(table.nameAr))

    response.status(200).json({ data: rows })
  }

  const create: RequestHandler = async (request, response) => {
    const body = request.body as CreateCatalogBody

    const [duplicate] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.slug, body.slug))
      .limit(1)

    if (duplicate) throw errors.conflict('الـslug مستخدم بمفردة أخرى.')

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(table)
        .values({
          slug: body.slug,
          nameAr: normalizeText(body.nameAr),
          displayOrder: body.displayOrder,
          ...(body.nameEn ? { nameEn: normalizeText(body.nameEn) } : {}),
          ...(body.descriptionAr ? { descriptionAr: body.descriptionAr } : {}),
        })
        .returning()

      if (!row) throw new Error(`Failed to create ${entityType}.`)

      await recordAudit(
        {
          action: `${entityType}.created`,
          severity: 'NOTICE',
          actorUserId: request.auth!.userId,
          entityType,
          entityId: row.id,
          entityLabel: row.nameAr,
          summaryAr: `إضافة مفردة «${row.nameAr}» إلى مرجعيات العلاقات`,
          ...requestTrace(request),
        },
        tx,
      )

      return row
    })

    response.status(201).json(created)
  }

  const update: RequestHandler = async (request, response) => {
    const { id } = request.validatedParams as { id: string }
    const body = request.body as UpdateCatalogBody

    await load(id)

    const changes = {
      ...(body.nameAr ? { nameAr: normalizeText(body.nameAr) } : {}),
      ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
      ...(body.descriptionAr !== undefined
        ? { descriptionAr: body.descriptionAr || null }
        : {}),
      ...(body.displayOrder !== undefined
        ? { displayOrder: body.displayOrder }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    }

    if (Object.keys(changes).length > 0) {
      await db.transaction(async (tx) => {
        await tx.update(table).set(changes).where(eq(table.id, id))

        await recordAudit(
          {
            action: `${entityType}.updated`,
            actorUserId: request.auth!.userId,
            entityType,
            entityId: id,
            summaryAr:
              body.isActive === false
                ? 'تعطيل مفردة من مرجعيات العلاقات'
                : 'تعديل مفردة من مرجعيات العلاقات',
            metadata: { fields: Object.keys(changes) },
            ...requestTrace(request),
          },
          tx,
        )
      })
    }

    response.status(200).json(await load(id))
  }

  return { list, create, update }
}

export const relationsRouter = Router()

/**
 * القراءة مفتوحة لكل الفريق بلا قدرة خاصة، كما `metrics`.
 *
 * هذه قوائم اختيار تظهر في نماذج الشركاء والشبكة الإعلامية معًا؛ حجبها
 * عمّن يملك `partners.manage` وحده كان سيترك حقلًا فارغًا بلا تفسير.
 * الكتابة وحدها تحتاج `relations.taxonomy.manage`.
 */
relationsRouter.use(requireAuth, requireStaff)

const manage = requireCapability('relations.taxonomy.manage')

for (const [segment, table, entityType, notFoundAr] of [
  ['media-channels', mediaChannels, 'media_channel', 'شكل العمل الإعلامي غير موجود.'],
  [
    'relationship-types',
    relationshipTypes,
    'relationship_type',
    'نوع العلاقة غير موجود.',
  ],
] as const) {
  const handlers = catalogHandlers(table, entityType, notFoundAr)

  relationsRouter.get(
    `/${segment}`,
    validate({ query: listCatalogQuerySchema }),
    handlers.list,
  )

  relationsRouter.post(
    `/${segment}`,
    manage,
    validate({ body: createCatalogBodySchema }),
    handlers.create,
  )

  relationsRouter.patch(
    `/${segment}/:id`,
    manage,
    validate({ params: catalogIdParamsSchema, body: updateCatalogBodySchema }),
    handlers.update,
  )
}
