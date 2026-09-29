import type { Request, RequestHandler } from 'express'

import { errors } from '../../common/errors/app-error.js'
import { requestTrace } from '../audit/audit.service.js'
import * as admin from './field-admin.service.js'
import type * as adminDto from './field-admin.schemas.js'
import * as announcements from './field-announcements.service.js'
import {
  fieldPrincipal,
  participantPrincipal,
  staffPrincipal,
} from './field-auth.js'
import * as capture from './field-capture.service.js'
import * as card from './field-card.service.js'
import * as checkin from './field-checkin.service.js'
import * as links from './field-links.service.js'
import * as push from './field-push.service.js'
import * as record from './field-record.service.js'
import * as service from './field.service.js'
import type * as dto from './field.schemas.js'

function readId(request: Request, key = 'id') {
  const value = request.params[key]

  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound('العنصر غير موجود.')
  }

  return value
}

// ── التطبيق: القراءة ───────────────────────────────────────────────────

/** الجواب يتبع من يسأل: مجموعات القائد، أو بطاقة حامل الرابط. */
export const getHome: RequestHandler = async (request, response) => {
  const principal = fieldPrincipal(request)

  response
    .status(200)
    .json(
      principal.kind === 'STAFF'
        ? await service.loadHome(principal)
        : await card.loadCard(principal),
    )
}

export const getSheet: RequestHandler = async (request, response) => {
  const sheet = await service.loadSheet(
    readId(request),
    fieldPrincipal(request),
  )

  response.status(200).json(sheet)
}

// ── حامل الرابط الشخصي ─────────────────────────────────────────────────

export const postLinkRedeem: RequestHandler = async (request, response) => {
  const { token } = request.body as dto.RedeemLinkBody

  response.status(200).json(await links.redeemLink(token))
}

export const postRsvp: RequestHandler = async (request, response) => {
  const updated = await card.setRsvp(
    participantPrincipal(request),
    request.body as dto.RsvpBody,
  )

  response.status(200).json(updated)
}

// ── الإشعارات ──────────────────────────────────────────────────────────

export const getPushKey: RequestHandler = (_request, response) => {
  response.status(200).json(push.pushKey())
}

export const postPushSubscription: RequestHandler = async (
  request,
  response,
) => {
  const state = await push.subscribe(
    fieldPrincipal(request),
    request.body as dto.PushSubscribeBody,
    request.header('user-agent'),
  )

  response.status(200).json(state)
}

export const postPushUnsubscribe: RequestHandler = async (
  request,
  response,
) => {
  const state = await push.unsubscribe(
    fieldPrincipal(request),
    request.body as dto.PushUnsubscribeBody,
  )

  response.status(200).json(state)
}

export const getRecord: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json(await record.loadRecord(participantPrincipal(request)))
}

