import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './partners.service.js'
import type * as dto from './partners.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

export const getPartners: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.ListPartnersQuery

  response.status(200).json({ data: await service.listPartners(query) })
}

export const getPartner: RequestHandler = async (request, response) => {
  const detail = await service.loadPartnerDetail(readId(request), request.auth!)

  response.status(200).json(detail)
}

export const postPartner: RequestHandler = async (request, response) => {
  const detail = await service.createPartner(
    request.body as dto.CreatePartnerBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const patchPartner: RequestHandler = async (request, response) => {
  const detail = await service.updatePartner(
    readId(request),
    request.body as dto.UpdatePartnerBody,
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

export const postContact: RequestHandler = async (request, response) => {
  const detail = await service.addContact(
    readId(request),
    request.body as dto.CreateContactBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const postPartnership: RequestHandler = async (request, response) => {
  const detail = await service.addPartnership(
    readId(request),
    request.body as dto.CreatePartnershipBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const patchPartnership: RequestHandler = async (request, response) => {
  const detail = await service.updatePartnership(
    readId(request),
    readId(request, 'partnershipId'),
    request.body as dto.UpdatePartnershipBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postConsent: RequestHandler = async (request, response) => {
  const body = request.body as dto.ConsentBody

  const detail = await service.recordConsent(
    readId(request),
    { ...body, source: 'ADMIN' },
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postAcknowledgement: RequestHandler = async (request, response) => {
  const detail = await service.recordAcknowledgement(
    readId(request),
    request.body as dto.AcknowledgementBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
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

export const postActivate: RequestHandler = async (request, response) => {
  const detail = await service.activatePartner(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postReject: RequestHandler = async (request, response) => {
  const detail = await service.rejectPartner(
    readId(request),
    request.body as dto.RejectPartnerBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postSuspend: RequestHandler = async (request, response) => {
  const detail = await service.suspendPartner(
    readId(request),
    request.body as dto.SuspendPartnerBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postRestore: RequestHandler = async (request, response) => {
  const detail = await service.restorePartner(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}
