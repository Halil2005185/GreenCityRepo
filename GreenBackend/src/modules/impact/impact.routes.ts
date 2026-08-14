import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './impact.controller.js'
import * as schemas from './impact.schemas.js'

export const impactRouter = Router()

/**
 * القراءة تحتاج `impact.view` والكتابة `impact.manage`. الحارس المشترك على
 * مستوى الموجّه ليرث أي مسار يُضاف لاحقًا الحمايةَ بدل أن ينكشف لنسيان سطر.
 */
impactRouter.use(requireAuth, requireStaff, requireCapability('impact.view'))

const manage = requireCapability('impact.manage')

impactRouter.get(
  '/entries',
  validate({ query: schemas.listEntriesQuerySchema }),
  controller.getEntries,
)

impactRouter.post(
  '/entries',
  manage,
  validate({ body: schemas.createEntryBodySchema }),
  controller.postEntry,
)

impactRouter.post(
  '/entries/:id/verify',
  manage,
  validate({ params: schemas.entryIdParamsSchema }),
  controller.postVerify,
)

impactRouter.post(
  '/entries/:id/reverse',
  manage,
  validate({
    params: schemas.entryIdParamsSchema,
    body: schemas.reverseEntryBodySchema,
  }),
  controller.postReverse,
)

impactRouter.get(
  '/summary',
  validate({ query: schemas.summaryQuerySchema }),
  controller.getSummary,
)
