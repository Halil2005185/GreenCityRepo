import type { RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './charter.service.js'
import type {
  CreateCharterVersionBody,
  PublishCharterBody,
} from './charter.schemas.js'

export const getCurrent: RequestHandler = async (_request, response) => {
  response.status(200).json(await service.getCurrentVersion())
}

export const getVersions: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await service.listVersions() })
}

export const postVersion: RequestHandler = async (request, response) => {
  const body = request.body as CreateCharterVersionBody

  const created = await service.createVersion(
    body,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(created)
}

export const postPublish: RequestHandler = async (request, response) => {
  const id = request.params['id']

  if (typeof id !== 'string') throw errors.notFound('الإصدار غير موجود.')

  const body = request.body as PublishCharterBody

  const published = await service.publishVersion(
    id,
    body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(published)
}
