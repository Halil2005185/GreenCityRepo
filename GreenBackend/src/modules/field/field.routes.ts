import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireAllCapabilities,
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import {
  certificateVerifyRateLimit,
  fieldWriteRateLimit,
  linkRedeemRateLimit,
  selfCheckinRateLimit,
} from '../../common/middleware/rate-limit.js'
import { validate } from '../../common/middleware/validate.js'
import * as adminSchemas from './field-admin.schemas.js'
import {
  requireFieldAuth,
  requireFieldParticipant,
  requireFieldStaff,
} from './field-auth.js'
import * as controller from './field.controller.js'
import * as schemas from './field.schemas.js'

/**
 * مسارات التطبيق الميداني — `/api/field`.
 *
 * الحارس هنا يثبت الهوية وحدها. «أي مجموعة؟» قرار الخدمة لا الموجّه:
 * `field.lead` تفتح لحاملها مجموعاته هو لا مجموعات غيره، وهذا لا يُفحص
 * باسم قدرة على مسار. كل كتابة تمرّ من `requireWritableGroup`.
 *
 * مبدآن يدخلان من هنا: عضو الفريق وحامل الرابط الشخصي. `/me` لهما معًا،
 * وما تحت `/me/…` لحامل الرابط. وورقة المجموعة وحضورها للقائد ولمساعده —
 * والمساعد حامل رابط — وما عداهما تحت `/groups` و`/tasks` للفريق وحده.
 */
export const fieldRouter = Router()

/**
 * قبل الحارس: الرابط نفسه هو الاعتماد، ومن يفتحه لا جلسة له بعد. والرمز في
 * جسم الطلب لا في مساره، فلا يُكتب في سجل وصول.
 */
fieldRouter.post(
  '/links/redeem',
  linkRedeemRateLimit,
  validate({ body: schemas.redeemLinkBodySchema }),
  controller.postLinkRedeem,
)

fieldRouter.use(requireFieldAuth)

fieldRouter.get('/me', controller.getHome)

fieldRouter.post(
  '/me/rsvp',
  requireFieldParticipant,
  fieldWriteRateLimit,
  validate({ body: schemas.rsvpBodySchema }),
  controller.postRsvp,
)

fieldRouter.post(
  '/me/checkin',
  requireFieldParticipant,
  selfCheckinRateLimit,
  validate({ body: schemas.selfCheckinBodySchema }),
  controller.postSelfCheckin,
)

fieldRouter.get('/me/record', requireFieldParticipant, controller.getRecord)

fieldRouter.post(
  '/me/deletion-request',
  requireFieldParticipant,
  fieldWriteRateLimit,
  controller.postDeletionRequest,
)

fieldRouter.delete(
  '/me/deletion-request',
  requireFieldParticipant,
  fieldWriteRateLimit,
  controller.deleteDeletionRequest,
)

fieldRouter.post(
  '/me/certificate',
  requireFieldParticipant,
  fieldWriteRateLimit,
  controller.postCertificate,
)

// الإشعارات للمبدأين: القائد يشترك بحسابه، والمتطوع برابطه.
fieldRouter.get('/push/key', controller.getPushKey)

fieldRouter.post(
  '/push/subscriptions',
  fieldWriteRateLimit,
  validate({ body: schemas.pushSubscribeBodySchema }),
  controller.postPushSubscription,
)

fieldRouter.post(
  '/push/subscriptions/remove',
  fieldWriteRateLimit,
  validate({ body: schemas.pushUnsubscribeBodySchema }),
  controller.postPushUnsubscribe,
)

const group = schemas.groupIdParamsSchema
const task = schemas.taskIdParamsSchema

/**
 * الورقة والحضور قبل حارس الفريق: يدخلها مساعد القائد برابطه. «أهو مساعد
 * هذه المجموعة؟» تسأله الخدمة (`requireAccessibleGroup`)، كما تسأل القائد
 * «أهي مجموعتك؟».
 */
fieldRouter.get(
  '/groups/:id',
  validate({ params: group }),
  controller.getSheet,
)

