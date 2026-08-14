import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './invitations.controller.js'
import {
  createInvitationBodySchema,
  invitationIdParamsSchema,
  listInvitationsQuerySchema,
} from './invitations.schemas.js'

export const invitationsRouter = Router()

// الحراس على مستوى الموجّه لا المسار: مسار جديد يُضاف هنا يرث الحماية
// بدل أن ينكشف لأن أحدهم نسي سطرًا.
invitationsRouter.use(requireAuth, requireStaff, requireCapability('invitations.manage'))

invitationsRouter.post(
  '/',
  validate({ body: createInvitationBodySchema }),
  controller.postInvitation,
)

invitationsRouter.get(
  '/',
  validate({ query: listInvitationsQuerySchema }),
  controller.getInvitations,
)

invitationsRouter.post(
  '/:id/revoke',
  validate({ params: invitationIdParamsSchema }),
  controller.postRevokeInvitation,
)
