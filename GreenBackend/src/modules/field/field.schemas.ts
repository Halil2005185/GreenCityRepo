import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import { impactEntrySchema } from '../impact/impact.schemas.js'
import {
  initiativeStatusEnum,
  siteStatusEnum,
} from '../initiatives/initiatives.schemas.js'
import { metricAggregationEnum } from '../metrics/metrics.schemas.js'
import { signedUploadSchema } from '../uploads/uploads.schemas.js'
import {
  workItemPriorityEnum,
  workItemStatusEnum,
} from '../work/work.schemas.js'

const security = [{ [bearerAuth.name]: [] }]

/** مسارات التطبيق الميداني — ينادي بها الهاتف من الموقع. */
const path = (suffix: string) => `${env.API_PREFIX}/field${suffix}`

const json = <T extends z.ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

export const fieldMemberRoleEnum = z.enum(['MEMBER', 'ASSISTANT'])
export const fieldRsvpEnum = z.enum(['UNKNOWN', 'COMING', 'NOT_COMING'])
export const attendanceMethodEnum = z.enum(['LEAD_TAP', 'WALK_IN', 'SELF'])

/**
 * معرّف يولّده الهاتف قبل الإرسال. كل كتابة ميدانية تحمله: الطلب يُعاد بعد
 * انقطاع حتى يصل جوابه، والخادم يعيد الصف الأول بدل أن يكتب ثانيًا.
 */
const clientId = z.uuid().openapi({
  description:
    'معرّف المُرسِل. إعادة الطلب بالمعرّف نفسه تعيد النتيجة الأولى ولا تكتب ثانية.',
})

const PHONE_PATTERN = /^[+]?[\d\s()-]{6,32}$/

// ── التمثيلات ──────────────────────────────────────────────────────────

export const fieldGroupCardSchema = registry.register(
  'FieldGroupCard',
  z.object({
    id: z.uuid(),
    nameAr: z.string(),
    meetsAt: z.iso.datetime().nullable(),
    meetingPointAr: z.string().nullable(),
    initiativeId: z.uuid(),
    initiativeNameAr: z.string(),
    initiativeStatus: initiativeStatusEnum,
    siteId: z.uuid(),
    siteNameAr: z.string(),
    siteStatus: siteStatusEnum,
    areaNameAr: z.string().nullable(),
    taskCount: z.number().int(),
    openTaskCount: z.number().int().openapi({
      description: 'مهام الموقع التي لم تُنجز ولم تُلغَ.',
    }),
    memberCount: z.number().int(),
    presentToday: z.number().int().openapi({
      description: 'من سُجّل حضورهم اليوم بتوقيت دمشق.',
    }),
  }),
)

export const fieldHomeSchema = registry.register(
  'FieldHome',
  z.object({
    kind: z.enum(['STAFF']),
    user: z.object({ id: z.uuid(), fullNameAr: z.string() }),
    canLead: z.boolean(),
    canManage: z.boolean(),
    groups: z.array(fieldGroupCardSchema).openapi({
      description:
        'المجموعات التي يقودها صاحب الجلسة، الأقرب موعدًا أولًا. مجموعات المبادرات الملغاة والمواقع الملغاة لا تظهر.',
    }),
  }),
)

export const fieldTaskSchema = registry.register(
  'FieldTask',
  z.object({
    id: z.uuid(),
    titleAr: z.string(),
    descriptionAr: z.string().nullable(),
    status: workItemStatusEnum,
    priority: workItemPriorityEnum,
    scope: z.enum(['SITE', 'INITIATIVE']).openapi({
      description:
        '`SITE` مهمة معلَّقة على موقع المجموعة. `INITIATIVE` مهمة على المبادرة أُسندت إلى قائد المجموعة نفسه.',
    }),
    milestoneTitleAr: z.string().nullable(),
    dueAt: z.iso.datetime().nullable(),
    isOverdue: z.boolean(),
    blockedReasonAr: z.string().nullable(),
    assigneeNameAr: z.string().nullable(),
    commentCount: z.number().int(),
  }),
)

export const fieldTargetSchema = registry.register(
  'FieldTarget',
  z
    .object({
      metricId: z.uuid(),
      metricNameAr: z.string(),
      unitAr: z.string(),
      decimals: z.number().int(),
      aggregation: metricAggregationEnum,
      target: z.number().nullable(),
      actual: z.number().openapi({ description: 'الموثَّق وحده.' }),
      unverified: z.number().openapi({
        description: 'ما أُدخل وينتظر تحقق المنسّق — ومنه ما يُدخل من الميدان.',
      }),
    })
    .openapi({
      description:
        'مؤشر يُعدّ في هذا الموقع: له هدف فيه، أو قيد سُجّل عليه، أو هدف على المبادرة لم يُوزَّع على مواقعها بعد.',
    }),
)

