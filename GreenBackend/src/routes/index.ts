import { Router } from 'express'

import { auditRouter } from '../modules/audit/audit.routes.js'
import { authRouter } from '../modules/auth/auth.routes.js'
import {
  charterAdminRouter,
  charterPublicRouter,
} from '../modules/charter/charter.routes.js'
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js'
import { geoRouter } from '../modules/geo/geo.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'
import { impactRouter } from '../modules/impact/impact.routes.js'
import { initiativesRouter } from '../modules/initiatives/initiatives.routes.js'
import { invitationsRouter } from '../modules/invitations/invitations.routes.js'
import { orgRouter } from '../modules/org/org.routes.js'
import { partnerPortalRouter } from '../modules/partner-portal/portal.routes.js'
import { mapRouter } from '../modules/map/map.routes.js'
import { metricsRouter } from '../modules/metrics/metrics.routes.js'
import { partnersRouter } from '../modules/partners/partners.routes.js'
import { peopleRouter } from '../modules/people/people.routes.js'
import { programsRouter } from '../modules/programs/programs.routes.js'
import { workRouter } from '../modules/work/work.routes.js'
import { buildOpenApiDocument } from '../openapi/openapi.service.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.use('/charter', charterPublicRouter)

// مسارات الفريق.
apiRouter.use('/admin', orgRouter)
apiRouter.use('/admin/charter', charterAdminRouter)
apiRouter.use('/admin/invitations', invitationsRouter)
apiRouter.use('/admin/partners', partnersRouter)
apiRouter.use('/admin/people', peopleRouter)

// المرجعيات: قوائم قابلة للتحرير لا ثوابت واجهة.
apiRouter.use('/admin/areas', geoRouter)
apiRouter.use('/admin/programs', programsRouter)
apiRouter.use('/admin/metrics', metricsRouter)

// التشغيل: المبادرات ومواقعها وأهدافها، والعمل، ودفتر الأثر.
apiRouter.use('/admin/initiatives', initiativesRouter)
apiRouter.use('/admin/work', workRouter)
apiRouter.use('/admin/impact', impactRouter)
apiRouter.use('/admin/map', mapRouter)
apiRouter.use('/admin/audit-logs', auditRouter)
apiRouter.use('/admin/dashboard', dashboardRouter)

/**
 * مسارات البوابة معزولة تحت بادئة مستقلة لا تحمل معرّف جهة إطلاقًا:
 * النطاق يأتي من الجلسة، فلا سطح يُطلب منه شريك آخر.
 */
apiRouter.use('/partner', partnerPortalRouter)

/**
 * العقد مفتوح بلا مصادقة: الواجهتان تولّدان عميلهما منه وقت البناء،
 * وهو لا يحوي بيانات — أسماء المسارات وأشكالها معروفة لمن يملك حسابًا
 * أصلًا، وإخفاؤه أمن بالغموض لا أمن حقيقي.
 */
apiRouter.get('/openapi.json', (_request, response) => {
  response.status(200).json(buildOpenApiDocument())
})
