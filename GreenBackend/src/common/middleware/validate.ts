import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'

import { errors } from '../errors/app-error.js'

type ValidationTargets = {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

/**
 * يستبدل الحمولة الخام بالمُحلَّلة، فيصل المتحكم بيانات مُطهَّرة ومُحوَّلة
 * الأنواع. أي حقل لم يعرّفه المخطط يسقط — وهو ما يمنع تمرير حقول غير
 * مقصودة إلى طبقة الخدمة.
 *
 * في Express 5 صار `request.query` قراءة فقط، فتُخزَّن النتيجة في
 * `request.validatedQuery` بدل الكتابة فوقها.
 */
export function validate(targets: ValidationTargets): RequestHandler {
  return (request, _response, next) => {
    const issues: Array<{ path: string; message: string; in: string }> = []

    if (targets.body) {
      const result = targets.body.safeParse(request.body)

      if (result.success) {
        request.body = result.data
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            in: 'body',
            path: issue.path.join('.'),
            message: issue.message,
          })),
        )
      }
    }

    if (targets.query) {
      const result = targets.query.safeParse(request.query)

      if (result.success) {
        request.validatedQuery = result.data
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            in: 'query',
            path: issue.path.join('.'),
            message: issue.message,
          })),
        )
      }
    }

    if (targets.params) {
      const result = targets.params.safeParse(request.params)

      if (result.success) {
        request.validatedParams = result.data
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            in: 'params',
            path: issue.path.join('.'),
            message: issue.message,
          })),
        )
      }
    }

    if (issues.length > 0) {
      next(errors.unprocessable('البيانات المرسلة غير صالحة.', issues))
      return
    }

    next()
  }
}
