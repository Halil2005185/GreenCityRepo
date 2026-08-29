import { Router } from 'express'
import type { RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requireAuth } from '../../common/middleware/authenticate.js'
import { requireStaff } from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import type { Capability } from '../access/capabilities.js'
import {
  type SignUploadBody,
  type UploadPurpose,
  signUploadBodySchema,
} from './uploads.schemas.js'
import * as service from './uploads.service.js'

/**
 * القدرة تتبع الغرض لا المسار.
 *
 * «رفع» ليست صلاحية بذاتها: من يحرّر الاستمارات يرفع غلافها، ومن يدير
 * المبادرات يرفع أغلفتها. قدرةٌ عامة للرفع كانت ستعطي محرّر الاستمارات
 * بابًا إلى مجلّد المبادرات.
 */
const CAPABILITY: Record<UploadPurpose, Capability> = {
  FORM_COVER: 'forms.manage',
  INITIATIVE_COVER: 'initiatives.manage',
  GREEN_POINT_COVER: 'initiatives.manage',
}

const postSign: RequestHandler = async (request, response) => {
  const body = request.body as SignUploadBody
  const actor = request.auth!
  const needed = CAPABILITY[body.purpose]

  if (!actor.capabilities.includes(needed)) {
    throw errors.forbidden('لا تملك صلاحية رفع ملف لهذا الغرض.')
  }

  const signed = await service.signUpload(body)

  response.status(201).json({ data: signed })
}

export const uploadsRouter = Router()

uploadsRouter.use(requireAuth, requireStaff)

uploadsRouter.post('/sign', validate({ body: signUploadBodySchema }), postSign)
