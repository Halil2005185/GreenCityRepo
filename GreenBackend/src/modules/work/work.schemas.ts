import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = (suffix: string) => `${env.API_PREFIX}/admin/work${suffix}`

export const workItemStatusEnum = z.enum([
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
])

export const workItemPriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])

export const milestoneStatusEnum = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
])

export const workScopeKindEnum = z.enum([
  'OFFICE',
  'PROGRAM',
  'INITIATIVE',
  'SITE',
  'PARTNER',
])

// ── التمثيلات ──────────────────────────────────────────────────────────

export const workScopeSchema = registry.register(
  'WorkScope',
  z
    .object({
      kind: workScopeKindEnum,
      id: z.uuid(),
      labelAr: z.string().nullable(),
    })
    .openapi({
      description:
        'الجهة التي تُعلَّق عليها المهمة — واحدة بالضبط. مهام المكاتب موجودة في محاضر الفريق بلا مبادرة، فحصر المهام تحت المبادرات كان سيترك نصف العمل خارج النظام.',
    }),
)

export const workItemCommentSchema = registry.register(
  'WorkItemComment',
  z.object({
    id: z.uuid(),
    authorNameAr: z.string().openapi({
      description:
        'لقطة الاسم وقت الكتابة، فيبقى التعليق مقروءًا بعد تغيّر الحساب أو انتهاء عضويته.',
    }),
    isPartnerAuthor: z.boolean(),
    bodyAr: z.string(),
    isInternal: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
)

export const workItemSummarySchema = registry.register(
  'WorkItemSummary',
  z.object({
    id: z.uuid(),
    titleAr: z.string(),
    descriptionAr: z.string().nullable(),
    status: workItemStatusEnum,
    priority: workItemPriorityEnum,
    scope: workScopeSchema,
    milestoneId: z.uuid().nullable(),
    milestoneTitleAr: z.string().nullable(),
    dueAt: z.iso.datetime().nullable(),
    startedAt: z.iso.datetime().nullable(),
    submittedForReviewAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    assigneeUserId: z.uuid().nullable(),
    assigneeNameAr: z.string().nullable(),
    assignedPartnerId: z.uuid().nullable(),
    assignedPartnerNameAr: z.string().nullable(),
    followUpOfficeId: z.uuid().nullable(),
    followUpOfficeNameAr: z.string().nullable(),
    blockedReasonAr: z.string().nullable(),
    isOverdue: z.boolean(),
    commentCount: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
)

export const workItemDetailSchema = registry.register(
  'WorkItemDetail',
  workItemSummarySchema.extend({
    comments: z.array(workItemCommentSchema),
  }),
)

export const milestoneSchema = registry.register(
  'Milestone',
  z.object({
    id: z.uuid(),
    initiativeId: z.uuid(),
    siteId: z.uuid().nullable(),
    titleAr: z.string(),
    descriptionAr: z.string().nullable(),
    status: milestoneStatusEnum,
    dueAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    displayOrder: z.number().int(),
    taskCount: z.number().int(),
    doneTaskCount: z.number().int(),
  }),
)

// ── المسارات ───────────────────────────────────────────────────────────

/**
 * Express يعطي نصًّا مفردًا حين يرد المعامل مرة، ومصفوفة حين يتكرر.
 * التطبيع هنا يجعل المرشّح شكلًا واحدًا في الخدمة بدل فرعين.
 */
const repeatable = <T extends z.ZodType>(schema: T) =>
  z
    .preprocess(
      (value) =>
        value === undefined ? undefined : Array.isArray(value) ? value : [value],
      z.array(schema).max(6),
    )
    .optional()

export const listTasksQuerySchema = z.object({
  officeId: z.uuid().optional(),
  programId: z.uuid().optional(),
  initiativeId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  partnerId: z.uuid().optional(),
  assigneeUserId: z.uuid().optional(),
  status: repeatable(workItemStatusEnum),
  overdue: z.stringbool().optional(),
  mine: z.stringbool().optional(),
  /** بلا مُسنَد إليه — ما ينتظر من يلتقطه من مكتبه. */
  unassigned: z.stringbool().optional(),
})

registry.registerPath({
  method: 'get',
  path: path('/tasks'),
  tags: ['Work'],
  summary: 'المهام',
  description:
    '`partnerId` يشمل الجهة صاحبة المهمة والجهة المُسنَدة إليها معًا. `overdue` و`mine` مرشّحان يُطبَّقان حين يكونان `true` فقط.',
  security,
  request: { query: listTasksQuerySchema },
  responses: {
    200: {
      description: 'المهام',
      content: {
        'application/json': {
          schema: z.object({ data: z.array(workItemSummarySchema) }),
        },
      },
    },
    403: problemResponse('لا تملك صلاحية عرض المهام'),
  },
})

export const createTaskBodySchema = z.object({
  officeId: z.uuid().optional(),
  programId: z.uuid().optional(),
  initiativeId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  partnerId: z.uuid().optional(),
  milestoneId: z.uuid().optional(),
  titleAr: z.string().min(3).max(300),
  descriptionAr: z.string().max(4000).optional(),
  priority: workItemPriorityEnum.default('NORMAL'),
  assigneeUserId: z.uuid().optional(),
  assignedPartnerId: z.uuid().optional(),
  followUpOfficeId: z.uuid().optional(),
  dueAt: z.iso.datetime().optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/tasks'),
  tags: ['Work'],
  summary: 'إنشاء مهمة',
  description:
    'تُرسَل جهة واحدة بالضبط من `officeId` أو `programId` أو `initiativeId` أو `siteId` أو `partnerId`.',
  security,
  request: {
    body: { content: { 'application/json': { schema: createTaskBodySchema } } },
  },
  responses: {
    201: {
      description: 'أُنشئت',
      content: { 'application/json': { schema: workItemDetailSchema } },
    },
    422: problemResponse('لم تُحدَّد جهة واحدة بالضبط، أو المرحلة تتبع مبادرة أخرى'),
  },
})

export const workItemIdParamsSchema = z.object({ id: z.uuid() })

registry.registerPath({
  method: 'get',
  path: path('/tasks/{id}'),
  tags: ['Work'],
  summary: 'المهمة وتعليقاتها',
  security,
  request: { params: workItemIdParamsSchema },
  responses: {
    200: {
      description: 'المهمة',
      content: { 'application/json': { schema: workItemDetailSchema } },
    },
    404: problemResponse('المهمة غير موجودة'),
  },
})

export const updateTaskBodySchema = z.object({
  titleAr: z.string().min(3).max(300).optional(),
  descriptionAr: z.string().max(4000).nullable().optional(),
  priority: workItemPriorityEnum.optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  assigneeUserId: z.uuid().nullable().optional(),
  assignedPartnerId: z.uuid().nullable().optional(),
  followUpOfficeId: z.uuid().nullable().optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/tasks/{id}'),
  tags: ['Work'],
  summary: 'تعديل المهمة',
  description: 'الحالة لا تُعدَّل من هنا؛ لها مسار انتقال بقواعده.',
  security,
  request: {
    params: workItemIdParamsSchema,
    body: { content: { 'application/json': { schema: updateTaskBodySchema } } },
  },
  responses: {
    200: {
      description: 'عُدِّلت',
      content: { 'application/json': { schema: workItemDetailSchema } },
    },
    404: problemResponse('المهمة غير موجودة'),
  },
})

export const taskStatusBodySchema = z.object({
  status: workItemStatusEnum,
  blockedReasonAr: z.string().min(3).max(1000).optional(),
})

registry.registerPath({
  method: 'post',
  path: path('/tasks/{id}/status'),
  tags: ['Work'],
  summary: 'نقل حالة المهمة',
  description:
    'الانتقالات مقيّدة برسم محدَّد. اعتماد الإنجاز وإعادة الفتح من `DONE` يحتاجان `work.approve` — فاعتمادٌ يستطيع كل من يرى المهمة نقضه ليس اعتمادًا — والإلغاء يحتاج `work.manage`. من يملك `work.manage` وحدها يرسل المهمة للمراجعة ولا يعتمدها. الانتقال إلى `BLOCKED` يلزمه سبب مكتوب.',
  security,
  request: {
    params: workItemIdParamsSchema,
    body: { content: { 'application/json': { schema: taskStatusBodySchema } } },
  },
  responses: {
    200: {
      description: 'نُقلت',
      content: { 'application/json': { schema: workItemDetailSchema } },
    },
    403: problemResponse('الاعتماد أو إعادة الفتح أو الإلغاء يحتاج صلاحية إضافية'),
    409: problemResponse('انتقال غير مسموح بين الحالتين'),
    422: problemResponse('التعثّر يلزمه سبب'),
  },
})

export const createCommentBodySchema = z.object({
  bodyAr: z.string().min(1).max(4000),
  isInternal: z.boolean().default(true),
})

registry.registerPath({
  method: 'post',
  path: path('/tasks/{id}/comments'),
  tags: ['Work'],
  summary: 'إضافة تعليق على المهمة',
  description:
    'تعليق الفريق داخلي افتراضًا؛ خفض `isInternal` إلى `false` يجعله ظاهرًا في بوابة الشريك، ولا يُقبل إلا ممن يملك `work.manage`.',
  security,
  request: {
    params: workItemIdParamsSchema,
    body: {
      content: { 'application/json': { schema: createCommentBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيف',
      content: { 'application/json': { schema: workItemDetailSchema } },
    },
    404: problemResponse('المهمة غير موجودة'),
  },
})

export const createMilestoneBodySchema = z.object({
  initiativeId: z.uuid(),
  siteId: z.uuid().optional(),
  titleAr: z.string().min(3).max(200),
  descriptionAr: z.string().max(4000).optional(),
  dueAt: z.iso.datetime().optional(),
  displayOrder: z.number().int().min(0).max(9999).default(0),
})

registry.registerPath({
  method: 'post',
  path: path('/milestones'),
  tags: ['Work'],
  summary: 'إضافة مرحلة إلى مبادرة',
  security,
  request: {
    body: {
      content: { 'application/json': { schema: createMilestoneBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'أُضيفت',
      content: { 'application/json': { schema: milestoneSchema } },
    },
    422: problemResponse('المبادرة غير موجودة، أو الموقع يتبع مبادرة أخرى'),
  },
})

export const milestoneIdParamsSchema = z.object({ id: z.uuid() })

export const updateMilestoneBodySchema = z.object({
  titleAr: z.string().min(3).max(200).optional(),
  descriptionAr: z.string().max(4000).nullable().optional(),
  status: milestoneStatusEnum.optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
})

registry.registerPath({
  method: 'patch',
  path: path('/milestones/{id}'),
  tags: ['Work'],
  summary: 'تعديل المرحلة أو نقل حالتها',
  security,
  request: {
    params: milestoneIdParamsSchema,
    body: {
      content: { 'application/json': { schema: updateMilestoneBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'عُدِّلت',
      content: { 'application/json': { schema: milestoneSchema } },
    },
    404: problemResponse('المرحلة غير موجودة'),
  },
})

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>
export type TaskStatusBody = z.infer<typeof taskStatusBodySchema>
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>
export type CreateMilestoneBody = z.infer<typeof createMilestoneBodySchema>
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBodySchema>
