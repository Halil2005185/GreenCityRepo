import type { RequestHandler } from 'express'

import { AppError } from '../errors/app-error.js'

export const notFound: RequestHandler = (request, _response, next) => {
  next(
    new AppError(
      `Route ${request.method} ${request.originalUrl} was not found`,
      404,
      'ROUTE_NOT_FOUND',
    ),
  )
}
