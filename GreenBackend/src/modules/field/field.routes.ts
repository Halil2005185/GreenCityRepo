import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import { requireFieldAuth } from './field-auth.js'
import * as controller from './field.controller.js'
import * as schemas from './field.schemas.js'

/**
 * مسارات التطبيق الميداني — `/api/field`.
 *
 * الحارس هنا يثبت الهوية وحدها. «أي مجموعة؟» قرار الخدمة لا الموجّه:
 * `field.lead` تفتح لحاملها مجموعاته هو لا مجموعات غيره، وهذا لا يُفحص
 * باسم قدرة على مسار.
 */
export const fieldRouter = Router()

fieldRouter.use(requireFieldAuth)

fieldRouter.get('/me', controller.getHome)

fieldRouter.get(
  '/groups/:id',
  validate({ params: schemas.groupIdParamsSchema }),
  controller.getSheet,
)

/**
 * مسارات المنسّق — `/api/admin/initiatives/:id/field`.
 *
 * موجّه مستقل يُركَّب قبل موجّه المبادرات: ذاك يحرس كل ما تحته بـ
 * `initiatives.view`، والميدان قدرة أخرى (`field.manage`) يحملها المنسّق
 * وقد لا يحملها من يرى المبادرات. و`mergeParams` لأن معرّف المبادرة في
 * مسار التركيب لا في مسارات هذا الموجّه.
 */
export const fieldAdminRouter = Router({ mergeParams: true })

fieldAdminRouter.use(
  requireAuth,
  requireStaff,
  requireCapability('field.manage'),
)

fieldAdminRouter.get(
  '/',
  validate({ params: schemas.initiativeParamsSchema }),
  controller.getInitiativeField,
)

fieldAdminRouter.get(
  '/lead-candidates',
  validate({ params: schemas.initiativeParamsSchema }),
  controller.getLeadCandidates,
)

fieldAdminRouter.post(
  '/groups',
  validate({
    params: schemas.initiativeParamsSchema,
    body: schemas.createGroupBodySchema,
  }),
  controller.postGroup,
)

fieldAdminRouter.patch(
  '/groups/:groupId',
  validate({
    params: schemas.groupParamsSchema,
    body: schemas.updateGroupBodySchema,
  }),
  controller.patchGroup,
)

fieldAdminRouter.delete(
  '/groups/:groupId',
  validate({ params: schemas.groupParamsSchema }),
  controller.deleteGroup,
)
