import type { RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './invitations.service.js'
import type {
  CreateInvitationBody,
  ListInvitationsQuery,
} from './invitations.schemas.js'

export const postInvitation: RequestHandler = async (request, response) => {
  const body = request.body as CreateInvitationBody

  const result = await service.createInvitation(
    body,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(result)
}

export const getInvitations: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as ListInvitationsQuery

  const data = await service.listInvitations(
    query.status ? { status: query.status } : {},
  )

  response.status(200).json({ data })
}

export const postRevokeInvitation: RequestHandler = async (
  request,
  response,
) => {
  const id = request.params['id']

  if (typeof id !== 'string' || id.length === 0) {
    throw errors.notFound('الدعوة غير موجودة.')
  }

  await service.revokeInvitation(id, request.auth!, requestTrace(request))

  response.status(204).end()
}
