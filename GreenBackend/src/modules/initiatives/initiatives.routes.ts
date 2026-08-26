import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './initiatives.controller.js'
import * as schemas from './initiatives.schemas.js'

export const initiativesRouter = Router()

/**
 * القراءة تحتاج `initiatives.view`، والتحرير `initiatives.manage`، وبدء
 * التنفيذ وإغلاقه `initiatives.launch` — القرار الذي يُلزم فرقًا وشركاء.
 *
 * الحارس المشترك على مستوى الموجّه ثم يُضاف الأشد على المسار المعني، فمسار
 * جديد يرث الحماية بدل أن ينكشف لنسيان سطر.
 */
initiativesRouter.use(
  requireAuth,
  requireStaff,
  requireCapability('initiatives.view'),
)

const manage = requireCapability('initiatives.manage')
const launch = requireCapability('initiatives.launch')

initiativesRouter.get(
  '/',
  validate({ query: schemas.listInitiativesQuerySchema }),
  controller.getInitiatives,
)

initiativesRouter.post(
  '/',
  manage,
  validate({ body: schemas.createInitiativeBodySchema }),
  controller.postInitiative,
)

initiativesRouter.get(
  '/:id',
  validate({ params: schemas.initiativeIdParamsSchema }),
  controller.getInitiative,
)

initiativesRouter.patch(
  '/:id',
  manage,
  validate({
    params: schemas.initiativeIdParamsSchema,
    body: schemas.updateInitiativeBodySchema,
  }),
  controller.patchInitiative,
)

/**
 * الحذف بصلاحية الإطلاق لا الإدارة: من يملك أن يبدأ المبادرة يملك أن يمحو
 * مسودتها، ومن يملك تحريرها لا يملك محوها.
 */
initiativesRouter.delete(
  '/:id',
  launch,
  validate({ params: schemas.initiativeIdParamsSchema }),
  controller.deleteInitiative,
)

initiativesRouter.post(
  '/:id/areas',
  manage,
  validate({
    params: schemas.initiativeIdParamsSchema,
    body: schemas.addAreaBodySchema,
  }),
  controller.postArea,
)

initiativesRouter.delete(
  '/:id/areas/:areaId',
  manage,
  validate({ params: schemas.areaLinkParamsSchema }),
  controller.deleteArea,
)

initiativesRouter.post(
  '/:id/sites',
  manage,
  validate({
    params: schemas.initiativeIdParamsSchema,
    body: schemas.createSiteBodySchema,
  }),
  controller.postSite,
)

initiativesRouter.patch(
  '/:id/sites/:siteId',
  manage,
  validate({
    params: schemas.siteParamsSchema,
    body: schemas.updateSiteBodySchema,
  }),
  controller.patchSite,
)

initiativesRouter.put(
  '/:id/targets',
  manage,
  validate({
    params: schemas.initiativeIdParamsSchema,
    body: schemas.upsertTargetBodySchema,
  }),
  controller.putInitiativeTarget,
)

initiativesRouter.put(
  '/:id/sites/:siteId/targets',
  manage,
  validate({
    params: schemas.siteParamsSchema,
    body: schemas.upsertTargetBodySchema,
  }),
  controller.putSiteTarget,
)

initiativesRouter.post(
  '/:id/launch',
  launch,
  validate({ params: schemas.initiativeIdParamsSchema }),
  controller.postLaunch,
)

initiativesRouter.post(
  '/:id/complete',
  launch,
  validate({ params: schemas.initiativeIdParamsSchema }),
  controller.postComplete,
)

initiativesRouter.post(
  '/:id/cancel',
  launch,
  validate({ params: schemas.initiativeIdParamsSchema }),
  controller.postCancel,
)