export const fieldAttendanceSchema = registry.register(
  'FieldAttendance',
  z.object({
    id: z.uuid(),
    groupId: z.uuid(),
    participantId: z.uuid(),
    memberId: z.uuid().nullable(),
    fullNameAr: z.string(),
    attendedOn: z.iso.date().openapi({ description: 'يوم الحضور بتوقيت دمشق.' }),
    checkedInAt: z.iso.datetime(),
    method: attendanceMethodEnum,
    undoneAt: z.iso.datetime().nullable(),
  }),
)

export const fieldMemberSchema = registry.register(
  'FieldMember',
  z.object({
    id: z.uuid(),
    participantId: z.uuid(),
    fullNameAr: z.string(),
    phone: z.string().nullable().openapi({
      description:
        'يخرج لقائد المجموعة ومنسّقها وحدهما — من يحتاجانه ليسألا من تأخر.',
    }),
    role: fieldMemberRoleEnum,
    rsvp: fieldRsvpEnum,
    attendance: z
      .object({
        id: z.uuid(),
        checkedInAt: z.iso.datetime(),
        method: attendanceMethodEnum,
      })
      .nullable()
      .openapi({ description: 'حضوره القائم في يوم الورقة، إن حضر.' }),
  }),
)

export const fieldPhotoSchema = registry.register(
  'FieldPhoto',
  z.object({
    id: z.uuid(),
    url: z.string(),
    workItemId: z.uuid().nullable(),
    takenAt: z.iso.datetime().nullable(),
    captionAr: z.string().nullable(),
    hasPeople: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
)

export const fieldSheetSchema = registry.register(
  'FieldSheet',
  z
    .object({
      group: z.object({
        id: z.uuid(),
        nameAr: z.string(),
        meetsAt: z.iso.datetime().nullable(),
        meetingPointAr: z.string().nullable(),
        instructionsAr: z.string().nullable(),
        leadUserId: z.uuid().nullable(),
        leadNameAr: z.string().nullable(),
      }),
      initiative: z.object({
        id: z.uuid(),
        nameAr: z.string(),
        status: initiativeStatusEnum,
        acceptsEntries: z.boolean().openapi({
          description:
            'هل يُقبل تسجيل من الميدان الآن: المبادرة جارية، أو أُغلقت قريبًا فيُقبل ما التُقط قبل إغلاقها ووصل بعده.',
        }),
      }),
      site: z.object({
        id: z.uuid(),
        nameAr: z.string(),
        descriptionAr: z.string().nullable(),
        status: siteStatusEnum,
        areaNameAr: z.string().nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
      }),
      day: z.iso.date().openapi({
        description: 'يوم الورقة بتوقيت دمشق؛ حضور الأعضاء فيها حضور هذا اليوم.',
      }),
      permissions: z.object({
        canApproveTasks: z.boolean().openapi({
          description:
            'من يعتمد الإنجاز ينهي المهمة، ومن لا يعتمده يرسلها للمراجعة.',
        }),
      }),
      tasks: z.array(fieldTaskSchema),
      targets: z.array(fieldTargetSchema),
      members: z.array(fieldMemberSchema),
      photos: z.array(fieldPhotoSchema).openapi({
        description: 'أحدث ما التقطته المجموعة. المعرض كاملًا في اللوحة.',
      }),
      photoCount: z.number().int(),
      generatedAt: z.iso.datetime().openapi({
        description:
          'وقت الخادم عند بناء الورقة. التطبيق يحفظها ويعرضها بلا شبكة، وهذا ما يقوله عن عمرها.',
      }),
    })
    .openapi({
      description:
        'ورقة يوم المجموعة في نداء واحد: تُجلب مرة عند الفتح وتُقرأ بعدها من الجهاز.',
    }),
)

// ── القراءة ────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: path('/me'),
  tags: ['Field'],
  summary: 'هويتي ومجموعاتي',
  security,
  responses: {
    200: { description: 'الهوية والمجموعات', ...json(fieldHomeSchema) },
    401: problemResponse('بلا جلسة'),
    403: problemResponse('الحساب ليس من الفريق'),
  },
})

export const groupIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: path('/groups/{id}'),
  tags: ['Field'],
  summary: 'ورقة يوم المجموعة',
  description:
    'لقائد المجموعة نفسها بـ`field.lead`، ولمن يحمل `field.manage`. مجموعة يقودها غيرك تعطي 404 كغير الموجودة، فلا تُستكشف المعرّفات.',
  security,
  request: { params: groupIdParamsSchema },
  responses: {
    200: { description: 'ورقة اليوم', ...json(fieldSheetSchema) },
    404: problemResponse('المجموعة غير موجودة أو ليست لك'),
  },
})

