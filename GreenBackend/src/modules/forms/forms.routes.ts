import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './forms.controller.js'
import {
  createFormBodySchema,
  fieldBodySchema,
  reorderBodySchema,
  updateFormBodySchema,
} from './forms.schemas.js'

export const formsRouter = Router()

formsRouter.use(requireAuth, requireStaff, requireCapability('forms.view'))

/**
 * `forms.publish` لا تُفحص هنا: المسار نفسه (`PATCH`) يخدم تعديل الاسم
 * وفتح الاستقبال معًا، والثاني وحده يحتاجها. الفحص في الخدمة حيث يُعرف
 * ما الذي يُحدَّث فعلًا.
 */
const manage = requireCapability('forms.manage')

formsRouter.get('/', controller.getForms)
formsRouter.get('/:id', controller.getForm)

formsRouter.post(
  '/',
  manage,
  validate({ body: createFormBodySchema }),
  controller.postForm,
)

formsRouter.patch(
  '/:id',
  manage,
  validate({ body: updateFormBodySchema }),
  controller.patchForm,
)

formsRouter.post(
  '/:id/fields',
  manage,
  validate({ body: fieldBodySchema }),
  controller.postField,
)

// قبل `/:id/fields/:fieldId` وإلا التقط `reorder` كمعرّف سؤال.
formsRouter.post(
  '/:id/fields/reorder',
  manage,
  validate({ body: reorderBodySchema }),
  controller.postReorder,
)

formsRouter.patch(
  '/:id/fields/:fieldId',
  manage,
  validate({ body: fieldBodySchema }),
  controller.patchField,
)

formsRouter.delete('/:id/fields/:fieldId', manage, controller.deleteField)