fieldRouter.post(
  '/groups/:id/attendance',
  fieldWriteRateLimit,
  validate({ params: group, body: schemas.attendanceBodySchema }),
  controller.postAttendance,
)

fieldRouter.post(
  '/groups/:id/attendance/undo',
  fieldWriteRateLimit,
  validate({ params: group, body: schemas.undoAttendanceBodySchema }),
  controller.postAttendanceUndo,
)

// كل ما بعدها للفريق: حارس واحد على البادئة يرثه أي مسار يُضاف تحتها.
fieldRouter.use(['/groups', '/tasks'], requireFieldStaff)

fieldRouter.post(
  '/groups/:id/impact',
  fieldWriteRateLimit,
  validate({ params: group, body: schemas.fieldImpactBodySchema }),
  controller.postImpact,
)

fieldRouter.post(
  '/groups/:id/photos/sign',
  fieldWriteRateLimit,
  validate({ params: group, body: schemas.signPhotoBodySchema }),
  controller.postPhotoSign,
)

fieldRouter.post(
  '/groups/:id/photos',
  fieldWriteRateLimit,
  validate({ params: group, body: schemas.registerPhotoBodySchema }),
  controller.postPhoto,
)

fieldRouter.patch(
  '/groups/:id/site',
  fieldWriteRateLimit,
  validate({ params: group, body: schemas.fieldSiteStatusBodySchema }),
  controller.patchSite,
)

fieldRouter.post(
  '/tasks/:id/status',
  fieldWriteRateLimit,
  validate({ params: task, body: schemas.fieldTaskStatusBodySchema }),
  controller.postTaskStatus,
)

fieldRouter.post(
  '/tasks/:id/comments',
  fieldWriteRateLimit,
  validate({ params: task, body: schemas.fieldTaskCommentBodySchema }),
  controller.postTaskComment,
)

/**
 * السطح العام للميدان — `/api/public`. بلا مصادقة، محدود المعدل.
 *
 * التحقق من شهادة: من يحمل الورقة يعرف ما فيها، فالجواب لا يزيد عليها.
 */
export const fieldPublicRouter = Router()

fieldPublicRouter.get(
  '/certificates/:code',
  certificateVerifyRateLimit,
  validate({ params: schemas.certificateCodeParamsSchema }),
  controller.getVerifiedCertificate,
)

/**
 * مسارات المنسّق — `/api/admin/initiatives/:id/field`.
 *
 * موجّه مستقل يُركَّب قبل موجّه المبادرات: ذاك يحرس كل ما تحته بـ
 * `initiatives.view`، والميدان قدرة أخرى (`field.manage`) يحملها المنسّق
 * وقد لا يحملها من يرى المبادرات. و`mergeParams` لأن معرّف المبادرة في
 * مسار التركيب لا في مسارات هذا الموجّه.
 */
export const fieldAdminRouter = Router({ mergeParams: true })

fieldAdminRouter.use(
  requireAuth,
  requireStaff,
  requireCapability('field.manage'),
)

const initiative = adminSchemas.initiativeParamsSchema
const groupOf = adminSchemas.groupParamsSchema
const memberOf = adminSchemas.memberParamsSchema
const photoOf = adminSchemas.photoParamsSchema

fieldAdminRouter.get(
  '/',
  validate({ params: initiative }),
  controller.getInitiativeField,
)

fieldAdminRouter.get(
  '/lead-candidates',
  validate({ params: initiative }),
  controller.getLeadCandidates,
)

fieldAdminRouter.get(
  '/partner-options',
  validate({ params: initiative }),
  controller.getPartnerOptions,
)

fieldAdminRouter.post(
  '/groups',
  validate({ params: initiative, body: adminSchemas.createGroupBodySchema }),
  controller.postGroup,
)

fieldAdminRouter.patch(
  '/groups/:groupId',
  validate({ params: groupOf, body: adminSchemas.updateGroupBodySchema }),
  controller.patchGroup,
)

fieldAdminRouter.delete(
  '/groups/:groupId',
  validate({ params: groupOf }),
  controller.deleteGroup,
)

