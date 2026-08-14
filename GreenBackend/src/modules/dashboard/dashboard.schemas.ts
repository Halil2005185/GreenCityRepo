import { env } from '../../config/env.js'
import { bearerAuth, registry } from '../../openapi/registry.js'
import { z } from '../../openapi/zod.js'

const security = [{ [bearerAuth.name]: [] }]

const taskCounts = z.object({
  open: z.number().int(),
  overdue: z.number().int(),
  blocked: z.number().int(),
  inReview: z.number().int(),
})

export const dashboardSchema = registry.register(
  'DashboardSummary',
  z.object({
    officeId: z.uuid().nullable(),
    officeNameAr: z.string().nullable(),

    myTasks: taskCounts,
    officeTasks: taskCounts.extend({ unassigned: z.number().int() }),

    /**
     * كل قسم `null` حين تنقص القدرة التي تحرسه.
     *
     * الإخفاء يقع في الخادم لا في الواجهة: قسم يُرسل ثم يُخفى في العميل
     * يبقى في الشبكة وفي أدوات المطوّر، وإخفاؤه تجميلٌ لا حماية.
     */
    partners: z
      .object({
        pipeline: z.number().int(),
        pendingApproval: z.number().int(),
        active: z.number().int(),
        suspended: z.number().int(),
      })
      .nullable(),

    initiatives: z
      .object({
        planning: z.number().int(),
        active: z.number().int(),
        campaigns: z.number().int(),
        greenPoints: z.number().int(),
      })
      .nullable(),

    impact: z
      .array(
        z.object({
          metricId: z.uuid(),
          metricNameAr: z.string(),
          unitAr: z.string(),
          total: z.number(),
        }),
      )
      .nullable()
      .openapi({
        description:
          'المجاميع الوطنية من القيود الموثّقة وحدها، عبر كل المبادرات ومواقعها.',
      }),
  }),
)

registry.registerPath({
  method: 'get',
  path: `${env.API_PREFIX}/admin/dashboard`,
  tags: ['Dashboard'],
  summary: 'ملخّص لوحة المكتب',
  description:
    'نداء واحد بدل خمسة: الأعداد تُحسب في الخادم، وما لا تملك قدرته يعود `null` بدل أن يُرسل ويُخفى.',
  security,
  responses: {
    200: {
      description: 'الملخّص',
      content: { 'application/json': { schema: dashboardSchema } },
    },
  },
})
