import { asc, eq, sql } from 'drizzle-orm'
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
import { initiatives, programs } from '../../db/schema/programs.js'
import { workTemplates } from '../../db/schema/work.js'
import { recordAudit, requestTrace } from '../audit/audit.service.js'
import {
  type CreateProgramBody,
  type UpdateProgramBody,
  createProgramBodySchema,
  programIdParamsSchema,
  updateProgramBodySchema,
} from './programs.schemas.js'

/** العدّان في استعلامَي فرع بدل `join` يضاعف الصفوف ثم يحتاج تجميعًا. */
const columns = {
  id: programs.id,
  slug: programs.slug,
  nameAr: programs.nameAr,
  nameEn: programs.nameEn,
  descriptionAr: programs.descriptionAr,
  defaultTargetRollup: programs.defaultTargetRollup,
  isActive: programs.isActive,
  displayOrder: programs.displayOrder,
  initiativeCount: sql<number>`(
    select count(*)::int from ${initiatives}
     where ${initiatives.programId} = ${programs.id}
  )`.as('initiative_count'),
  templateCount: sql<number>`(
    select count(*)::int from ${workTemplates}
     where ${workTemplates.programId} = ${programs.id}
  )`.as('template_count'),
}

async function loadProgram(id: string) {
  const [row] = await db
    .select(columns)
    .from(programs)
    .where(eq(programs.id, id))
    .limit(1)

  if (!row) throw errors.notFound('البرنامج غير موجود.')

  return row
}

const getPrograms: RequestHandler = async (_request, response) => {
  const rows = await db
    .select(columns)
    .from(programs)
    .orderBy(asc(programs.displayOrder), asc(programs.nameAr))

  response.status(200).json({ data: rows })
}

const postProgram: RequestHandler = async (request, response) => {
  const body = request.body as CreateProgramBody

  const [duplicate] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.slug, body.slug))
    .limit(1)

  if (duplicate) throw errors.conflict('الـslug مستخدم ببرنامج آخر.')

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(programs)
      .values({
        slug: body.slug,
        nameAr: normalizeText(body.nameAr),
        defaultTargetRollup: body.defaultTargetRollup,
        displayOrder: body.displayOrder,
        ...(body.nameEn ? { nameEn: normalizeText(body.nameEn) } : {}),
        ...(body.descriptionAr ? { descriptionAr: body.descriptionAr } : {}),
      })
      .returning({ id: programs.id })

    if (!row) throw new Error('Failed to create program.')

    await recordAudit(
      {
        action: 'program.created',
        severity: 'NOTICE',
        actorUserId: request.auth!.userId,
        entityType: 'program',
        entityId: row.id,
        entityLabel: body.nameAr,
        summaryAr: 'إضافة برنامج',
        ...requestTrace(request),
      },
      tx,
    )

    return row.id
  })

  response.status(201).json(await loadProgram(id))
}

const patchProgram: RequestHandler = async (request, response) => {
  const id = (request.validatedParams as { id: string }).id
  const body = request.body as UpdateProgramBody

  await loadProgram(id)

  const changes = {
    ...(body.nameAr ? { nameAr: normalizeText(body.nameAr) } : {}),
    ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
    ...(body.descriptionAr !== undefined
      ? { descriptionAr: body.descriptionAr || null }
      : {}),
    ...(body.defaultTargetRollup
      ? { defaultTargetRollup: body.defaultTargetRollup }
      : {}),
    ...(body.displayOrder !== undefined
      ? { displayOrder: body.displayOrder }
      : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  }

  if (Object.keys(changes).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(programs).set(changes).where(eq(programs.id, id))

      await recordAudit(
        {
          action: 'program.updated',
          actorUserId: request.auth!.userId,
          entityType: 'program',
          entityId: id,
          summaryAr: 'تعديل برنامج',
          metadata: { fields: Object.keys(changes) },
          ...requestTrace(request),
        },
        tx,
      )
    })
  }

  response.status(200).json(await loadProgram(id))
}

export const programsRouter = Router()

// القراءة لكل موظف: اختيار البرنامج مطلوب في إنشاء أي مبادرة.
programsRouter.use(requireAuth, requireStaff)

programsRouter.get('/', getPrograms)

programsRouter.post(
  '/',
  requireCapability('programs.manage'),
  validate({ body: createProgramBodySchema }),
  postProgram,
)

programsRouter.patch(
  '/:id',
  requireCapability('programs.manage'),
  validate({ params: programIdParamsSchema, body: updateProgramBodySchema }),
  patchProgram,
)
