import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  invitationRateLimit,
  loginRateLimit,
  passwordResetRateLimit,
} from '../../common/middleware/rate-limit.js'
import { validate } from '../../common/middleware/validate.js'
import * as controller from './auth.controller.js'
import {
  acceptInvitationBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
} from './auth.schemas.js'

export const authRouter = Router()

authRouter.post(
  '/login',
  loginRateLimit,
  validate({ body: loginBodySchema }),
  controller.postLogin,
)

// التدوير والخروج يعتمدان على الكوكي لا على رمز الوصول، فلا حارس هنا.
authRouter.post('/refresh', controller.postRefresh)
authRouter.post('/logout', controller.postLogout)

authRouter.post('/logout-all', requireAuth, controller.postLogoutAll)
authRouter.get('/me', requireAuth, controller.getMe)

authRouter.post(
  '/forgot-password',
  passwordResetRateLimit,
  validate({ body: forgotPasswordBodySchema }),
  controller.postForgotPassword,
)

authRouter.post(
  '/reset-password',
  passwordResetRateLimit,
  validate({ body: resetPasswordBodySchema }),
  controller.postResetPassword,
)

authRouter.get('/invitations/:token', controller.getInvitation)

authRouter.post(
  '/invitations/:token/accept',
  invitationRateLimit,
  validate({ body: acceptInvitationBodySchema }),
  controller.postAcceptInvitation,
)