// ── الحضور ─────────────────────────────────────────────────────────────

const writeResponses = {
  404: problemResponse('المجموعة غير موجودة أو ليست لك'),
  409: problemResponse('المبادرة لا تقبل تسجيلًا الآن، أو الموقع ملغى'),
  422: problemResponse('بيانات غير صالحة'),
}

export const attendanceBodySchema = z
  .object({
    clientId,
    participantId: z.uuid().optional(),
    walkIn: z
      .object({
        fullNameAr: z.string().trim().min(2).max(160),
        phone: z
          .string()
          .trim()
          .regex(PHONE_PATTERN, 'صيغة رقم الهاتف غير صحيحة.')
          .optional(),
      })
      .optional()
      .openapi({
        description:
          'من جاء بلا تسجيل مسبق. يُضاف عضوًا في المجموعة ويُسجَّل حضوره معًا.',
      }),
    checkedInAt: z.iso.datetime().optional().openapi({
      description:
        'وقت النقرة على الهاتف. يُقبل ما مضى حتى مهلة الاستقبال، ولا يُقبل المستقبل.',
    }),
  })
  .refine(
    (value) => Boolean(value.participantId) !== Boolean(value.walkIn),
    {
      message: 'يُرسَل عضو من القائمة أو شخص جاء بلا تسجيل — واحد منهما.',
      path: ['participantId'],
    },
  )

registry.registerPath({
  method: 'post',
  path: path('/groups/{id}/attendance'),
  tags: ['Field'],
  summary: 'تسجيل حضور',
  description:
    'آمن التكرار: إعادة الطلب تعيد الحضور نفسه، ومن سُجّل حضوره في اليوم يعود حضوره القائم.',
  security,
  request: { params: groupIdParamsSchema, body: json(attendanceBodySchema) },
  responses: {
    200: { description: 'سُجّل', ...json(fieldAttendanceSchema) },
    ...writeResponses,
  },
})

export const undoAttendanceBodySchema = z
  .object({
    attendanceId: z.uuid().optional(),
    attendanceClientId: z.uuid().optional().openapi({
      description:
        'معرّف المُرسِل الذي سُجّل به الحضور — لمن سجّل وتراجع بلا شبكة، فلا يعرف هاتفه معرّف الخادم.',
    }),
  })
  .refine(
    (value) => Boolean(value.attendanceId) !== Boolean(value.attendanceClientId),
    {
      message: 'يُعرَّف الحضور بمعرّفه أو بمعرّف المُرسِل — واحد منهما.',
      path: ['attendanceId'],
    },
  )

registry.registerPath({
  method: 'post',
  path: path('/groups/{id}/attendance/undo'),
  tags: ['Field'],
  summary: 'التراجع عن حضور',
  description: 'بطابع لا بحذف. ما أُلغي سلفًا يعود كما هو.',
  security,
  request: { params: groupIdParamsSchema, body: json(undoAttendanceBodySchema) },
  responses: {
    200: { description: 'أُلغي', ...json(fieldAttendanceSchema) },
    ...writeResponses,
  },
})

// ── الأعداد ────────────────────────────────────────────────────────────