export const postCertificate: RequestHandler = async (request, response) => {
  const certificate = await record.issueCertificate(
    participantPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(certificate)
}

export const getVerifiedCertificate: RequestHandler = async (
  request,
  response,
) => {
  const { code } = request.validatedParams as dto.CertificateCodeParams

  // مغلَّف بـ`data` كبقية السطح العام: الموقع يقرؤه بالقارئ نفسه.
  response.status(200).json({ data: await record.verifyCertificate(code) })
}

export const postSelfCheckin: RequestHandler = async (request, response) => {
  const updated = await checkin.selfCheckIn(
    participantPrincipal(request),
    request.body as dto.SelfCheckinBody,
    requestTrace(request),
  )

  response.status(200).json(updated)
}

// ── التطبيق: الكتابة ───────────────────────────────────────────────────
//
// كلها تردّ 200 لا 201: الطلب المُعاد بعد انقطاع يعيد ما كُتب أول مرة، فلا
// يعرف المُرسِل — ولا يلزمه أن يعرف — هل أنشأ هذا الطلب الصف أم سبقه أخوه.

export const postAttendance: RequestHandler = async (request, response) => {
  const recorded = await capture.recordAttendance(
    readId(request),
    request.body as dto.AttendanceBody,
    fieldPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(recorded)
}

export const postAttendanceUndo: RequestHandler = async (request, response) => {
  const undone = await capture.undoAttendance(
    readId(request),
    request.body as dto.UndoAttendanceBody,
    fieldPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(undone)
}

export const postImpact: RequestHandler = async (request, response) => {
  const entry = await capture.recordImpact(
    readId(request),
    request.body as dto.FieldImpactBody,
    staffPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(entry)
}

export const postPhotoSign: RequestHandler = async (request, response) => {
  const signed = await capture.signPhotoUpload(
    readId(request),
    request.body as dto.SignPhotoBody,
    staffPrincipal(request),
  )

  response.status(200).json({ data: signed })
}

export const postPhoto: RequestHandler = async (request, response) => {
  const photo = await capture.registerPhoto(
    readId(request),
    request.body as dto.RegisterPhotoBody,
    staffPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(photo)
}

export const postTaskStatus: RequestHandler = async (request, response) => {
  const task = await capture.changeTaskStatusFromField(
    readId(request),
    request.body as dto.FieldTaskStatusBody,
    staffPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(task)
}

export const postTaskComment: RequestHandler = async (request, response) => {
  const task = await capture.commentOnTask(
    readId(request),
    request.body as dto.FieldTaskCommentBody,
    staffPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(task)
}

export const patchSite: RequestHandler = async (request, response) => {
  const site = await capture.changeSiteStatus(
    readId(request),
    request.body as dto.FieldSiteStatusBody,
    staffPrincipal(request),
    requestTrace(request),
  )

  response.status(200).json(site)
}

// ── المنسّق: المجموعات ─────────────────────────────────────────────────

export const getInitiativeField: RequestHandler = async (request, response) => {
  response.status(200).json(await admin.loadInitiativeField(readId(request)))
}

export const getLeadCandidates: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await admin.listLeadCandidates() })
}

export const getPartnerOptions: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await admin.listPartnerOptions() })
}

export const postGroup: RequestHandler = async (request, response) => {
  const field = await admin.createGroup(
    readId(request),
    request.body as adminDto.CreateGroupBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(field)
}

export const patchGroup: RequestHandler = async (request, response) => {
  const field = await admin.updateGroup(
    readId(request),
    readId(request, 'groupId'),
    request.body as adminDto.UpdateGroupBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(field)
}

export const deleteGroup: RequestHandler = async (request, response) => {
  const field = await admin.deleteGroup(
    readId(request),
    readId(request, 'groupId'),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(field)
}

// ── المنسّق: الأعضاء ───────────────────────────────────────────────────

export const getMembers: RequestHandler = async (request, response) => {
  const query = request.validatedQuery as adminDto.MembersQuery

  const members = await admin.listGroupMembers(
    readId(request),
    readId(request, 'groupId'),
    query.day,
  )

  response.status(200).json(members)
}

export const postMembers: RequestHandler = async (request, response) => {
  const result = await admin.addGroupMembers(
    readId(request),
    readId(request, 'groupId'),
    request.body as adminDto.AddMembersBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(result)
}

export const patchMember: RequestHandler = async (request, response) => {
  const members = await admin.updateGroupMember(
    readId(request),
    readId(request, 'groupId'),
    readId(request, 'memberId'),
    request.body as adminDto.UpdateMemberBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(members)
}

export const deleteMember: RequestHandler = async (request, response) => {
  const members = await admin.removeGroupMember(
    readId(request),
    readId(request, 'groupId'),
    readId(request, 'memberId'),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(members)
}

// ── المنسّق: الروابط والإعدادات ────────────────────────────────────────

export const postLinks: RequestHandler = async (request, response) => {
  const issued = await links.createLinks(
    readId(request),
    request.body as adminDto.CreateLinksBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(issued)
}

export const postLinksRevoke: RequestHandler = async (request, response) => {
  const result = await links.revokeLinks(
    readId(request),
    request.body as adminDto.RevokeLinksBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(result)
}

export const getFeedbackForms: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await admin.listFeedbackForms() })
}

export const putSettings: RequestHandler = async (request, response) => {
  const field = await admin.updateSettings(
    readId(request),
    request.body as adminDto.UpdateSettingsBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(field)
}

// ── المنسّق: الإعلانات ─────────────────────────────────────────────────

export const getAnnouncements: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json(await announcements.listAnnouncements(readId(request)))
}

export const postAnnouncement: RequestHandler = async (request, response) => {
  const list = await announcements.createAnnouncement(
    readId(request),
    request.body as adminDto.CreateAnnouncementBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(201).json(list)
}

export const deleteAnnouncement: RequestHandler = async (request, response) => {
  const list = await announcements.deleteAnnouncement(
    readId(request),
    readId(request, 'announcementId'),
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(list)
}

export const getSources: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await admin.listApplicantSources() })
}

export const getApplicants: RequestHandler = async (request, response) => {
  const data = await admin.listApplicants(
    readId(request),
    request.validatedQuery as adminDto.ApplicantsQuery,
  )

  response.status(200).json({ data })
}

export const getParticipants: RequestHandler = async (request, response) => {
  const data = await admin.searchParticipants(
    readId(request),
    request.validatedQuery as adminDto.ParticipantsQuery,
  )

  response.status(200).json({ data })
}

// ── المنسّق: الحضور ────────────────────────────────────────────────────

export const getAttendance: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json({ data: await admin.loadAttendanceSummary(readId(request)) })
}

export const postAttendanceImpact: RequestHandler = async (
  request,
  response,
) => {
  const result = await admin.recordAttendanceImpact(
    readId(request),
    request.body as adminDto.AttendanceImpactBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(result)
}

// ── المنسّق: الصور ─────────────────────────────────────────────────────

export const getPhotos: RequestHandler = async (request, response) => {
  const data = await admin.listPhotos(
    readId(request),
    request.validatedQuery as adminDto.PhotosQuery,
  )

  response.status(200).json({ data })
}

export const patchPhoto: RequestHandler = async (request, response) => {
  const photo = await admin.updatePhoto(
    readId(request),
    readId(request, 'photoId'),
    request.body as adminDto.UpdatePhotoBody,
    request.auth!,
    requestTrace(request),
  )

  response.status(200).json(photo)
}

export const deletePhoto: RequestHandler = async (request, response) => {
  await admin.deletePhoto(
    readId(request),
    readId(request, 'photoId'),
    request.auth!,
    requestTrace(request),
  )

  response.status(204).end()
}
