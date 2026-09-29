import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { impactEntrySchema } from '../impact/impact.schemas.js'
import { siteStatusEnum } from '../initiatives/initiatives.schemas.js'
import {
  attendanceMethodEnum,
  fieldMemberRoleEnum,
  fieldRsvpEnum,
} from './field.schemas.js'

const security = [{ [bearerAuth.name]: [] }]

/** مسارات المنسّق — تنادي بها اللوحة، تحت المبادرة التي يكوّن ميدانها. */
const path = (suffix: string) =>
  `${env.API_PREFIX}/admin/initiatives/{id}/field${suffix}`

const json = <T extends z.ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

const PHONE_PATTERN = /^[+]?[\d\s()-]{6,32}$/

// ── المجموعات ──────────────────────────────────────────────────────────

export const fieldGroupSchema = registry.register(
  'FieldGroup',
  z.object({
    id: z.uuid(),
    initiativeId: z.uuid(),
    siteId: z.uuid(),
    siteNameAr: z.string(),
    siteStatus: siteStatusEnum,
    nameAr: z.string(),
    leadUserId: z.uuid().nullable(),
    leadNameAr: z.string().nullable(),
    meetsAt: z.iso.datetime().nullable(),
    meetingPointAr: z.string().nullable(),
    instructionsAr: z.string().nullable(),
    displayOrder: z.number().int(),
    memberCount: z.number().int(),
    attendedCount: z.number().int().openapi({
      description: 'من حضر من المجموعة يومًا واحدًا على الأقل.',
    }),
    photoCount: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
)

export const initiativeFieldSchema = registry.register(
  'InitiativeField',
  z
    .object({
      initiativeId: z.uuid(),
      groups: z.array(fieldGroupSchema),
    })
    .openapi({
      description:
        'ميدان المبادرة كاملًا. كل مسار كتابة على المجموعات يعيده، فتتحدّث لوحة المنسّق بنداء واحد.',
    }),
)

export const fieldLeadCandidateSchema = registry.register(
  'FieldLeadCandidate',
  z
    .object({
      id: z.uuid(),
      fullNameAr: z.string(),
      roleNameAr: z.string(),
      officeNameAr: z.string(),
    })
    .openapi({
      description:
        'عضو نشط يحمل `field.lead`. الدور والمكتب هما ما منحه القدرة، ليميّز المنسّق بين متشابهَي الاسم.',
    }),
)

export const initiativeParamsSchema = z.object({ id: z.uuid() })

export const groupParamsSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
})

registry.registerPath({
  method: 'get',
  path: path(''),
  tags: ['Field'],
  summary: 'ميدان المبادرة',
  security,
  request: { params: initiativeParamsSchema },
  responses: {
    200: { description: 'المجموعات', ...json(initiativeFieldSchema) },
    403: problemResponse('لا يملك `field.manage`'),
    404: problemResponse('المبادرة غير موجودة'),
  },
})

registry.registerPath({
  method: 'get',
  path: path('/lead-candidates'),
  tags: ['Field'],
  summary: 'من يصلح قائدًا لمجموعة',
  description:
    'الأعضاء النشطون الحاملون `field.lead` بعد الاستثناءات الفردية. مسار خاص لأن المنسّق لا يحمل بالضرورة `users.view`.',
  security,
  request: { params: initiativeParamsSchema },
  responses: {
    200: {
      description: 'المرشحون',
      ...json(z.object({ data: z.array(fieldLeadCandidateSchema) })),
    },
  },
})

const meetingFields = {
  leadUserId: z.uuid().nullable().optional(),
  meetsAt: z.iso.datetime().nullable().optional(),
  meetingPointAr: z.string().max(300).nullable().optional(),
  instructionsAr: z.string().max(4000).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
}

export const createGroupBodySchema = z.object({
  siteId: z.uuid(),
  nameAr: z.string().min(2).max(160),
  ...meetingFields,
})

registry.registerPath({
  method: 'post',
  path: path('/groups'),
  tags: ['Field'],
  summary: 'إضافة مجموعة ميدانية',
  security,
  request: { params: initiativeParamsSchema, body: json(createGroupBodySchema) },
  responses: {
    201: { description: 'أُضيفت', ...json(initiativeFieldSchema) },
    409: problemResponse('في الموقع مجموعة بالاسم نفسه'),
    422: problemResponse(
      'الموقع من مبادرة أخرى أو ملغى، أو القائد لا يحمل `field.lead`، أو المبادرة نقطة خضراء',
    ),
  },
})

export const updateGroupBodySchema = z.object({
  siteId: z.uuid().optional(),
  nameAr: z.string().min(2).max(160).optional(),
  ...meetingFields,
})

