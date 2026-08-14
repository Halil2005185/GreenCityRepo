import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './charter.controller.js'
import {
  charterIdParamsSchema,
  createCharterVersionBodySchema,
  publishCharterBodySchema,
} from './charter.schemas.js'

/**
 * قراءة الإصدار الساري متاحة لكل مصادَق بلا قدرة إضافية: ممثل الشريك
 * يحتاجه ليقرأ ما أقرّت به جهته، وحجبه عنه يجعل الإقرار توقيعًا على
 * نصّ لا يراه.
 */
export const charterPublicRouter = Router()

charterPublicRouter.get('/current', requireAuth, controller.getCurrent)

export const charterAdminRouter = Router()

charterAdminRouter.use(requireAuth, requireStaff, requireCapability('charter.manage'))

charterAdminRouter.get('/versions', controller.getVersions)

charterAdminRouter.post(
  '/versions',
  validate({ body: createCharterVersionBodySchema }),
  controller.postVersion,
)

charterAdminRouter.post(
  '/versions/:id/publish',
  validate({ params: charterIdParamsSchema, body: publishCharterBodySchema }),
  controller.postPublish,
)
