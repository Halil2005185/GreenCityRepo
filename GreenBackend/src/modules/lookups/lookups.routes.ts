import { Router } from 'express'
import type { RequestHandler } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { validate } from '../../common/middleware/validate.js'
import { requestTrace } from '../audit/audit.service.js'
import {
  type GetLookupQuery,
  createLookupValueBodySchema,
  getLookupQuerySchema,
  lookupCodeParamsSchema,
  lookupValueParamsSchema,
  reorderLookupValuesBodySchema,
  updateLookupListBodySchema,
  updateLookupValueBodySchema,
} from './lookups.schemas.js'
import * as service from './lookups.service.js'

/**
 * القراءة لكل الفريق بلا قدرة خاصة، كما المؤشرات: هذه قوائم اختيار تظهر
 * في نماذج الشركاء والإعلاميين والخريطة، وحجبها عمّن لا يملك الإعدادات
 * يترك الحقل فارغًا بلا تفسير.
 *
 * الكتابة على القيم تُفحص في الخدمة لا هنا: القدرة المطلوبة تختلف حسب
 * التعريف (`lookups.registry.ts`)، فلا حارس ثابت على المسار يعبّر عنها.
 * اسم التعريف نفسه لـ`lookups.manage` وحده.
 */
export const lookupsRouter = Router()

lookupsRouter.use(requireAuth, requireStaff)

type CodeParams = { code: string }
type ValueParams = { code: string; id: string }

const list: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json({ data: await service.listLookupSummaries(request.auth!) })
}

const get: RequestHandler = async (request, response) => {
  const { code } = request.validatedParams as CodeParams

  response
    .status(200)
    .json(
      await service.getLookupList(
        code,
        request.validatedQuery as GetLookupQuery,
        request.auth!,
      ),
    )
}

const updateList: RequestHandler = async (request, response) => {
  const { code } = request.validatedParams as CodeParams

  response
    .status(200)
    .json(
      await service.updateLookupList(
        code,
        request.body,
        request.auth!,
        requestTrace(request),
      ),
    )
}

const createValue: RequestHandler = async (request, response) => {
  const { code } = request.validatedParams as CodeParams

  response
    .status(201)
    .json(
      await service.createLookupValue(
        code,
        request.body,
        request.auth!,
        requestTrace(request),
      ),
    )
}

const updateValue: RequestHandler = async (request, response) => {
  const { code, id } = request.validatedParams as ValueParams

  response
    .status(200)
    .json(
      await service.updateLookupValue(
        code,
        id,
        request.body,
        request.auth!,
        requestTrace(request),
      ),
    )
}

const reorder: RequestHandler = async (request, response) => {
  const { code } = request.validatedParams as CodeParams

  response
    .status(200)
    .json(
      await service.reorderLookupValues(
        code,
        request.body,
        request.auth!,
        requestTrace(request),
      ),
    )
}

const deleteValue: RequestHandler = async (request, response) => {
  const { code, id } = request.validatedParams as ValueParams

  await service.deleteLookupValue(code, id, request.auth!, requestTrace(request))

  response.status(204).end()
}

lookupsRouter.get('/', list)

lookupsRouter.get(
  '/:code',
  validate({ params: lookupCodeParamsSchema, query: getLookupQuerySchema }),
  get,
)

lookupsRouter.patch(
  '/:code',
  requireCapability('lookups.manage'),
  validate({ params: lookupCodeParamsSchema, body: updateLookupListBodySchema }),
  updateList,
)

lookupsRouter.post(
  '/:code/values',
  validate({ params: lookupCodeParamsSchema, body: createLookupValueBodySchema }),
  createValue,
)

lookupsRouter.post(
  '/:code/values/reorder',
  validate({
    params: lookupCodeParamsSchema,
    body: reorderLookupValuesBodySchema,
  }),
  reorder,
)

lookupsRouter.patch(
  '/:code/values/:id',
  validate({
    params: lookupValueParamsSchema,
    body: updateLookupValueBodySchema,
  }),
  updateValue,
)

lookupsRouter.delete(
  '/:code/values/:id',
  validate({ params: lookupValueParamsSchema }),
  deleteValue,
)
