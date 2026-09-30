import type { Request } from 'express'

import { db } from '../../db/client.js'
import { auditLogs } from '../../db/schema/audit.js'

/** ينفّذ داخل معاملة عند تمريرها، فيبقى الحدث والتغيير ذرّةً واحدة. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AuditEntry = {
  action: string
  actorUserId?: string | null
  actorType?: 'USER' | 'SYSTEM'
  severity?: 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL'
  entityType?: string
  entityId?: string
  entityLabel?: string
  summaryAr?: string
  metadata?: Record<string, unknown>
  /** يبقى `false` افتراضيًا: ما لا يُعلَن مرئيًا للشريك يبقى داخليًا. */
  partnerVisible?: boolean
  ipAddress?: string | null
  userAgent?: string | null
  requestId?: string | null
}

/**
 * سجل التدقيق إضافي فقط. أي تصحيح حدث جديد لا تعديل صف.
 *
 * استثناء واحد: تنفيذ طلب حذف بيانات مشارك (`field-deletion.service.ts`)
 * يمحو اسمه وعنوان هاتفه من صفوف قائمة. الحدث ومن فعله ومتى تبقى كما هي،
 * والتنفيذ نفسه حدث يقول كم صفًّا مسّ.
 *
 * الفشل هنا لا يُسقط العملية الأصلية عند التنفيذ خارج معاملة: خسارة سطر
 * تدقيق أهون من رفض تسجيل دخول صحيح. أما داخل معاملة فالفشل يُمرَّر
 * ليتراجع كل شيء، لأن تغييرًا حساسًا بلا أثر أسوأ من عدم حدوثه.
 */
export async function recordAudit(entry: AuditEntry, executor: Executor = db) {
  const values = {
    action: entry.action,
    actorType: entry.actorType ?? (entry.actorUserId ? 'USER' : 'SYSTEM'),
    actorUserId: entry.actorUserId ?? null,
    severity: entry.severity ?? 'INFO',
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    summaryAr: entry.summaryAr ?? null,
    metadata: entry.metadata ?? {},
    partnerVisible: entry.partnerVisible ?? false,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    requestId: entry.requestId ?? null,
  }

  if (executor !== db) {
    await executor.insert(auditLogs).values(values)
    return
  }

  try {
    await db.insert(auditLogs).values(values)
  } catch (error) {
    console.error('[audit:write-failed]', { action: entry.action, error })
  }
}

/** يلتقط أثر الطلب مرة واحدة بدل تكرار قراءة الترويسات في كل مستدعٍ. */
export function requestTrace(request: Request) {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.header('user-agent')?.slice(0, 400) ?? null,
    requestId: request.id,
  }
}

export type RequestTrace = ReturnType<typeof requestTrace>