registry.registerPath({
  method: 'patch',
  path: path('/groups/{groupId}'),
  tags: ['Field'],
  summary: 'تعديل مجموعة أو تسمية قائدها',
  description: '`leadUserId: null` يترك المجموعة بلا قائد.',
  security,
  request: { params: groupParamsSchema, body: json(updateGroupBodySchema) },
  responses: {
    200: { description: 'عُدِّلت', ...json(initiativeFieldSchema) },
    404: problemResponse('المجموعة غير موجودة في هذه المبادرة'),
    409: problemResponse('في الموقع مجموعة بالاسم نفسه'),
  },
})

registry.registerPath({
  method: 'delete',
  path: path('/groups/{groupId}'),
  tags: ['Field'],
  summary: 'حذف مجموعة',
  description:
    'مجموعة لها سجل حضور لا تُحذف: الحضور أساس الشهادات، وحذفها يمحوه.',
  security,
  request: { params: groupParamsSchema },
  responses: {
    200: { description: 'حُذفت', ...json(initiativeFieldSchema) },
    404: problemResponse('المجموعة غير موجودة في هذه المبادرة'),
    409: problemResponse('للمجموعة سجل حضور'),
  },
})

// ── الأعضاء ────────────────────────────────────────────────────────────

export const groupMemberSchema = registry.register(
  'FieldGroupMember',
  z.object({
    id: z.uuid(),
    participantId: z.uuid(),
    fullNameAr: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    role: fieldMemberRoleEnum,
    rsvp: fieldRsvpEnum,
    fromForm: z.boolean().openapi({
      description: 'أُضيف من طلب استمارة مقبول، لا بيد المنسّق ولا حضورًا بلا تسجيل.',
    }),
    attendedDays: z.number().int(),
    lastAttendedOn: z.iso.date().nullable(),
    attendance: z
      .object({
        id: z.uuid(),
        checkedInAt: z.iso.datetime(),
        method: attendanceMethodEnum,
      })
      .nullable()
      .openapi({ description: 'حضوره القائم في اليوم المطلوب.' }),
  }),
)

export const groupMembersSchema = registry.register(
  'FieldGroupMembers',
  z.object({
    groupId: z.uuid(),
    day: z.iso.date(),
    members: z.array(groupMemberSchema),
  }),
)

export const membersQuerySchema = z.object({
  day: z.iso.date().optional().openapi({
    description: 'اليوم الذي يُعرض حضوره. الافتراضي اليوم بتوقيت دمشق.',
  }),
})

registry.registerPath({
  method: 'get',
  path: path('/groups/{groupId}/members'),
  tags: ['Field'],
  summary: 'أعضاء المجموعة وحضورهم',
  security,
  request: { params: groupParamsSchema, query: membersQuerySchema },
  responses: {
    200: { description: 'الأعضاء', ...json(groupMembersSchema) },
    404: problemResponse('المجموعة غير موجودة في هذه المبادرة'),
  },
})

const person = z.object({
  fullNameAr: z.string().trim().min(2).max(160),
  phone: z
    .string()
    .trim()
    .regex(PHONE_PATTERN, 'صيغة رقم الهاتف غير صحيحة.')
    .optional(),
  email: z.email('صيغة البريد الإلكتروني غير صحيحة.').max(254).optional(),
})

export const addMembersBodySchema = z
  .object({
    formId: z.uuid().optional(),
    submissionIds: z.array(z.uuid()).max(200).default([]),
    participantIds: z.array(z.uuid()).max(200).default([]),
    people: z.array(person).max(200).default([]),
  })
  .refine(
    (value) =>
      value.submissionIds.length +
        value.participantIds.length +
        value.people.length >
      0,
    { message: 'اختر من يُضاف إلى المجموعة.', path: ['people'] },
  )
  .refine((value) => value.submissionIds.length === 0 || Boolean(value.formId), {
    message: 'الطلبات تُرسَل مع استمارتها.',
    path: ['formId'],
  })

export const addMembersResultSchema = registry.register(
  'FieldAddMembersResult',
  groupMembersSchema.extend({
    summary: z.object({
      added: z.number().int(),
      alreadyMembers: z.number().int(),
      newParticipants: z.number().int(),
      skipped: z.array(
        z.object({ submissionId: z.uuid(), reasonAr: z.string() }),
      ),
    }),
  }),
)

registry.registerPath({
  method: 'post',
  path: path('/groups/{groupId}/members'),
  tags: ['Field'],
  summary: 'إضافة أعضاء إلى مجموعة',
  description:
    'من طلبات استمارة مقبولة، أو من سجل المشاركين، أو بإدخال يدوي — في طلب واحد. من سبق تسجيله يُعرف باسمه مع هاتفه أو بريده فلا يتكرر، والطلب بلا اسم يُتخطّى ويُذكر.',
  security,
  request: { params: groupParamsSchema, body: json(addMembersBodySchema) },
  responses: {
    200: { description: 'أُضيفوا', ...json(addMembersResultSchema) },
    404: problemResponse('المجموعة غير موجودة في هذه المبادرة'),
    422: problemResponse('طلب غير مقبول بعد، أو مشارك غير موجود'),
  },
})

