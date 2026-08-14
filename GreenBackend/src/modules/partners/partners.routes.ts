import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './partners.controller.js'
import * as schemas from './partners.schemas.js'

export const partnersRouter = Router()

/**
 * القراءة تحتاج `partners.view`، والكتابة `partners.manage`، والقرارات
 * النهائية `partners.approve` — أي المدير العام وحده.
 *
 * الحارس المشترك يُركَّب على مستوى الموجّه، ثم يُضاف الأشد على المسار
 * المعني. مسار جديد يُضاف هنا يرث الحماية بدل أن ينكشف لنسيان سطر.
 */
partnersRouter.use(requireAuth, requireStaff, requireCapability('partners.view'))

partnersRouter.get(
  '/',
  validate({ query: schemas.listPartnersQuerySchema }),
  controller.getPartners,
)

partnersRouter.get(
  '/:id',
  validate({ params: schemas.partnerIdParamsSchema }),
  controller.getPartner,
)

const manage = requireCapability('partners.manage')
const approve = requireCapability('partners.approve')
const consent = requireCapability('partners.consent.manage')

partnersRouter.post(
  '/',
  manage,
  validate({ body: schemas.createPartnerBodySchema }),
  controller.postPartner,
)

partnersRouter.patch(
  '/:id',
  manage,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.updatePartnerBodySchema,
  }),
  controller.patchPartner,
)

partnersRouter.post(
  '/:id/stage',
  manage,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.changeStageBodySchema,
  }),
  controller.postStage,
)

partnersRouter.post(
  '/:id/contacts',
  manage,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.createContactBodySchema,
  }),
  controller.postContact,
)

partnersRouter.post(
  '/:id/partnerships',
  manage,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.createPartnershipBodySchema,
  }),
  controller.postPartnership,
)

// الاعتماد داخل هذا المسار يفحص `partners.approve` في الخدمة، لأن التعليق
// والإنهاء يكفيهما `partners.manage`.
partnersRouter.patch(
  '/:id/partnerships/:partnershipId',
  manage,
  validate({
    params: schemas.partnershipIdParamsSchema,
    body: schemas.updatePartnershipBodySchema,
  }),
  controller.patchPartnership,
)

partnersRouter.post(
  '/:id/consent',
  consent,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.consentBodySchema,
  }),
  controller.postConsent,
)

partnersRouter.post(
  '/:id/charter-acknowledgements',
  requireCapability('charter.acknowledgements.record'),
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.acknowledgementBodySchema,
  }),
  controller.postAcknowledgement,
)

partnersRouter.post(
  '/:id/interactions',
  manage,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.interactionBodySchema,
  }),
  controller.postInteraction,
)

partnersRouter.post(
  '/:id/activate',
  approve,
  validate({ params: schemas.partnerIdParamsSchema }),
  controller.postActivate,
)

partnersRouter.post(
  '/:id/reject',
  approve,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.rejectPartnerBodySchema,
  }),
  controller.postReject,
)

partnersRouter.post(
  '/:id/suspend',
  approve,
  validate({
    params: schemas.partnerIdParamsSchema,
    body: schemas.suspendPartnerBodySchema,
  }),
  controller.postSuspend,
)

partnersRouter.post(
  '/:id/restore',
  approve,
  validate({ params: schemas.partnerIdParamsSchema }),
  controller.postRestore,
)