fieldAdminRouter.get(
  '/groups/:groupId/members',
  validate({ params: groupOf, query: adminSchemas.membersQuerySchema }),
  controller.getMembers,
)

fieldAdminRouter.post(
  '/groups/:groupId/members',
  validate({ params: groupOf, body: adminSchemas.addMembersBodySchema }),
  controller.postMembers,
)

fieldAdminRouter.patch(
  '/groups/:groupId/members/:memberId',
  validate({ params: memberOf, body: adminSchemas.updateMemberBodySchema }),
  controller.patchMember,
)

fieldAdminRouter.delete(
  '/groups/:groupId/members/:memberId',
  validate({ params: memberOf }),
  controller.deleteMember,
)

fieldAdminRouter.post(
  '/links',
  validate({ params: initiative, body: adminSchemas.createLinksBodySchema }),
  controller.postLinks,
)

fieldAdminRouter.post(
  '/links/revoke',
  validate({ params: initiative, body: adminSchemas.revokeLinksBodySchema }),
  controller.postLinksRevoke,
)

fieldAdminRouter.get(
  '/feedback-forms',
  validate({ params: initiative }),
  controller.getFeedbackForms,
)

fieldAdminRouter.put(
  '/settings',
  validate({ params: initiative, body: adminSchemas.updateSettingsBodySchema }),
  controller.putSettings,
)

fieldAdminRouter.get(
  '/announcements',
  validate({ params: initiative }),
  controller.getAnnouncements,
)

fieldAdminRouter.post(
  '/announcements',
  validate({
    params: initiative,
    body: adminSchemas.createAnnouncementBodySchema,
  }),
  controller.postAnnouncement,
)

fieldAdminRouter.delete(
  '/announcements/:announcementId',
  validate({ params: adminSchemas.announcementParamsSchema }),
  controller.deleteAnnouncement,
)

fieldAdminRouter.get(
  '/deletion-requests',
  validate({ params: initiative }),
  controller.getDeletionRequests,
)

fieldAdminRouter.post(
  '/deletion-requests/:requestId/approve',
  validate({ params: adminSchemas.deletionRequestParamsSchema }),
  controller.postDeletionApprove,
)

fieldAdminRouter.post(
  '/deletion-requests/:requestId/reject',
  validate({
    params: adminSchemas.deletionRequestParamsSchema,
    body: adminSchemas.rejectDeletionBodySchema,
  }),
  controller.postDeletionReject,
)

fieldAdminRouter.get(
  '/sources',
  validate({ params: initiative }),
  controller.getSources,
)

fieldAdminRouter.get(
  '/applicants',
  validate({ params: initiative, query: adminSchemas.applicantsQuerySchema }),
  controller.getApplicants,
)

fieldAdminRouter.get(
  '/participants',
  validate({ params: initiative, query: adminSchemas.participantsQuerySchema }),
  controller.getParticipants,
)

fieldAdminRouter.get(
  '/attendance',
  validate({ params: initiative }),
  controller.getAttendance,
)

/**
 * قيد في دفتر الأثر، فيلزمه ما يلزم القيد: `impact.manage` مع `field.manage`.
 * المنسّق يحملهما؛ ومن يكوّن المجموعات ولا يسجّل الأثر لا يسجّله من هنا.
 */
fieldAdminRouter.post(
  '/attendance/impact',
  requireAllCapabilities('field.manage', 'impact.manage'),
  validate({
    params: initiative,
    body: adminSchemas.attendanceImpactBodySchema,
  }),
  controller.postAttendanceImpact,
)

fieldAdminRouter.get(
  '/photos',
  validate({ params: initiative, query: adminSchemas.photosQuerySchema }),
  controller.getPhotos,
)

fieldAdminRouter.patch(
  '/photos/:photoId',
  validate({ params: photoOf, body: adminSchemas.updatePhotoBodySchema }),
  controller.patchPhoto,
)

fieldAdminRouter.delete(
  '/photos/:photoId',
  validate({ params: photoOf }),
  controller.deletePhoto,
)
