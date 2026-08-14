import { Router } from 'express'
import type { RequestHandler } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireActivePartner,
  requireCapability,
  requirePartnerScope,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './portal.service.js'
import {
  displayConsentBodySchema,
  updateSelfBodySchema,
} from './portal.schemas.js'
import type { DisplayConsentBody, UpdateSelfBody } from './portal.schemas.js'

const getMe: RequestHandler = async (request, response) => {
  response.status(200).json(await service.loadSelf(request.auth!))
}

const patchMe: RequestHandler = async (request, response) => {
  const updated = await service.updateSelf(
    request.auth!,
    request.body as UpdateSelfBody,
    requestTrace(request),
  )

  response.status(200).json(updated)
}

const patchConsent: RequestHandler = async (request, response) => {
  const updated = await service.updateDisplayConsent(
    request.auth!,
    request.body as DisplayConsentBody,
    requestTrace(request),
  )

  response.status(200).json(updated)
}

export const partnerPortalRouter = Router()

/**
 * `requirePartnerScope` على مستوى الموجّه: أي مسار يُضاف هنا يبدأ بجهة
 * مثبتة، فلا يمكن أن يُكتب استعلام بلا قيد نطاق.
 *
 * القراءة متاحة لجهة معلّقة عمدًا — يجب أن ترى سبب التعليق. الكتابة
 * وحدها تمر بـ`requireActivePartner`.
 */
partnerPortalRouter.use(requireAuth, requirePartnerScope)

partnerPortalRouter.get('/me', getMe)

partnerPortalRouter.patch(
  '/me',
  requireActivePartner,
  requireCapability('partner.profile.manage'),
  validate({ body: updateSelfBodySchema }),
  patchMe,
)

partnerPortalRouter.patch(
  '/me/display-consent',
  requireActivePartner,
  requireCapability('partner.consent.manage'),
  validate({ body: displayConsentBodySchema }),
  patchConsent,
)
