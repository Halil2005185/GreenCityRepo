import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import * as service from './forms.service.js'
import type * as dto from './forms.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

export const getForms: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await service.listForms() })
}

export const getForm: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json({ data: await service.getForm(readId(request)) })
}

export const postForm: RequestHandler = async (request, response) => {
  const body = request.body as dto.CreateFormBody

  const data = await service.createForm(body, request.auth!.userId)

  response.status(201).json({ data })
}

export const patchForm: RequestHandler = async (request, response) => {
  const body = request.body as dto.UpdateFormBody

  const data = await service.updateForm(
    readId(request),
    body,
    request.auth!.capabilities.includes("forms.publish"),
  )

  response.status(200).json({ data })
}

export const postField: RequestHandler = async (request, response) => {
  const body = request.body as dto.FieldBody

  const data = await service.addField(readId(request), body)

  response.status(201).json({ data })
}

export const patchField: RequestHandler = async (request, response) => {
  const body = request.body as dto.FieldBody

  const data = await service.updateField(
    readId(request),
    readId(request, 'fieldId'),
    body,
  )

  response.status(200).json({ data })
}

export const deleteField: RequestHandler = async (request, response) => {
  await service.deleteField(readId(request), readId(request, 'fieldId'))

  response.status(204).send()
}

export const postReorder: RequestHandler = async (request, response) => {
  const body = request.body as dto.ReorderBody

  const data = await service.reorderFields(readId(request), body)

  response.status(200).json({ data })
}

export const postPublish: RequestHandler = async (request, response) => {
  const data = await service.publishDraft(readId(request), request.auth!.userId)

  response.status(200).json({ data })
}
