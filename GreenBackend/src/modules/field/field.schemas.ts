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

export const fieldAnnouncementSchema = registry.register(
  'FieldAnnouncement',
  z
    .object({
      id: z.uuid(),
      titleAr: z.string(),
      bodyAr: z.string(),
      groupNameAr: z.string().nullable().openapi({
        description: 'المجموعة التي وُجّه إليها؛ فارغ = كل مجموعات المبادرة.',
      }),
      createdAt: z.iso.datetime(),
    })
    .openapi({
      description:
        'إعلان المنسّق. محتوى في التطبيق قبل أن يكون إشعارًا: يقرؤه من لم يفعّل الإشعارات حين يفتح ورقته أو بطاقته.',
    }),
)

const announcements = z.array(fieldAnnouncementSchema).openapi({
  description: 'أحدث إعلانات المنسّق لهذا القارئ، مما لم يمضِ عليه شهر.',
})

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
        attendanceOnly: z.boolean().openapi({
          description:
            'ورقة مساعد القائد: حضور وحده. المهام والأعداد والصور فارغة فيها، والهواتف محجوبة.',
        }),
      }),
      checkin: z
        .object({
          secret: z.string().openapi({
            description:
              'سرّ رمز الحضور الذاتي، ست‌عشري. منه يحسب الهاتف الرمز بلا شبكة. لا يُعرض.',
          }),
          periodSeconds: z.number().int(),
          digits: z.number().int(),
        })
        .openapi({
          description:
            'رمز الحضور الذاتي: HOTP على SHA-256، عدّاده الوقت مقسومًا على `periodSeconds`.',
        }),
      announcements,
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

// ── بطاقة المشارك ──────────────────────────────────────────────────────

