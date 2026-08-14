import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import type { AuthContext } from '../access/access.service.js'
import { requestTrace } from '../audit/audit.service.js'
import * as authService from './auth.service.js'
import type {
  AcceptInvitationBody,
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
} from './auth.schemas.js'
import { clearRefreshCookie, setRefreshCookie } from './cookies.js'

/** لا يُسرَّب `tokenVersion` ولا الحالة الداخلية إلى الواجهة. */
function serializeUser(context: AuthContext) {
  return {
    id: context.userId,
    email: context.email,
    fullNameAr: context.fullNameAr,
    kind: context.kind,
    capabilities: context.capabilities,
    memberships: context.memberships,
    partner: context.partner,
  }
}

function serializeSession(result: authService.SessionResult) {
  return {
    accessToken: result.accessToken,
    expiresInSeconds: result.expiresInSeconds,
    user: serializeUser(result.user),
  }
}

function readRefreshCookie(request: Request): string | undefined {
  const value: unknown = request.cookies?.[env.AUTH_COOKIE_NAME]

  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** أنواع Express 5 تسمح للمعامل أن يكون مصفوفة (مسارات wildcard)، فيُضيَّق هنا. */
function readTokenParam(request: Request) {
  const token = request.params['token']

  if (typeof token !== 'string' || token.length === 0) {
    throw errors.notFound('الدعوة غير صالحة.')
  }

  return token
}

export const postLogin: RequestHandler = async (request, response) => {
  const body = request.body as LoginBody
  const result = await authService.login(body, requestTrace(request))

  setRefreshCookie(response, result.refreshToken, result.user.kind)
  response.status(200).json(serializeSession(result))
}

export const postRefresh: RequestHandler = async (request, response) => {
  const token = readRefreshCookie(request)

  if (!token) throw errors.unauthorized('لا توجد جلسة.')

  const result = await authService.refreshSession(token, requestTrace(request))

  setRefreshCookie(response, result.refreshToken, result.user.kind)
  response.status(200).json(serializeSession(result))
}

export const postLogout: RequestHandler = async (request, response) => {
  await authService.logout(readRefreshCookie(request), requestTrace(request))

  clearRefreshCookie(response)
  response.status(204).end()
}

export const postLogoutAll: RequestHandler = async (request, response) => {
  // `requireAuth` يضمن وجود السياق قبل الوصول إلى هنا.
  const context = request.auth!

  await authService.logoutAll(context.userId, requestTrace(request))

  clearRefreshCookie(response)
  response.status(204).end()
}

export const getMe: RequestHandler = (request, response) => {
  response.status(200).json(serializeUser(request.auth!))
}

export const postForgotPassword: RequestHandler = async (request, response) => {
  const body = request.body as ForgotPasswordBody

  /**
   * الرمز يعود من الخدمة لكنه لا يدخل الاستجابة إطلاقًا: إعادته تجعل
   * المسار وسيلة للاستيلاء على أي حساب. يُرسل بالبريد عند وصل وحدة
   * الإشعارات؛ وحتى ذلك الحين يُسجَّل رابطه في سجل الخادم خارج الإنتاج.
   */
  const issued = await authService.requestPasswordReset(
    body.email,
    requestTrace(request),
  )

  if (issued && env.NODE_ENV !== 'production') {
    console.info(
      '[auth:password-reset-link]',
      `${env.ADMIN_APP_URL}/reset-password/${issued.token}`,
    )
  }

  response.status(202).json({ status: 'accepted' })
}

export const postResetPassword: RequestHandler = async (request, response) => {
  const body = request.body as ResetPasswordBody

  await authService.resetPassword(
    body.token,
    body.password,
    requestTrace(request),
  )

  clearRefreshCookie(response)
  response.status(204).end()
}

export const getInvitation: RequestHandler = async (request, response) => {
  const preview = await authService.previewInvitation(readTokenParam(request))

  response.status(200).json(preview)
}

export const postAcceptInvitation: RequestHandler = async (
  request,
  response,
) => {
  const body = request.body as AcceptInvitationBody

  const result = await authService.acceptInvitation(
    readTokenParam(request),
    body,
    requestTrace(request),
  )

  setRefreshCookie(response, result.refreshToken, result.user.kind)
  response.status(201).json(serializeSession(result))
}
