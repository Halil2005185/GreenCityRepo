import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import { fieldPrincipal } from './field-auth.js'
import * as service from './field.service.js'
import type * as dto from './field.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

// ── التطبيق ────────────────────────────────────────────────────────────

export const getHome: RequestHandler = async (request, response) => {
  response.status(200).json(await service.loadHome(fieldPrincipal(request)))
}

export const getSheet: RequestHandler = async (request, response) => {
  const sheet = await service.loadSheet(
    readId(request),
    fieldPrincipal(request),
  )

  response.status(200).json(sheet)
}

// ── المنسّق ────────────────────────────────────────────────────────────

export const getInitiativeField: RequestHandler = async (request, response) => {
  response.status(200).json(await service.loadInitiativeField(readId(request)))
}

export const getLeadCandidates: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await service.listLeadCandidates() })
}

export const postGroup: RequestHandler = async (request, response) => {
  const field = await service.createGroup(
    readId(request),
    request.body as dto.CreateGroupBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(field)
}

export const patchGroup: RequestHandler = async (request, response) => {
  const field = await service.updateGroup(
    readId(request),
    readId(request, 'groupId'),
    request.body as dto.UpdateGroupBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(field)
}

export const deleteGroup: RequestHandler = async (request, response) => {
  const field = await service.deleteGroup(
    readId(request),
    readId(request, 'groupId'),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(field)
}