export const fieldCardMembershipSchema = registry.register(
  'FieldCardMembership',
  z.object({
    memberId: z.uuid(),
    role: fieldMemberRoleEnum,
    rsvp: fieldRsvpEnum,
    rsvpAt: z.iso.datetime().nullable(),
    group: z.object({
      id: z.uuid(),
      nameAr: z.string(),
      meetsAt: z.iso.datetime().nullable(),
      meetingPointAr: z.string().nullable(),
      instructionsAr: z.string().nullable(),
      leadNameAr: z.string().nullable(),
      contactPhone: z.string().nullable().openapi({
        description:
          'وسيلة التواصل التي اختارها المنسّق للمجموعة. ليست هاتف القائد من حسابه.',
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
    attendedOn: z.array(z.iso.date()).openapi({
      description: 'أيام حضوره القائم في هذه المجموعة، بتوقيت دمشق.',
    }),
    impact: z
      .array(
        z.object({
          metricId: z.uuid(),
          metricNameAr: z.string(),
          unitAr: z.string(),
          decimals: z.number().int(),
          value: z.number(),
        }),
      )
      .openapi({ description: 'ما تحقق في الموقع — الموثَّق وحده.' }),
    photos: z
      .array(
        z.object({
          id: z.uuid(),
          url: z.string(),
          captionAr: z.string().nullable(),
          takenAt: z.iso.datetime().nullable(),
        }),
      )
      .openapi({ description: 'صور الموقع التي سمح المنسّق بنشرها.' }),
  }),
)

export const fieldCardSchema = registry.register(
  'FieldCard',
  z
    .object({
      kind: z.enum(['PARTICIPANT']),
      participant: z.object({ id: z.uuid(), fullNameAr: z.string() }),
      initiative: z.object({
        id: z.uuid(),
        nameAr: z.string(),
        status: initiativeStatusEnum,
      }),
      link: z.object({ expiresAt: z.iso.datetime() }),
      day: z.iso.date(),
      announcements,
      memberships: z.array(fieldCardMembershipSchema),
      feedback: z
        .object({ nameAr: z.string(), url: z.string() })
        .nullable()
        .openapi({
          description:
            'استمارة التقييم على الموقع العام، إن اختارها المنسّق وكانت تستقبل.',
        }),
      certificate: z
        .object({
          enabled: z.boolean().openapi({
            description: 'هل فعّل المنسّق الشهادات لهذه المبادرة.',
          }),
          code: z.string().nullable().openapi({
            description: 'رمز شهادته إن صدرت.',
          }),
        })
        .openapi({
          description:
            'شهادة المشاركة في هذه المبادرة. تصدر لمن له يوم حضور قائم فيها.',
        }),
      generatedAt: z.iso.datetime(),
    })
    .openapi({
      description:
        'بطاقة المتطوع في مبادرة رابطه: أين ومتى ومع من، ثم ما تحقق بعد اليوم.',
    }),
)

// ── السجل والشهادة ─────────────────────────────────────────────────────

const participationSummary = {
  days: z.number().int().openapi({
    description: 'أيام الحضور القائمة. اليوم يُعدّ مرة ولو حضر في مجموعتين.',
  }),
  hours: z.number().nullable().openapi({
    description:
      'مجموع ساعات مجموعاته في أيام حضوره. `null` حين لم تُحدَّد ساعات لأيٍّ منها.',
  }),
  firstDay: z.iso.date().nullable(),
  lastDay: z.iso.date().nullable(),
  sites: z.array(z.string()),
}

export const fieldRecordSchema = registry.register(
  'FieldRecord',
  z
    .object({
      participant: z.object({ id: z.uuid(), fullNameAr: z.string() }),
      totals: z.object({
        initiatives: z.number().int(),
        days: z.number().int(),
        hours: z.number().nullable(),
      }),
      participations: z.array(
        z.object({
          initiativeId: z.uuid(),
          initiativeNameAr: z.string(),
          initiativeStatus: initiativeStatusEnum,
          programNameAr: z.string(),
          ...participationSummary,
          certificate: z.object({
            code: z.string().nullable(),
            canIssue: z.boolean().openapi({
              description:
                'تُصدَر الآن بهذا الرابط: مبادرة الرابط نفسها، والشهادات مفعّلة فيها.',
            }),
          }),
        }),
      ),
      generatedAt: z.iso.datetime(),
    })
    .openapi({
      description:
        'سجل المشارك عبر الحملات: ما حضره بأيامه وساعاته، الأحدث أولًا. عضوية بلا حضور ليست فيه.',
    }),
)

registry.registerPath({
  method: 'get',
  path: path('/me/record'),
  tags: ['Field'],
  summary: 'سجلّي عبر الحملات',
  description: 'لحامل الرابط الشخصي.',
  security,
  responses: {
    200: { description: 'السجل', ...json(fieldRecordSchema) },
    403: problemResponse('المسار لحامل رابط شخصي'),
  },
})

const certificateFields = {
  code: z.string(),
  issuedAt: z.iso.datetime(),
  fullNameAr: z.string(),
  initiativeNameAr: z.string(),
  programNameAr: z.string(),
  ...participationSummary,
  signer: z
    .object({ nameAr: z.string(), titleAr: z.string().nullable() })
    .nullable(),
}

export const fieldCertificateSchema = registry.register(
  'FieldCertificate',
  z
    .object({
      ...certificateFields,
      verifyUrl: z.string().openapi({
        description: 'صفحة التحقق من الشهادة على الموقع العام.',
      }),
    })
    .openapi({
      description:
        'شهادة المشاركة كما تُطبع. الأيام والساعات من الحضور ساعة القراءة، لا نسخة يوم الإصدار.',
    }),
)

registry.registerPath({
  method: 'post',
  path: path('/me/certificate'),
  tags: ['Field'],
  summary: 'شهادة مشاركتي',
  description:
    'لحامل الرابط الشخصي، في مبادرة رابطه. تصدر عند أول طلب وتعود هي نفسها بعده برمزها.',
  security,
  responses: {
    200: { description: 'الشهادة', ...json(fieldCertificateSchema) },
    403: problemResponse('المسار لحامل رابط شخصي'),
    409: problemResponse('الشهادات غير مفعّلة، أو لا حضور مسجَّلًا له بعد'),
  },
})

export const certificateCodeParamsSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[2-9A-HJ-NP-Z]{10}$/),
})

export const verifiedCertificateSchema = registry.register(
  'VerifiedCertificate',
  z.object(certificateFields).openapi({
    description:
      'ما تقوله الشهادة لمن يتحقق منها: الاسم والحملة والأيام والساعات. لا وسيلة تواصل ولا معرّف.',
  }),
)

registry.registerPath({
  method: 'get',
  path: `${env.API_PREFIX}/public/certificates/{code}`,
  tags: ['Field'],
  summary: 'التحقق من شهادة مشاركة',
  description:
    'بلا مصادقة، محدود المعدل. غير الموجودة وما لم يبقَ لصاحبها يوم حضور جواب واحد.',
  request: { params: certificateCodeParamsSchema },
  responses: {
    200: {
      description: 'الشهادة صحيحة',
      ...json(z.object({ data: verifiedCertificateSchema })),
    },
    404: problemResponse('لا شهادة بهذا الرمز'),
    429: problemResponse('محاولات كثيرة'),
  },
})

// ── القراءة ────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: path('/me'),
  tags: ['Field'],
  summary: 'هويتي ومجموعاتي، أو بطاقتي',
  description:
    'الجواب يتبع من يسأل، ويُعرف بـ`kind`: عضو الفريق يأخذ مجموعاته، وحامل الرابط الشخصي يأخذ بطاقته.',
  security,
  responses: {
    200: {
      description: 'الهوية والمجموعات، أو البطاقة',
      ...json(z.union([fieldHomeSchema, fieldCardSchema])),
    },
    401: problemResponse('بلا جلسة، أو رابط لم يعد صالحًا'),
    403: problemResponse('الحساب ليس من الفريق'),
  },
})

