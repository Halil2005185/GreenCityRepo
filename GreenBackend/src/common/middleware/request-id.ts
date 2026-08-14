import { randomUUID } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'

export function requestId(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const incomingRequestId = request.header('x-request-id')?.trim().slice(0, 128)
  request.id = incomingRequestId || randomUUID()
  response.setHeader('x-request-id', request.id)
  next()
}