export const memberParamsSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  memberId: z.uuid(),
})

export const updateMemberBodySchema = z.object({ role: fieldMemberRoleEnum })

registry.registerPath({
  method: 'patch',
  path: path('/groups/{groupId}/members/{memberId}'),
  tags: ['Field'],
  summary: 'تعديل دور عضو في مجموعته',
  security,
  request: { params: memberParamsSchema, body: json(updateMemberBodySchema) },
  responses: {
    200: { description: 'عُدِّل', ...json(groupMembersSchema) },
    404: problemResponse('العضو غير موجود في هذه المجموعة'),
  },
})

registry.registerPath({
  method: 'delete',
  path: path('/groups/{groupId}/members/{memberId}'),
  tags: ['Field'],
  summary: 'إخراج عضو من مجموعة',
  description:
    'يخرج من قائمة المجموعة ويبقى في سجل المشاركين، وحضوره السابق فيها محفوظ.',
  security,
  request: { params: memberParamsSchema },
  responses: {
    200: { description: 'أُخرج', ...json(groupMembersSchema) },
    404: problemResponse('العضو غير موجود في هذه المجموعة'),
  },
})

// ── مصادر الأعضاء ──────────────────────────────────────────────────────

export const applicantSourceSchema = registry.register(
  'FieldApplicantSource',
  z.object({
    formId: z.uuid(),
    nameAr: z.string(),
    acceptedCount: z.number().int(),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/sources'),
  tags: ['Field'],
  summary: 'استمارات فيها طلبات مقبولة',
  description:
    'مسار خاص لأن المنسّق لا يحمل بالضرورة `forms.view`: يرى من الاستمارة اسمها وعدد مقبوليها، لا أسئلتها ولا بقية طلباتها.',
  security,
  request: { params: initiativeParamsSchema },
  responses: {
    200: {
      description: 'الاستمارات',
      ...json(z.object({ data: z.array(applicantSourceSchema) })),
    },
  },
})

export const applicantSchema = registry.register(
  'FieldApplicant',
  z
    .object({
      submissionId: z.uuid(),
      fullNameAr: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      submittedAt: z.iso.datetime(),
      participantId: z.uuid().nullable().openapi({
        description: 'المشارك الذي صار إليه الطلب، إن حُوّل من قبل.',
      }),
      groupNamesAr: z.array(z.string()).openapi({
        description: 'مجموعاته في هذه المبادرة.',
      }),
    })
    .openapi({
      description:
        'طلب مقبول بما يلزم لتوزيعه: الاسم ووسيلة التواصل. إجاباته تبقى في صندوق الطلبات.',
    }),
)

export const applicantsQuerySchema = z.object({
  formId: z.uuid(),
  q: z.string().trim().max(100).optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/applicants'),
  tags: ['Field'],
  summary: 'الطلبات المقبولة في استمارة',
  security,
  request: { params: initiativeParamsSchema, query: applicantsQuerySchema },
  responses: {
    200: {
      description: 'الطلبات',
      ...json(z.object({ data: z.array(applicantSchema) })),
    },
    404: problemResponse('الاستمارة غير موجودة'),
  },
})

export const participantSummarySchema = registry.register(
  'FieldParticipant',
  z.object({
    id: z.uuid(),
    fullNameAr: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    attendedDays: z.number().int(),
    groupNamesAr: z.array(z.string()).openapi({
      description: 'مجموعاته في هذه المبادرة.',
    }),
  }),
)

export const participantsQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

registry.registerPath({
  method: 'get',
  path: path('/participants'),
  tags: ['Field'],
  summary: 'بحث في سجل المشاركين',
  description: 'بالاسم أو بالهاتف، ممن شارك في أي مبادرة سابقة.',
  security,
  request: { params: initiativeParamsSchema, query: participantsQuerySchema },
  responses: {
    200: {
      description: 'المشاركون',
      ...json(z.object({ data: z.array(participantSummarySchema) })),
    },
  },
})

// ── الحضور ─────────────────────────────────────────────────────────────

export const attendanceDaySchema = registry.register(
  'FieldAttendanceDay',
  z.object({
    day: z.iso.date(),
    siteId: z.uuid(),
    siteNameAr: z.string(),
    present: z.number().int().openapi({
      description:
        'أشخاص مختلفون حضروا في الموقع ذلك اليوم، ولو في أكثر من مجموعة.',
    }),
    groups: z.array(
      z.object({
        groupId: z.uuid(),
        nameAr: z.string(),
        present: z.number().int(),
      }),
    ),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/attendance'),
  tags: ['Field'],
  summary: 'ملخص الحضور بالأيام والمواقع',
  security,
  request: { params: initiativeParamsSchema },
  responses: {
    200: {
      description: 'الملخص',
      ...json(z.object({ data: z.array(attendanceDaySchema) })),
    },
  },
})

export const attendanceImpactBodySchema = z.object({
  metricId: z.uuid(),
  day: z.iso.date(),
})

export const attendanceImpactResultSchema = registry.register(
  'FieldAttendanceImpact',
  z.object({
    recorded: z.array(impactEntrySchema),
    unchanged: z.array(
      z.object({ siteId: z.uuid(), siteNameAr: z.string(), value: z.number() }),
    ),
  }),
)

registry.registerPath({
  method: 'post',
  path: path('/attendance/impact'),
  tags: ['Field'],
  summary: 'تسجيل حضور يومٍ قيدَ أثر',
  description:
    'قيد لكل موقع بعدد من حضروا فيه ذلك اليوم، على المؤشر المختار، مصدره `FIELD_ENTRY` وغير موثَّق. يوم سُجّل حضوره لا يُسجَّل مرتين: إن تغيّر العدد بعده يُعكس القيد الأول ثم يُعاد.',
  security,
  request: {
    params: initiativeParamsSchema,
    body: json(attendanceImpactBodySchema),
  },
  responses: {
    200: { description: 'سُجّل', ...json(attendanceImpactResultSchema) },
    409: problemResponse('سُجّل حضور اليوم بعدد آخر — اعكس قيده أولًا'),
    422: problemResponse('لا حضور في ذلك اليوم، أو المؤشر معطّل'),
  },
})

// ── الصور ──────────────────────────────────────────────────────────────

export const managedPhotoSchema = registry.register(
  'FieldManagedPhoto',
  z.object({
    id: z.uuid(),
    url: z.string(),
    siteId: z.uuid().nullable(),
    siteNameAr: z.string().nullable(),
    workItemId: z.uuid().nullable(),
    workItemTitleAr: z.string().nullable(),
    groupId: z.uuid().nullable(),
    groupNameAr: z.string().nullable(),
    uploadedByNameAr: z.string().nullable(),
    takenAt: z.iso.datetime().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    captionAr: z.string().nullable(),
    hasPeople: z.boolean(),
    peopleConsent: z.boolean(),
    publicUseAllowed: z.boolean(),
    sizeBytes: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
)

export const photosQuerySchema = z.object({
  siteId: z.uuid().optional(),
  groupId: z.uuid().optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/photos'),
  tags: ['Field'],
  summary: 'صور الميدان',
  security,
  request: { params: initiativeParamsSchema, query: photosQuerySchema },
  responses: {
    200: {
      description: 'الصور، الأحدث أولًا',
      ...json(z.object({ data: z.array(managedPhotoSchema) })),
    },
  },
})

export const photoParamsSchema = z.object({
  id: z.uuid(),
  photoId: z.uuid(),
})

export const updatePhotoBodySchema = z.object({
  publicUseAllowed: z.boolean().optional(),
  captionAr: z.string().max(300).nullable().optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/photos/{photoId}'),
  tags: ['Field'],
  summary: 'السماح بنشر صورة أو تعديل وصفها',
  description:
    'الصورة داخلية حتى يُسمح بنشرها هنا. صورة فيها أشخاص بلا موافقتهم لا يُسمح بنشرها.',
  security,
  request: { params: photoParamsSchema, body: json(updatePhotoBodySchema) },
  responses: {
    200: { description: 'عُدِّلت', ...json(managedPhotoSchema) },
    404: problemResponse('الصورة غير موجودة في هذه المبادرة'),
    422: problemResponse('فيها أشخاص بلا موافقتهم'),
  },
})

registry.registerPath({
  method: 'delete',
  path: path('/photos/{photoId}'),
  tags: ['Field'],
  summary: 'حذف صورة',
  description: 'تُمحى من التخزين أيضًا، لا من المعرض وحده.',
  security,
  request: { params: photoParamsSchema },
  responses: {
    204: { description: 'حُذفت' },
    404: problemResponse('الصورة غير موجودة في هذه المبادرة'),
  },
})

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>
export type MembersQuery = z.infer<typeof membersQuerySchema>
export type AddMembersBody = z.infer<typeof addMembersBodySchema>
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>
export type ApplicantsQuery = z.infer<typeof applicantsQuerySchema>
export type ParticipantsQuery = z.infer<typeof participantsQuerySchema>
export type AttendanceImpactBody = z.infer<typeof attendanceImpactBodySchema>
export type PhotosQuery = z.infer<typeof photosQuerySchema>
export type UpdatePhotoBody = z.infer<typeof updatePhotoBodySchema>
