import { Router } from 'express'
import type { RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import {
  publicFormReadRateLimit,
  publicSubmissionRateLimit,
} from '../../common/middleware/rate-limit.js'
import { validate } from '../../common/middleware/validate.js'
import { env } from '../../config/env.js'
import * as service from './public.service.js'
import { submitBodySchema } from './public.schemas.js'

export const publicFormsRouter = Router()

function readSlug(value: unknown) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{1,79}$/.test(value)) {
    throw errors.notFound('الاستمارة غير متاحة.')
  }

  return value
}

const getForm: RequestHandler = async (request, response) => {
  const data = await service.getPublicForm(readSlug(request.params['slug']))

  response.status(200).json({ data })
}

const postSubmission: RequestHandler = async (request, response) => {
  const body = request.body as { answers: Record<string, unknown> }

  await service.submitForm({
    slug: readSlug(request.params['slug']),
    answers: body.answers,
    ip: request.ip,
    salt: env.JWT_ACCESS_SECRET,
  })

  /**
   * `202` بلا جسم — ولا معرّف للطلب.
   *
   * إعادة معرّف تمنح من يجرّب وسيلةً ليتأكد أن طلبه حُفظ ويقيس أثر ما
   * يرسله. المتقدّم لا يحتاجه، ورسالة الشكر تكفيه.
   */
  response.status(202).send()
}

publicFormsRouter.get('/forms/:slug', publicFormReadRateLimit, getForm)

publicFormsRouter.post(
  '/forms/:slug/submissions',
  publicSubmissionRateLimit,
  validate({ body: submitBodySchema }),
  postSubmission,
)
