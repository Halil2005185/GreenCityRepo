import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './org.controller.js'
import {
  createRoleBodySchema,
  listRolesQuerySchema,
  updateRoleBodySchema,
} from './org.schemas.js'

export const orgRouter = Router()

/**
 * مرجع تنظيمي للقراءة متاح لكل عضو فريق مصادَق.
 *
 * لا يُشترط قدرة إضافية للقراءة: هيكل المكاتب والأدوار معروف لكل من يعمل
 * في الفريق، وحجبه عن العضو العادي يمنع الشاشات من عرض «مكتب العمليات»
 * بجانب مهمة دون أن يحمي شيئًا. تحرير الأدوار يحتاج `roles.manage`،
 * وأي قدرة تدخل الحزمة أو تخرج منها يقرّرها `access/delegation.ts`.
 */
orgRouter.use(requireAuth, requireStaff)

orgRouter.get('/offices', controller.getOffices)
orgRouter.get(
  '/roles',
  validate({ query: listRolesQuerySchema }),
  controller.getRoles,
)
orgRouter.get('/capabilities', controller.getCapabilities)

const manageRoles = requireCapability('roles.manage')

orgRouter.post(
  '/roles',
  manageRoles,
  validate({ body: createRoleBodySchema }),
  controller.postRole,
)
orgRouter.patch(
  '/roles/:id',
  manageRoles,
  validate({ body: updateRoleBodySchema }),
  controller.patchRole,
)
orgRouter.delete('/roles/:id', manageRoles, controller.deleteRole)
