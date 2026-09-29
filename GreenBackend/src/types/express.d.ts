import type { AuthContext } from '../modules/access/access.service.js'
import type { FieldPrincipal } from '../modules/field/field-auth.js'

declare global {
  namespace Express {
    interface Request {
      id: string
      /** يضعه `requireAuth` وحده. غيابه على مسار محمي خطأ برمجي لا نقص صلاحية. */
      auth?: AuthContext
      /** يضعه `requireFieldAuth` وحده، على مسارات `/api/field`. */
      field?: FieldPrincipal
      /** `request.query` قراءة فقط في Express 5، فتوضع النتيجة المُحلَّلة هنا. */
      validatedQuery?: unknown
      validatedParams?: unknown
    }
  }
}

export {}
