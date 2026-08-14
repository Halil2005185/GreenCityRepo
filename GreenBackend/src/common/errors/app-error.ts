export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = 'INTERNAL_SERVER_ERROR',
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/**
 * مصانع الأخطاء الشائعة. الرسالة عربية لأنها تصل المستخدم عبر
 * `application/problem+json`، بينما `code` إنجليزي لأن الواجهة تتفرع عليه.
 */
export const errors = {
  badRequest: (message = 'طلب غير صالح.', details?: unknown) =>
    new AppError(message, 400, 'BAD_REQUEST', details),

  unauthorized: (message = 'يلزم تسجيل الدخول.') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message = 'لا تملك صلاحية تنفيذ هذا الإجراء.') =>
    new AppError(message, 403, 'FORBIDDEN'),

  notFound: (message = 'العنصر غير موجود.') =>
    new AppError(message, 404, 'NOT_FOUND'),

  conflict: (message = 'تعارض مع الحالة الحالية.', details?: unknown) =>
    new AppError(message, 409, 'CONFLICT', details),

  unprocessable: (message = 'تعذّر تنفيذ الطلب.', details?: unknown) =>
    new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details),

  tooManyRequests: (message = 'محاولات كثيرة. حاول لاحقًا.') =>
    new AppError(message, 429, 'TOO_MANY_REQUESTS'),
} as const
