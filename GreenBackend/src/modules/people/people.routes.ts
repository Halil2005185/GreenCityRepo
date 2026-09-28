import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './people.controller.js'
import {
  addMembershipBodySchema,
  listPeopleQuerySchema,
  updateMembershipBodySchema,
} from './people.schemas.js'

export const peopleRouter = Router()

/**
 * `users.view` لا قدرة جديدة.
 *
 * الكتالوج يحملها منذ البداية بمعنى «عرض المستخدمين» ولم يكن لها مسار
 * يستعملها. إضافة `people.view` بجانبها تُنشئ قدرتين لمعنى واحد، ويصير
 * على شاشة الأدوار أن تشرح الفرق بينهما — ولا فرق.
 */
peopleRouter.use(requireAuth, requireStaff, requireCapability('users.view'))

peopleRouter.get(
  '/',
  validate({ query: listPeopleQuerySchema }),
  controller.getPeople,
)

peopleRouter.get('/:id', controller.getPerson)

/**
 * `roles.manage` فوق `users.view` الموروثة من الموجّه: المدير العام
 * والقسم التقني وحدهما اليوم يحملان القدرتين معًا.
 */
peopleRouter.post(
  '/:id/memberships',
  requireCapability('roles.manage'),
  validate({ body: addMembershipBodySchema }),
  controller.postAddMembership,
)

peopleRouter.patch(
  '/:id/memberships/:membershipId',
  requireCapability('roles.manage'),
  validate({ body: updateMembershipBodySchema }),
  controller.patchMembership,
)

peopleRouter.post(
  '/:id/memberships/:membershipId/end',
  requireCapability('roles.manage'),
  controller.postEndMembership,
)
