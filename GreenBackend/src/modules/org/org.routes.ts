import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import { requireStaff } from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './org.controller.js'
import { listRolesQuerySchema } from './org.schemas.js'

export const orgRouter = Router()

/**
 * مرجع تنظيمي للقراءة فقط، متاح لكل عضو فريق مصادَق.
 *
 * لا يُشترط قدرة إضافية: هيكل المكاتب والأدوار معروف لكل من يعمل في
 * الفريق، وحجبه عن العضو العادي يمنع الشاشات من عرض «مكتب العمليات»
 * بجانب مهمة دون أن يحمي شيئًا. التعديل — حين يُبنى — سيحتاج
 * `offices.manage` و`roles.manage`.
 */
orgRouter.use(requireAuth, requireStaff)

orgRouter.get('/offices', controller.getOffices)
orgRouter.get(
  '/roles',
  validate({ query: listRolesQuerySchema }),
  controller.getRoles,
)
orgRouter.get('/capabilities', controller.getCapabilities)