export const fieldImpactBodySchema = z.object({
  clientId,
  metricId: z.uuid(),
  value: z.number().positive().max(999_999_999_999),
  occurredAt: z.iso.datetime().optional(),
  noteAr: z.string().max(2000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/groups/{id}/impact'),
  tags: ['Field'],
  summary: 'تسجيل رقم من الموقع',
  description:
    'قيد أثر على موقع المجموعة، مصدره `FIELD_ENTRY`، غير موثَّق. يدخل المجاميع حين يتحقق منه المنسّق.',
  security,
  request: { params: groupIdParamsSchema, body: json(fieldImpactBodySchema) },
  responses: {
    200: { description: 'سُجّل', ...json(impactEntrySchema) },
    ...writeResponses,
  },
})

// ── الصور ──────────────────────────────────────────────────────────────

export const signPhotoBodySchema = z.object({
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive(),
})

registry.registerPath({
  method: 'post',
  path: path('/groups/{id}/photos/sign'),
  tags: ['Field'],
  summary: 'رابط رفع موقّع لصورة',
  description:
    'الصورة تُرفع من الهاتف إلى التخزين مباشرة ولا تمرّ بالخادم، ثم تُسجَّل بـ`/groups/{id}/photos`.',
  security,
  request: { params: groupIdParamsSchema, body: json(signPhotoBodySchema) },
  responses: {
    200: {
      description: 'وُقِّع',
      ...json(z.object({ data: signedUploadSchema })),
    },
    ...writeResponses,
  },
})

export const registerPhotoBodySchema = z.object({
  clientId,
  url: z.url().max(500),
  contentType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  taskId: z.uuid().optional().openapi({
    description: 'مهمة من ورقة المجموعة صُوّرت الصورة لها — عائق أو إنجاز.',
  }),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional()
    .openapi({
      description:
        'يُطلب صراحةً من الهاتف عند الالتقاط، ولا يُرسَل إن رُفض الإذن.',
    }),
  takenAt: z.iso.datetime().optional(),
  captionAr: z.string().max(300).optional(),
  hasPeople: z.boolean(),
  peopleConsent: z.boolean().openapi({
    description:
      'أُخذت موافقة من في الصورة، ووليّ الأمر للأطفال. صورة فيها أشخاص بلا هذا تُرفض.',
  }),
})

registry.registerPath({
  method: 'post',
  path: path('/groups/{id}/photos'),
  tags: ['Field'],
  summary: 'تسجيل صورة بعد رفعها',
  description:
    'الرابط يجب أن يكون مما وُقّع لصور الميدان. الصورة داخلية حتى يسمح المنسّق بنشرها من اللوحة.',
  security,
  request: { params: groupIdParamsSchema, body: json(registerPhotoBodySchema) },
  responses: {
    200: { description: 'سُجّلت', ...json(fieldPhotoSchema) },
    ...writeResponses,
  },
})

// ── المهام ─────────────────────────────────────────────────────────────

export const taskIdParamsSchema = z.object({ id: z.uuid() })

export const fieldTaskStatusBodySchema = z
  .object({
    groupId: z.uuid(),
    status: z.enum(['IN_PROGRESS', 'BLOCKED', 'DONE']).openapi({
      description:
        '`DONE` نيّة «أُنجزت»: تصير منجزة عند من يعتمد الإنجاز، و«بانتظار الاعتماد» عند غيره.',
    }),
    blockedReasonAr: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((value) => value.status !== 'BLOCKED' || Boolean(value.blockedReasonAr), {
    message: 'العائق يلزمه سبب مكتوب.',
    path: ['blockedReasonAr'],
  })

registry.registerPath({
  method: 'post',
  path: path('/tasks/{id}/status'),
  tags: ['Field'],
  summary: 'نقل مهمة من الميدان',
  description:
    'المهمة يجب أن تكون من ورقة المجموعة. النقل إلى ما هي فيه نجاح بلا أثر.',
  security,
  request: { params: taskIdParamsSchema, body: json(fieldTaskStatusBodySchema) },
  responses: {
    200: { description: 'نُقلت', ...json(fieldTaskSchema) },
    ...writeResponses,
  },
})

export const fieldTaskCommentBodySchema = z.object({
  clientId,
  groupId: z.uuid(),
  bodyAr: z.string().trim().min(1).max(4000),
})

registry.registerPath({
  method: 'post',
  path: path('/tasks/{id}/comments'),
  tags: ['Field'],
  summary: 'ملاحظة ميدانية على مهمة',
  description: 'داخلية دائمًا: إظهارها للشريك قرار من يدير العمل من اللوحة.',
  security,
  request: { params: taskIdParamsSchema, body: json(fieldTaskCommentBodySchema) },
  responses: {
    200: { description: 'أُضيفت', ...json(fieldTaskSchema) },
    ...writeResponses,
  },
})

// ── الموقع ─────────────────────────────────────────────────────────────

export const fieldSiteStatusBodySchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
})

registry.registerPath({
  method: 'patch',
  path: path('/groups/{id}/site'),
  tags: ['Field'],
  summary: 'بدء العمل في الموقع أو إغلاقه',
  description:
    'يبدأ القائد العمل ويغلقه ويعيد فتحه. الإلغاء قرار المنسّق من اللوحة.',
  security,
  request: { params: groupIdParamsSchema, body: json(fieldSiteStatusBodySchema) },
  responses: {
    200: {
      description: 'نُقل',
      ...json(z.object({ siteId: z.uuid(), status: siteStatusEnum })),
    },
    ...writeResponses,
  },
})

export type AttendanceBody = z.infer<typeof attendanceBodySchema>
export type UndoAttendanceBody = z.infer<typeof undoAttendanceBodySchema>
export type FieldImpactBody = z.infer<typeof fieldImpactBodySchema>
export type SignPhotoBody = z.infer<typeof signPhotoBodySchema>
export type RegisterPhotoBody = z.infer<typeof registerPhotoBodySchema>
export type FieldTaskStatusBody = z.infer<typeof fieldTaskStatusBodySchema>
export type FieldTaskCommentBody = z.infer<typeof fieldTaskCommentBodySchema>
export type FieldSiteStatusBody = z.infer<typeof fieldSiteStatusBodySchema>
