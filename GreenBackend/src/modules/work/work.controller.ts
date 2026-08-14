import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as service from './work.service.js'
import type * as dto from './work.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

export const getTasks: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as dto.ListTasksQuery
  const data = await service.listTasks(query, request.auth!)

  response.status(200).json({ data })
}

export const postTask: RequestHandler = async (request, response) => {
  const detail = await service.createTask(
    request.body as dto.CreateTaskBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const getTask: RequestHandler = async (request, response) => {
  response.status(200).json(await service.loadTaskDetail(readId(request)))
}

export const patchTask: RequestHandler = async (request, response) => {
  const detail = await service.updateTask(
    readId(request),
    request.body as dto.UpdateTaskBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postTaskStatus: RequestHandler = async (request, response) => {
  const detail = await service.changeTaskStatus(
    readId(request),
    request.body as dto.TaskStatusBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(detail)
}

export const postTaskComment: RequestHandler = async (request, response) => {
  const detail = await service.addComment(
    readId(request),
    request.body as dto.CreateCommentBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(detail)
}

export const postMilestone: RequestHandler = async (request, response) => {
  const milestone = await service.createMilestone(
    request.body as dto.CreateMilestoneBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(milestone)
}

export const patchMilestone: RequestHandler = async (request, response) => {
  const milestone = await service.updateMilestone(
    readId(request),
    request.body as dto.UpdateMilestoneBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(milestone)
}
