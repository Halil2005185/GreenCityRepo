import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireAnyCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './people.controller.js'
import {
  addMembershipBodySchema,
  candidatesQuerySchema,
  listPeopleQuerySchema,
  setMembershipCapabilitiesBodySchema,
  updateMembershipBodySchema,
} from './people.schemas.js'

export const peopleRouter = Router()

/**
 * `users.view` لا قدرة جديدة للدليل، ومدير الفريق يدخله أيضًا ليرى فريقه.
 *
 * الكتالوج يحمل `users.view` منذ البداية بمعنى «عرض المستخدمين»، وإضافة
 * `people.view` بجانبها تُنشئ قدرتين لمعنى واحد. أما مدير الفريق بلا
 * `users.view` فيقصره المتحكم على أعضاء فرقه.
 */
peopleRouter.use(
  requireAuth,
  requireStaff,
  requireAnyCapability('users.view', 'team.manage', 'team.all'),
)

peopleRouter.get(
  '/',
  validate({ query: listPeopleQuerySchema }),
  controller.getPeople,
)

// قبل `/:id` وإلا قُرئت «candidates» معرّفًا.
peopleRouter.get(
  '/candidates',
  requireAnyCapability('team.manage', 'team.all'),
  validate({ query: candidatesQuerySchema }),
  controller.getCandidates,
)

peopleRouter.get('/:id', controller.getPerson)

/**
 * الكتابة لمن يدير فريقًا. الحارس هنا يكفي لرفض من لا يدير شيئًا؛ أي فريق
 * وأي قدرة فقرار المتحكم (`access/delegation.ts`).
 */
const manageTeam = requireAnyCapability('team.manage', 'team.all')

peopleRouter.post(
  '/:id/memberships',
  manageTeam,
  validate({ body: addMembershipBodySchema }),
  controller.postAddMembership,
)

peopleRouter.patch(
  '/:id/memberships/:membershipId',
  manageTeam,
  validate({ body: updateMembershipBodySchema }),
  controller.patchMembership,
)

peopleRouter.post(
  '/:id/memberships/:membershipId/end',
  manageTeam,
  controller.postEndMembership,
)

peopleRouter.put(
  '/:id/memberships/:membershipId/capabilities',
  manageTeam,
  validate({ body: setMembershipCapabilitiesBodySchema }),
  controller.putMembershipCapabilities,
)