// ── الرابط الشخصي ──────────────────────────────────────────────────────

const LINK_TOKEN_PATTERN = /^plk_[A-Za-z0-9_-]{20,100}$/

export const redeemLinkBodySchema = z.object({
  token: z.string().regex(LINK_TOKEN_PATTERN, 'الرابط غير صالح.').openapi({
    description:
      'الرمز من جزء العنوان (`#`). يُرسَل في الجسم لا في المسار، فلا يُكتب في سجل.',
  }),
})

export const redeemedLinkSchema = registry.register(
  'FieldRedeemedLink',
  z.object({
    participant: z.object({ id: z.uuid(), fullNameAr: z.string() }),
    initiative: z.object({ id: z.uuid(), nameAr: z.string() }),
    expiresAt: z.iso.datetime(),
  }),
)

registry.registerPath({
  method: 'post',
  path: path('/links/redeem'),
  tags: ['Field'],
  summary: 'فتح رابط شخصي',
  description:
    'بلا مصادقة: الرمز هو الاعتماد. يتحقق منه ويعيد اسم صاحبه ومبادرته، وبعده يُرسَل الرمز نفسه في ترويسة `Authorization: Bearer`.',
  request: { body: json(redeemLinkBodySchema) },
  responses: {
    200: { description: 'الرابط صالح', ...json(redeemedLinkSchema) },
    401: problemResponse('الرابط منتهٍ أو مُبطَل أو غير موجود'),
    429: problemResponse('محاولات كثيرة'),
  },
})

export const rsvpBodySchema = z.object({
  memberId: z.uuid().openapi({
    description: 'عضويته في المجموعة التي يؤكّد حضورها، كما في البطاقة.',
  }),
  coming: z.boolean(),
})

registry.registerPath({
  method: 'post',
  path: path('/me/rsvp'),
  tags: ['Field'],
  summary: 'تأكيد الحضور أو الاعتذار',
  description: 'لحامل الرابط الشخصي. حالة تُكتب، فإعادة الطلب آمنة.',
  security,
  request: { body: json(rsvpBodySchema) },
  responses: {
    200: { description: 'سُجّل', ...json(fieldCardSchema) },
    403: problemResponse('المسار لحامل رابط شخصي'),
    404: problemResponse('العضوية ليست له'),
    409: problemResponse('انتهت الحملة أو أُلغي الموقع'),
  },
})

// ── الإشعارات ──────────────────────────────────────────────────────────

export const pushKeySchema = registry.register(
  'FieldPushKey',
  z.object({
    enabled: z.boolean().openapi({
      description: 'هل هيّأ الخادم مفاتيح الإشعارات. بدونها لا اشتراك.',
    }),
    publicKey: z.string().nullable().openapi({
      description:
        'مفتاح VAPID العام (`applicationServerKey`). من الخادم لا من بيئة الموقع، فلا يفترق المفتاحان عند التدوير.',
    }),
  }),
)

registry.registerPath({
  method: 'get',
  path: path('/push/key'),
  tags: ['Field'],
  summary: 'مفتاح الاشتراك في الإشعارات',
  security,
  responses: {
    200: { description: 'المفتاح وحال الإشعارات', ...json(pushKeySchema) },
    401: problemResponse('بلا جلسة، أو رابط لم يعد صالحًا'),
  },
})

const BASE64URL = /^[A-Za-z0-9_-]+$/

export const pushSubscribeBodySchema = z
  .object({
    endpoint: z.url().max(2000),
    keys: z.object({
      p256dh: z.string().min(80).max(100).regex(BASE64URL),
      auth: z.string().min(16).max(50).regex(BASE64URL),
    }),
  })
  .openapi({
    description:
      'اشتراك المتصفح كما يعطيه `PushSubscription.toJSON()`. العنوان يجب أن يكون من خدمة إشعارات معروفة.',
  })

export const pushUnsubscribeBodySchema = z.object({
  endpoint: z.url().max(2000),
})

