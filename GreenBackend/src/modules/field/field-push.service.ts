import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import webpush from 'web-push'

import { errors } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import { pushJobs, pushSubscriptions } from '../../db/schema/field-notify.js'
import type { FieldPrincipal } from './field-auth.js'
import type * as dto from './field.schemas.js'

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── الإعداد ────────────────────────────────────────────────────────────

/** مفتاح P-256 عام غير مضغوط (65 بايتًا) وخاص (32 بايتًا)، بترميز base64url. */
const PUBLIC_KEY = /^[A-Za-z0-9_-]{86,88}$/
const PRIVATE_KEY = /^[A-Za-z0-9_-]{42,44}$/
const SUBJECT = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/

/** ما قيل عنه مرة لا يُعاد مع كل طلب. */
const warned = new Set<string>()

function warnOnce(message: string) {
  if (warned.has(message)) return

  warned.add(message)
  console.warn(`[push:config] ${message}`)
}

/**
 * الإشعارات تعمل حين تكتمل مفاتيحها الثلاثة وتصحّ صيغتها. نصفها إعداد ناقص
 * لا إعداد: مفتاح عام بلا خاص يشترك به الهاتف ولا يوقّع به الخادم.
 *
 * والخطأ فيها يعطّلها وحدها ويُكتب في السجل: الإشعارات زيادة على النظام،
 * وسطر لُصق خطأً في `.env` لا يوقف خادمًا يخدم كل ما عداها.
 */
export function pushConfig() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env

  if (!VAPID_PUBLIC_KEY && !VAPID_PRIVATE_KEY && !VAPID_SUBJECT) return null

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    warnOnce(
      'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set together. Push is disabled.',
    )

    return null
  }

  if (
    !PUBLIC_KEY.test(VAPID_PUBLIC_KEY) ||
    !PRIVATE_KEY.test(VAPID_PRIVATE_KEY) ||
    !SUBJECT.test(VAPID_SUBJECT)
  ) {
    // أيّها الخاطئ يُقال باسمه لا بقيمته: القيمة سرّ، والسجل يُقرأ.
    warnOnce(
      'VAPID keys must be base64url (generate with: npx web-push generate-vapid-keys) and VAPID_SUBJECT a mailto: or https: address. Push is disabled.',
    )

    return null
  }

  return {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject: VAPID_SUBJECT,
  }
}

export const pushEnabled = () => pushConfig() !== null

export function pushKey() {
  const config = pushConfig()

  return { enabled: config !== null, publicKey: config?.publicKey ?? null }
}

/**
 * خدمات الإشعار المعروفة. عنوان الاشتراك يكتبه المتصفح، ومن يكتب طلبًا بيده
 * يكتب ما يشاء — والخادم يرسل إليه طلبًا. بلا هذه القائمة يصير مسار
 * الاشتراك وسيلة لجعل الخادم يطرق عناوين داخل شبكته.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  '.push.services.mozilla.com',
  '.notify.windows.com',
  '.push.apple.com',
]

export function isPushServiceEndpoint(value: string) {
  try {
    const url = new URL(value)

    if (url.protocol !== 'https:' || url.port !== '') return false

    return PUSH_HOSTS.some((host) =>
      host.startsWith('.')
        ? url.hostname.endsWith(host)
        : url.hostname === host,
    )
  } catch {
    return false
  }
}

// ── الاشتراك ───────────────────────────────────────────────────────────

const ownerOf = (principal: FieldPrincipal) =>
  principal.kind === 'STAFF'
    ? { userId: principal.userId, participantId: null, initiativeId: null }
    : {
        userId: null,
        participantId: principal.participantId,
        initiativeId: principal.initiativeId,
      }

const ownedBy = (principal: FieldPrincipal) =>
  principal.kind === 'STAFF'
    ? eq(pushSubscriptions.userId, principal.userId)
    : and(
        eq(pushSubscriptions.participantId, principal.participantId),
        eq(pushSubscriptions.initiativeId, principal.initiativeId),
      )

/**
 * يسجّل اشتراك هذا الجهاز لصاحب الجلسة. آمن التكرار: التطبيق يعيد إرساله
 * عند كل فتح ليبقى الخادم على ما عند المتصفح.
 *
 * والجهاز لمن دخل آخرًا: قائد سلّم هاتفه لغيره، أو متطوع فُتح على هاتفه
 * رابط أخيه — الإشعار يتبع من يفتح التطبيق الآن لا من فتحه أمس.
 */
