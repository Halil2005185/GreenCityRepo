import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './media.controller.js'
import * as schemas from './media.schemas.js'

export const mediaRouter = Router()

/**
 * `media.view` للقراءة و`media.manage` للكتابة — الفصل نفسه المتّبع في
 * سجل الشركاء. مسار جديد يُضاف هنا يرث الحارس المشترك بدل أن ينكشف
 * لنسيان سطر.
 */
mediaRouter.use(requireAuth, requireStaff, requireCapability('media.view'))

const manage = requireCapability('media.manage')

/**
 * قبل `/contacts/:id` لا بعده.
 *
 * Express يطابق بالترتيب، ومسار المعرّف — لو سبقه — كان سيبتلع
 * `follow-ups` ويردّ 400 على uuid غير صالح.
 */
mediaRouter.get(
  '/follow-ups',
  validate({ query: schemas.listFollowUpsQuerySchema }),
  controller.getFollowUps,
)

mediaRouter.get(
  '/contacts',
  validate({ query: schemas.listContactsQuerySchema }),
  controller.getContacts,
)

mediaRouter.get(
  '/contacts/:id',
  validate({ params: schemas.contactIdParamsSchema }),
  controller.getContact,
)

mediaRouter.post(
  '/contacts',
  manage,
  validate({ body: schemas.createContactBodySchema }),
  controller.postContact,
)

mediaRouter.patch(
  '/contacts/:id',
  manage,
  validate({
    params: schemas.contactIdParamsSchema,
    body: schemas.updateContactBodySchema,
  }),
  controller.patchContact,
)

mediaRouter.post(
  '/contacts/:id/stage',
  manage,
  validate({
    params: schemas.contactIdParamsSchema,
    body: schemas.changeStageBodySchema,
  }),
  controller.postStage,
)

mediaRouter.post(
  '/contacts/:id/interactions',
  manage,
  validate({
    params: schemas.contactIdParamsSchema,
    body: schemas.interactionBodySchema,
  }),
  controller.postInteraction,
)

mediaRouter.patch(
  '/contacts/:id/interactions/:interactionId',
  manage,
  validate({
    params: schemas.interactionIdParamsSchema,
    body: schemas.completeInteractionBodySchema,
  }),
  controller.patchInteraction,
)
