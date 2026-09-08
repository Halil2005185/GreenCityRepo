import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import type * as dto from './media.schemas.js'
import * as service from './media.service.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

export const getContacts: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.ListContactsQuery

  response.status(200).json({ data: await service.listContacts(query) })
}

export const getContact: RequestHandler = async (request, response) => {
  const detail = await service.loadContactDetail(readId(request), request.auth!)

  response.status(200).json(detail)
}

export const getFollowUps: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.ListFollowUpsQuery

  response
    .status(200)
    .json({ data: await service.listFollowUps(query, request.auth!) })
}

export const postContact: RequestHandler = async (request, response) => {
  const detail = await service.createContact(
    request.body as dto.CreateContactBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const patchContact: RequestHandler = async (request, response) => {
  const detail = await service.updateContact(
    readId(request),
    request.body as dto.UpdateContactBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postStage: RequestHandler = async (request, response) => {
  const detail = await service.changeStage(
    readId(request),
    request.body as dto.ChangeStageBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postInteraction: RequestHandler = async (request, response) => {
  const detail = await service.recordInteraction(
    readId(request),
    request.body as dto.InteractionBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const patchInteraction: RequestHandler = async (request, response) => {
  const detail = await service.setFollowUpCompletion(
    readId(request),
    readId(request, 'interactionId'),
    request.body as dto.CompleteInteractionBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}
