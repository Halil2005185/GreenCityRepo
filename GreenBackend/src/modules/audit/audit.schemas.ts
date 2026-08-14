import { env } from '../../config/env.js'
import { bearerAuth, problemResponse, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]
const path = `${env.API_PREFIX}/admin/audit-logs`

export const auditEntrySchema = registry.register(
  'AuditEntry',
  z.object({
    id: z.uuid(),
    action: z.string(),
    severity: z.enum(['INFO', 'NOTICE', 'WARNING', 'CRITICAL']),
    actorType: z.enum(['USER', 'SYSTEM']),
    actorNameAr: z.string().nullable(),
    entityType: z.string().nullable(),
    entityId: z.uuid().nullable(),
    entityLabel: z.string().nullable(),
    summaryAr: z.string().nullable(),
    ipAddress: z.string().nullable(),
    createdAt: z.iso.datetime(),
  }),
)

export const listAuditQuerySchema = z.object({
  severity: z.enum(['INFO', 'NOTICE', 'WARNING', 'CRITICAL']).optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  /** ترقيم بالمؤشر: الطابع الزمني للصف الأخير المعروض. */
  before: z.iso.datetime().optional(),
})

registry.registerPath({
  method: 'get',
  path,
  tags: ['Audit'],
  summary: 'سجل التدقيق',
  description:
    'إضافي فقط ولا يُعدَّل ولا يُحذف. الترقيم بمؤشر زمني لا بإزاحة، فالسجل ينمو باستمرار وترقيم الإزاحة يعيد صفوفًا أو يتخطّاها كلما أُضيف صف أثناء التصفح.',
  security,
  request: { query: listAuditQuerySchema },
  responses: {
    200: {
      description: 'السجل',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(auditEntrySchema),
            nextBefore: z.iso.datetime().nullable(),
          }),
        },
      },
    },
    403: problemResponse('يحتاج صلاحية الاطلاع على سجل التدقيق'),
  },
})

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>
