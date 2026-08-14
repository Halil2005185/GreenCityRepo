import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './work.controller.js'
import * as schemas from './work.schemas.js'

export const workRouter = Router()

/**
 * القراءة تحتاج `work.view`، والإنشاء والإسناد `work.manage`.
 *
 * الحارس المشترك على مستوى الموجّه، ثم يُضاف الأشد على المسار المعني،
 * فمسار جديد يُضاف هنا يرث الحماية بدل أن ينكشف لنسيان سطر.
 */
workRouter.use(requireAuth, requireStaff, requireCapability('work.view'))

const manage = requireCapability('work.manage')

workRouter.get(
  '/tasks',
  validate({ query: schemas.listTasksQuerySchema }),
  controller.getTasks,
)

workRouter.post(
  '/tasks',
  manage,
  validate({ body: schemas.createTaskBodySchema }),
  controller.postTask,
)

workRouter.get(
  '/tasks/:id',
  validate({ params: schemas.workItemIdParamsSchema }),
  controller.getTask,
)

workRouter.patch(
  '/tasks/:id',
  manage,
  validate({
    params: schemas.workItemIdParamsSchema,
    body: schemas.updateTaskBodySchema,
  }),
  controller.patchTask,
)

/**
 * لا حارس إضافي هنا: النقل حق من يرى المهمة، والخدمة تفحص الاستثناءات —
 * دخول `DONE` والخروج منها يلزمهما `work.approve`، والإلغاء `work.manage`.
 * حارس `work.manage` على المسار كان سيمنع المنفّذ من إرسال مهمته للمراجعة.
 */
workRouter.post(
  '/tasks/:id/status',
  validate({
    params: schemas.workItemIdParamsSchema,
    body: schemas.taskStatusBodySchema,
  }),
  controller.postTaskStatus,
)

/**
 * لا حارس إضافي هنا: التعليق حق من يرى المهمة، والخدمة تُنزل التعليق إلى
 * الداخلي لمن لا يملك `work.manage` بدل رفض الطلب — فالإظهار للشريك هو
 * المقيَّد لا الكتابة.
 */
workRouter.post(
  '/tasks/:id/comments',
  validate({
    params: schemas.workItemIdParamsSchema,
    body: schemas.createCommentBodySchema,
  }),
  controller.postTaskComment,
)

workRouter.post(
  '/milestones',
  manage,
  validate({ body: schemas.createMilestoneBodySchema }),
  controller.postMilestone,
)

workRouter.patch(
  '/milestones/:id',
  manage,
  validate({
    params: schemas.milestoneIdParamsSchema,
    body: schemas.updateMilestoneBodySchema,
  }),
  controller.patchMilestone,
)
