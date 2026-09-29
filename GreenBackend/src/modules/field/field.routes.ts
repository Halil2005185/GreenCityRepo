import { Router } from 'express'

import { requireAuth } from '../../common/middleware/authenticate.js'
import {
  requireAllCapabilities,
  requireCapability,
  requireStaff,
} from '../../common/middleware/authorize.js'
import { fieldWriteRateLimit } from '../../common/middleware/rate-limit.js'
import { validate } from '../../common/middleware/validate.js'
import * as adminSchemas from './field-admin.schemas.js'
import { requireFieldAuth } from './field-auth.js'
import * as controller from './field.controller.js'
import * as schemas from './field.schemas.js'

/**
 * مسارات التطبيق الميداني — `/api/field`.
 *
 * الحارس هنا يثبت الهوية وحدها. «أي مجموعة؟» قرار الخدمة لا الموجّه:
 * `field.lead` تفتح لحاملها مجموعاته هو لا مجموعات غيره، وهذا لا يُفحص
 * باسم قدرة على مسار. كل كتابة تمرّ من `requireWritableGroup`.
 */
export const fieldRouter = Router()

fieldRouter.use(requireFieldAuth)

fieldRouter.get('/me', controller.getHome)

fieldRouter.get(
  '/groups/:id',
  validate({ params: schemas.groupIdParamsSchema }),
  controller.getSheet,
)

const group = schemas.groupIdParamsSchema
const task = schemas.taskIdParamsSchema

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
