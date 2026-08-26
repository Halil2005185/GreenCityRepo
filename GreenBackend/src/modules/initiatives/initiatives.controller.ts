import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './initiatives.service.js'
import type * as dto from './initiatives.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

export const getInitiatives: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.ListInitiativesQuery

  response.status(200).json({ data: await service.listInitiatives(query) })
}

export const getInitiative: RequestHandler = async (request, response) => {
  const detail = await service.loadInitiativeDetail(
    readId(request),
    request.auth!,
  )

  response.status(200).json(detail)
}

export const postInitiative: RequestHandler = async (request, response) => {
  const detail = await service.createInitiative(
    request.body as dto.CreateInitiativeBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const patchInitiative: RequestHandler = async (request, response) => {
  const detail = await service.updateInitiative(
    readId(request),
    request.body as dto.UpdateInitiativeBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postArea: RequestHandler = async (request, response) => {
  const detail = await service.addArea(
    readId(request),
    request.body as dto.AddAreaBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const deleteArea: RequestHandler = async (request, response) => {
  const detail = await service.removeArea(
    readId(request),
    readId(request, 'areaId'),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const deleteInitiative: RequestHandler = async (request, response) => {
  await service.deleteInitiative(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(204).end()
}

export const postSite: RequestHandler = async (request, response) => {
  const detail = await service.addSite(
    readId(request),
    request.body as dto.CreateSiteBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const patchSite: RequestHandler = async (request, response) => {
  const detail = await service.updateSite(
    readId(request),
    readId(request, 'siteId'),
    request.body as dto.UpdateSiteBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const putInitiativeTarget: RequestHandler = async (request, response) => {
  const detail = await service.setInitiativeTarget(
    readId(request),
    request.body as dto.UpsertTargetBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const putSiteTarget: RequestHandler = async (request, response) => {
  const detail = await service.setSiteTarget(
    readId(request),
    readId(request, 'siteId'),
    request.body as dto.UpsertTargetBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postLaunch: RequestHandler = async (request, response) => {
  const result = await service.launchInitiative(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(result)
}

export const postComplete: RequestHandler = async (request, response) => {
  const detail = await service.completeInitiative(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postCancel: RequestHandler = async (request, response) => {
  const detail = await service.cancelInitiative(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}
