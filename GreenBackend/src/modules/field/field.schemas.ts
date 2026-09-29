import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'
import {
  initiativeStatusEnum,
  siteStatusEnum,
} from '../initiatives/initiatives.schemas.js'
import { metricAggregationEnum } from '../metrics/metrics.schemas.js'
import {
  workItemPriorityEnum,
  workItemStatusEnum,
} from '../work/work.schemas.js'

const security = [{ [bearerAuth.name]: [] }]

/** مسارات التطبيق الميداني — ينادي بها الهاتف من الموقع. */
const appPath = (suffix: string) => `${env.API_PREFIX}/field${suffix}`

/** مسارات المنسّق — تنادي بها اللوحة، تحت المبادرة التي يكوّن مجموعاتها. */
const adminPath = (suffix: string) =>
  `${env.API_PREFIX}/admin/initiatives/{id}/field${suffix}`

// ── تمثيلات المنسّق ────────────────────────────────────────────────────

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
        'ميدان المبادرة كاملًا. كل مسار كتابة يعيده، فتتحدّث لوحة المنسّق بنداء واحد.',
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

// ── تمثيلات التطبيق ────────────────────────────────────────────────────

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
  z.object({
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
      tasks: z.array(fieldTaskSchema),
      targets: z.array(fieldTargetSchema),
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

// ── مسارات التطبيق ─────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: appPath('/me'),
  tags: ['Field'],
  summary: 'هويتي ومجموعاتي',
  security,
  responses: {
    200: {
      description: 'الهوية والمجموعات',
      content: { 'application/json': { schema: fieldHomeSchema } },
    },
    401: problemResponse('بلا جلسة'),
    403: problemResponse('الحساب ليس من الفريق'),
  },
})

export const groupIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: appPath('/groups/{id}'),
  tags: ['Field'],
  summary: 'ورقة يوم المجموعة',
  description:
    'لقائد المجموعة نفسها بـ`field.lead`، ولمن يحمل `field.manage`. مجموعة يقودها غيرك تعطي 404 كغير الموجودة، فلا تُستكشف المعرّفات.',
  security,
  request: { params: groupIdParamsSchema },
  responses: {
    200: {
      description: 'ورقة اليوم',
      content: { 'application/json': { schema: fieldSheetSchema } },
    },
    404: problemResponse('المجموعة غير موجودة أو ليست لك'),
  },
})

// ── مسارات المنسّق ─────────────────────────────────────────────────────

export const initiativeParamsSchema = z.object({ id: z.uuid() })

export const groupParamsSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
})

registry.registerPath({
  method: 'get',
  path: adminPath(''),
  tags: ['Field'],
  summary: 'ميدان المبادرة',
  security,
  request: { params: initiativeParamsSchema },
  responses: {
    200: {
      description: 'المجموعات',
      content: { 'application/json': { schema: initiativeFieldSchema } },
    },
    403: problemResponse('لا يملك `field.manage`'),
    404: problemResponse('المبادرة غير موجودة'),
  },
})

registry.registerPath({
  method: 'get',
  path: adminPath('/lead-candidates'),
  tags: ['Field'],
  summary: 'من يصلح قائدًا لمجموعة',
  description:
    'الأعضاء النشطون الحاملون `field.lead` بعد الاستثناءات الفردية. مسار خاص لأن المنسّق لا يحمل بالضرورة `users.view`.',
  security,
  request: { params: initiativeParamsSchema },
  responses: {
    200: {
      description: 'المرشحون',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(fieldLeadCandidateSchema) }),
        },
      },
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
  path: adminPath('/groups'),
  tags: ['Field'],
  summary: 'إضافة مجموعة ميدانية',
  security,
  request: {
    params: initiativeParamsSchema,
    body: { content: { 'application/json': { schema: createGroupBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُضيفت',
      content: { 'application/json': { schema: initiativeFieldSchema } },
    },
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
  path: adminPath('/groups/{groupId}'),
  tags: ['Field'],
  summary: 'تعديل مجموعة أو تسمية قائدها',
  description: '`leadUserId: null` يترك المجموعة بلا قائد.',
  security,
  request: {
    params: groupParamsSchema,
    body: { content: { 'application/json': { schema: updateGroupBodySchema } } },
  },
  responses: {
    200: {
      description: 'عُدِّلت',
      content: { 'application/json': { schema: initiativeFieldSchema } },
    },
    404: problemResponse('المجموعة غير موجودة في هذه المبادرة'),
    409: problemResponse('في الموقع مجموعة بالاسم نفسه'),
  },
})

registry.registerPath({
  method: 'delete',
  path: adminPath('/groups/{groupId}'),
  tags: ['Field'],
  summary: 'حذف مجموعة',
  security,
  request: { params: groupParamsSchema },
  responses: {
    200: {
      description: 'حُذفت',
      content: { 'application/json': { schema: initiativeFieldSchema } },
    },
    404: problemResponse('المجموعة غير موجودة في هذه المبادرة'),
  },
})

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>