export async function subscribe(
  principal: FieldPrincipal,
  input: dto.PushSubscribeBody,
  userAgent: string | undefined,
) {
  if (!pushEnabled()) {
    throw errors.conflict('الإشعارات غير مفعّلة على الخادم.')
  }

  if (!isPushServiceEndpoint(input.endpoint)) {
    throw errors.unprocessable('عنوان الاشتراك ليس من خدمة إشعارات معروفة.')
  }

  const values = {
    ...ownerOf(principal),
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
  }

  await db
    .insert(pushSubscriptions)
    .values({ ...values, endpoint: input.endpoint })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ...values, updatedAt: new Date() },
    })

  return { subscribed: true }
}

/** يزيل اشتراك هذا الجهاز. ما ليس لصاحب الجلسة لا يُمسّ، وغيابه نجاح. */
export async function unsubscribe(
  principal: FieldPrincipal,
  input: dto.PushUnsubscribeBody,
) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, input.endpoint), ownedBy(principal)),
    )

  return { subscribed: false }
}

/**
 * رابط أُبطل: أجهزته لا تستقبل بعده. من فتح بطاقة برابط مسرَّب وفعّل
 * الإشعارات كان سيبقى يستقبل إعلانات الحملة بعد إبطال الرابط نفسه.
 */
export async function dropParticipantSubscriptions(
  tx: Executor,
  initiativeId: string,
  participantIds: string[],
) {
  if (participantIds.length === 0) return

  await tx
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.initiativeId, initiativeId),
        inArray(pushSubscriptions.participantId, participantIds),
      ),
    )
}

// ── الإرسال ────────────────────────────────────────────────────────────

export type PushTarget = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type PushSender = (
  target: PushTarget,
  payload: string,
  options: { ttlSeconds: number },
) => Promise<void>

/** ما تقوله خدمة الإشعار عن طلب رفضته. */
export class PushDeliveryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message)
    this.name = 'PushDeliveryError'
  }
}

const REQUEST_TIMEOUT_MS = 10_000

const sendWebPush: PushSender = async (target, payload, options) => {
  const config = pushConfig()

  if (!config) throw new PushDeliveryError('Push is not configured.', null)

  try {
    await webpush.sendNotification(target, payload, {
      vapidDetails: config,
      TTL: options.ttlSeconds,
      urgency: 'high',
      timeout: REQUEST_TIMEOUT_MS,
    })
  } catch (error) {
    const statusCode =
      error instanceof webpush.WebPushError ? error.statusCode : null
    const message = error instanceof Error ? error.message : String(error)

    throw new PushDeliveryError(message, statusCode)
  }
}

/** الاشتراك زال عند خدمته: أُلغي الإذن، أو حُذف التطبيق، أو انتهى. */
const isGone = (statusCode: number | null) =>
  statusCode === 404 || statusCode === 410

/**
 * ما يستحق إعادة: انقطاع (بلا رمز)، أو ازدحام، أو عطل عند الخدمة. غيرها
 * رفضٌ لا يغيّره الانتظار — حمولة أكبر من الحد أو توقيع لا تقبله الخدمة.
 */
const isTransient = (statusCode: number | null) =>
  statusCode === null ||
  statusCode === 408 ||
  statusCode === 429 ||
  statusCode >= 500

const backoffMinutes = (attempts: number) => Math.min(2 ** (attempts - 1), 30)

/** كم مهمة تُرسَل معًا: خدمات الإشعار تحتمل، وطلب عالق لا يحبس الدفعة. */
const PARALLEL = 5

export type PushRunResult = {
  claimed: number
  sent: number
  failed: number
  retried: number
  gone: number
}

type ClaimedJob = typeof pushJobs.$inferSelect

