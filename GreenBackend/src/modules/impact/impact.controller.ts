import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './impact.service.js'
import type * as dto from './impact.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('قيد الأثر غير موجود.')
  }

  return value
}

export const getEntries: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.ListEntriesQuery

  response.status(200).json({ data: await service.listEntries(query) })
}

export const postEntry: RequestHandler = async (request, response) => {
  const entry = await service.recordEntry(
    request.body as dto.CreateEntryBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(entry)
}

export const postVerify: RequestHandler = async (request, response) => {
  const entry = await service.verifyEntry(
    readId(request),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(entry)
}

export const postReverse: RequestHandler = async (request, response) => {
  const entry = await service.reverseEntry(
    readId(request),
    request.body as dto.ReverseEntryBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(entry)
}

export const getSummary: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.SummaryQuery

  response.status(200).json(await service.loadSummary(query))
}
