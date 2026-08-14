import { asc, eq } from 'drizzle-orm'
import type { RequestHandler } from 'express'

import { db } from '../../db/client.js'
import { offices, roles } from '../../db/schema/org.js'
import { CAPABILITY_CATALOG } from '../access/capabilities.js'
import type { ListRolesQuery } from './org.schemas.js'

export const getOffices: RequestHandler = async (_request, response) => {
  const data = await db
    .select({
      id: offices.id,
      parentId: offices.parentId,
      slug: offices.slug,
      nameAr: offices.nameAr,
      nameEn: offices.nameEn,
      descriptionAr: offices.descriptionAr,
      displayOrder: offices.displayOrder,
      isActive: offices.isActive,
    })
    .from(offices)
    .orderBy(asc(offices.displayOrder), asc(offices.nameAr))

  response.status(200).json({ data })
}

export const getRoles: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListRolesQuery

  const data = await db
    .select({
      id: roles.id,
      slug: roles.slug,
      nameAr: roles.nameAr,
      nameEn: roles.nameEn,
      descriptionAr: roles.descriptionAr,
      scope: roles.scope,
      capabilities: roles.capabilities,
      isSystem: roles.isSystem,
      displayOrder: roles.displayOrder,
    })
    .from(roles)
    .where(query.scope ? eq(roles.scope, query.scope) : undefined)
    .orderBy(asc(roles.displayOrder), asc(roles.nameAr))

  response.status(200).json({ data })
}

export const getCapabilities: RequestHandler = (_request, response) => {
  response.status(200).json({ data: CAPABILITY_CATALOG })
}