async function deliver(
  job: ClaimedJob,
  send: PushSender,
  result: PushRunResult,
) {
  const now = new Date()

  const fail = async (lastError: string, bucket: 'failed' | 'gone' = 'failed') => {
    await db
      .update(pushJobs)
      .set({ status: 'FAILED', lastError: lastError.slice(0, 2000) })
      .where(eq(pushJobs.id, job.id))

    result[bucket] += 1
  }

  if (job.expiresAt.getTime() <= now.getTime()) {
    await fail('انتهت صلاحية الإشعار قبل إرساله.')
    return
  }

  const [subscription] = job.subscriptionId
    ? await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.id, job.subscriptionId))
        .limit(1)
    : []

  if (!subscription) {
    await fail('أُزيل الاشتراك قبل الإرسال.')
    return
  }

  const ttlSeconds = Math.max(
    60,
    Math.floor((job.expiresAt.getTime() - now.getTime()) / 1000),
  )

  try {
    await send(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(job.payload),
      { ttlSeconds },
    )

    await db
      .update(pushJobs)
      .set({ status: 'SENT', sentAt: new Date(), lastError: null })
      .where(eq(pushJobs.id, job.id))
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(eq(pushSubscriptions.id, subscription.id))

    result.sent += 1
  } catch (error) {
    const statusCode =
      error instanceof PushDeliveryError ? error.statusCode : null
    const message = error instanceof Error ? error.message : String(error)

    if (isGone(statusCode)) {
      await fail(`زال الاشتراك عند خدمته (${statusCode}).`, 'gone')
      // بعد كتابة المهمة: حذف الاشتراك يفرّغ مرجعها، وسببها مكتوب فيها.
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, subscription.id))

      return
    }

    await db
      .update(pushSubscriptions)
      .set({ lastFailureAt: new Date() })
      .where(eq(pushSubscriptions.id, subscription.id))

    const exhausted = job.attempts >= env.OUTBOX_MAX_ATTEMPTS

    if (!isTransient(statusCode) || exhausted) {
      await fail(message)
      console.error('[push:failed]', { id: job.id, statusCode, message })

      return
    }

    await db
      .update(pushJobs)
      .set({
        status: 'PENDING',
        lastError: message.slice(0, 2000),
        availableAt: new Date(Date.now() + backoffMinutes(job.attempts) * 60_000),
      })
      .where(eq(pushJobs.id, job.id))

    result.retried += 1
  }
}

/**
 * يلتقط دفعة من الطابور ويرسلها. `for update skip locked` كما في صندوق
 * البريد: عاملان لا يلتقطان المهمة نفسها.
 *
 * `send` يُحقن في الاختبارات: حالات المهمة تُفحص بلا خدمة إشعار حقيقية.
 */
export async function processPushBatch(
  send: PushSender = sendWebPush,
): Promise<PushRunResult> {
  const now = new Date()

  const claimed = await db.transaction(async (tx) => {
    const ready = await tx
      .select({ id: pushJobs.id })
      .from(pushJobs)
      .where(
        and(eq(pushJobs.status, 'PENDING'), lte(pushJobs.availableAt, now)),
      )
      .orderBy(pushJobs.availableAt)
      .limit(env.OUTBOX_BATCH_SIZE)
      .for('update', { skipLocked: true })

    if (ready.length === 0) return []

    return tx
      .update(pushJobs)
      .set({ status: 'SENDING', attempts: sql`${pushJobs.attempts} + 1` })
      .where(
        inArray(
          pushJobs.id,
          ready.map((row) => row.id),
        ),
      )
      .returning()
  })

  const result: PushRunResult = {
    claimed: claimed.length,
    sent: 0,
    failed: 0,
    retried: 0,
    gone: 0,
  }

  for (let index = 0; index < claimed.length; index += PARALLEL) {
    await Promise.all(
      claimed
        .slice(index, index + PARALLEL)
        .map((job) => deliver(job, send, result)),
    )
  }

  return result
}

/** ما عَلِق في `SENDING` لأن العامل انهار وهو بيده يعود إلى الطابور. */
export async function requeueStuckPushJobs(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)

  const requeued = await db
    .update(pushJobs)
    .set({ status: 'PENDING', availableAt: new Date() })
    .where(and(eq(pushJobs.status, 'SENDING'), lte(pushJobs.updatedAt, cutoff)))
    .returning({ id: pushJobs.id })

  if (requeued.length > 0) {
    console.warn('[push:requeued-stuck]', requeued.length)
  }

  return requeued.length
}
