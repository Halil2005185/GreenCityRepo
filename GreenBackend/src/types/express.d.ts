import type { AuthContext } from '../modules/access/access.service.js'

declare global {
  namespace Express {
    interface Request {
      id: string
      /** يضعه `requireAuth` وحده. غيابه على مسار محمي خطأ برمجي لا نقص صلاحية. */
      auth?: AuthContext
      /** `request.query` قراءة فقط في Express 5، فتوضع النتيجة المُحلَّلة هنا. */
      validatedQuery?: unknown
      validatedParams?: unknown
    }
  }
}

export {}
