import type { ErrorRequestHandler } from 'express'

import { env } from '../../config/env.js'
import { AppError } from '../errors/app-error.js'

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error)
    return
  }

  const appError =
    error instanceof AppError
      ? error
      : new AppError('An unexpected error occurred')

  if (appError.statusCode >= 500) {
    console.error('[request:error]', {
      requestId: request.id,
      method: request.method,
      path: request.originalUrl,
      error,
    })
  }

  response
    .status(appError.statusCode)
    .type('application/problem+json')
    .json({
      type: `https://greencities.local/problems/${appError.code.toLowerCase()}`,
      title: appError.code,
      status: appError.statusCode,
      detail: appError.message,
      instance: request.originalUrl,
      requestId: request.id,
      ...(appError.details === undefined ? {} : { details: appError.details }),
      ...(env.NODE_ENV === 'development' && error instanceof Error
        ? { stack: error.stack }
        : {}),
    })
}
