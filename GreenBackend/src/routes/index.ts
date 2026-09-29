import { Router } from 'express'

import { auditRouter } from '../modules/audit/audit.routes.js'
import { authRouter } from '../modules/auth/auth.routes.js'
import {
  charterAdminRouter,
  charterPublicRouter,
} from '../modules/charter/charter.routes.js'
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js'
import {
  fieldAdminRouter,
  fieldPublicRouter,
  fieldRouter,
} from '../modules/field/field.routes.js'
import { formsRouter } from '../modules/forms/forms.routes.js'
import { publicFormsRouter } from '../modules/forms/public.routes.js'
import { geoRouter } from '../modules/geo/geo.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'
import { impactRouter } from '../modules/impact/impact.routes.js'
import { initiativesRouter } from '../modules/initiatives/initiatives.routes.js'
import { invitationsRouter } from '../modules/invitations/invitations.routes.js'
import { orgRouter } from '../modules/org/org.routes.js'
import { partnerPortalRouter } from '../modules/partner-portal/portal.routes.js'
import { mapRouter } from '../modules/map/map.routes.js'
import { mediaRouter } from '../modules/media/media.routes.js'
import { metricsRouter } from '../modules/metrics/metrics.routes.js'
import { partnersRouter } from '../modules/partners/partners.routes.js'
import { peopleRouter } from '../modules/people/people.routes.js'
import { programsRouter } from '../modules/programs/programs.routes.js'
import { relationsRouter } from '../modules/relations/relations.routes.js'
import { uploadsRouter } from '../modules/uploads/uploads.routes.js'
import { workRouter } from '../modules/work/work.routes.js'
import { buildOpenApiDocument } from '../openapi/openapi.service.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.use('/charter', charterPublicRouter)

/**
 * السطح العام — بلا مصادقة، محدود المعدل، ولا يكشف وجود ما لم يُنشر.
 */
apiRouter.use('/public', publicFormsRouter)
apiRouter.use('/public', fieldPublicRouter)

// مسارات الفريق.
apiRouter.use('/admin', orgRouter)
apiRouter.use('/admin/charter', charterAdminRouter)
apiRouter.use('/admin/invitations', invitationsRouter)
apiRouter.use('/admin/partners', partnersRouter)
apiRouter.use('/admin/people', peopleRouter)
apiRouter.use('/admin/media', mediaRouter)
apiRouter.use('/admin/forms', formsRouter)
apiRouter.use('/admin/uploads', uploadsRouter)

// المرجعيات: قوائم قابلة للتحرير لا ثوابت واجهة.
apiRouter.use('/admin/areas', geoRouter)
apiRouter.use('/admin/programs', programsRouter)
apiRouter.use('/admin/metrics', metricsRouter)
apiRouter.use('/admin/relations', relationsRouter)

// التشغيل: المبادرات ومواقعها وأهدافها، والعمل، ودفتر الأثر.
//
// ميدان المبادرة قبل موجّهها: حارس ذاك على مستوى الموجّه فيسري على كل ما
// تحت `/admin/initiatives`، والميدان له قدرته.
apiRouter.use('/admin/initiatives/:id/field', fieldAdminRouter)
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
 * التطبيق الميداني: يناديه الهاتف من الموقع العام لا من اللوحة. بادئة
 * مستقلة لأن من يدخلها قائد مجموعة لا يرى من `/admin` شيئًا، والمعرّف
 * الذي يحمله الطلب يُفحص على مجموعته هو.
 */
apiRouter.use('/field', fieldRouter)

/**
 * العقد مفتوح بلا مصادقة: الواجهتان تولّدان عميلهما منه وقت البناء،
 * وهو لا يحوي بيانات — أسماء المسارات وأشكالها معروفة لمن يملك حسابًا
 * أصلًا، وإخفاؤه أمن بالغموض لا أمن حقيقي.
 */
apiRouter.get('/openapi.json', (_request, response) => {
  response.status(200).json(buildOpenApiDocument())
})