const pushStateSchema = z.object({ subscribed: z.boolean() })

registry.registerPath({
  method: 'post',
  path: path('/push/subscriptions'),
  tags: ['Field'],
  summary: 'تسجيل اشتراك هذا الجهاز في الإشعارات',
  description:
    'آمن التكرار: التطبيق يعيد إرساله عند كل فتح. والجهاز لمن دخل آخرًا.',
  security,
  request: { body: json(pushSubscribeBodySchema) },
  responses: {
    200: { description: 'سُجّل', ...json(pushStateSchema) },
    409: problemResponse('الإشعارات غير مفعّلة على الخادم'),
    422: problemResponse('عنوان الاشتراك ليس من خدمة إشعارات معروفة'),
  },
})

registry.registerPath({
  method: 'post',
  path: path('/push/subscriptions/remove'),
  tags: ['Field'],
  summary: 'إزالة اشتراك هذا الجهاز',
  description: 'غياب الاشتراك نجاح: المطلوب ألا يصل هذا الجهازَ إشعار.',
  security,
  request: { body: json(pushUnsubscribeBodySchema) },
  responses: {
    200: { description: 'أُزيل', ...json(pushStateSchema) },
  },
})

export const selfCheckinBodySchema = z.object({
  clientId,
  groupId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'الرمز ستة أرقام.')
    .openapi({ description: 'الرمز الظاهر على هاتف قائد المجموعة.' }),
  scannedAt: z.iso.datetime().optional().openapi({
    description:
      'وقت كتابة الرمز على الهاتف. من كتبه بلا شبكة يُرسَل طلبه لاحقًا، والرمز يُفحص على وقت كتابته.',
  }),
})

registry.registerPath({
  method: 'post',
  path: path('/me/checkin'),
  tags: ['Field'],
  summary: 'تسجيل المتطوع حضورَه برمز قائده',
  description:
    'لحامل الرابط الشخصي، في مجموعة هو عضو فيها. الرمز يتبدّل كل دقيقة ويُقبل دقيقتين قبل وقت كتابته وبعده. آمن التكرار.',
  security,
  request: { body: json(selfCheckinBodySchema) },
  responses: {
    200: { description: 'سُجّل حضوره', ...json(fieldCardSchema) },
    403: problemResponse('المسار لحامل رابط شخصي'),
    404: problemResponse('ليس عضوًا في هذه المجموعة'),
    409: problemResponse('المبادرة لا تقبل تسجيلًا الآن، أو الموقع ملغى'),
    422: problemResponse('الرمز غير صحيح أو انتهى وقته'),
    429: problemResponse('محاولات كثيرة'),
  },
})

export const groupIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: path('/groups/{id}'),
  tags: ['Field'],
  summary: 'ورقة يوم المجموعة',
  description:
    'لقائد المجموعة نفسها بـ`field.lead`، ولمن يحمل `field.manage`، ولمساعد قائدها برابطه الشخصي — وورقته حضور وحده. مجموعة ليست لك تعطي 404 كغير الموجودة، فلا تُستكشف المعرّفات.',
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
    'للقائد ولمساعده. آمن التكرار: إعادة الطلب تعيد الحضور نفسه، ومن سُجّل حضوره في اليوم يعود حضوره القائم.',
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
  description:
    'للقائد ولمساعده. بطابع لا بحذف. ما أُلغي سلفًا يعود كما هو.',
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

export type RedeemLinkBody = z.infer<typeof redeemLinkBodySchema>
export type RsvpBody = z.infer<typeof rsvpBodySchema>
export type SelfCheckinBody = z.infer<typeof selfCheckinBodySchema>
export type CertificateCodeParams = z.infer<typeof certificateCodeParamsSchema>
export type PushSubscribeBody = z.infer<typeof pushSubscribeBodySchema>
export type PushUnsubscribeBody = z.infer<typeof pushUnsubscribeBodySchema>
export type AttendanceBody = z.infer<typeof attendanceBodySchema>
export type UndoAttendanceBody = z.infer<typeof undoAttendanceBodySchema>
export type FieldImpactBody = z.infer<typeof fieldImpactBodySchema>
export type SignPhotoBody = z.infer<typeof signPhotoBodySchema>
export type RegisterPhotoBody = z.infer<typeof registerPhotoBodySchema>
export type FieldTaskStatusBody = z.infer<typeof fieldTaskStatusBodySchema>
export type FieldTaskCommentBody = z.infer<typeof fieldTaskCommentBodySchema>
export type FieldSiteStatusBody = z.infer<typeof fieldSiteStatusBodySchema>
