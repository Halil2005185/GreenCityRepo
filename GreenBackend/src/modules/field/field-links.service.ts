import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { isLocalUrl, whatsappNumber } from '../../common/utils/text.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import {
  fieldGroupMembers,
  fieldGroups,
  participantLinks,
  participants,
} from '../../db/schema/field.js'
import { initiativeSites, initiatives } from '../../db/schema/programs.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { generateOpaqueToken, hashToken } from '../auth/token.service.js'
import { enqueueEmail } from '../mail/outbox.service.js'
import type * as dto from './field-admin.schemas.js'
import type { ParticipantPrincipal } from './field-auth.js'
import { DAY_MS } from './field.shared.js'

/**
 * بادئة رمز الرابط. بها يُعرف في ترويسة `Authorization` أنه رابط لا رمز
 * وصول، وبها يُعرف في سجلّ تسرّب أو لصقٍ خاطئ ما هذا النص.
 */
export const LINK_TOKEN_PREFIX = 'plk_'

const INVALID_LINK =
  'هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا من منسّق الحملة.'

/** `lastUsedAt` يُحدَّث على فترات: كتابة مع كل طلب ثمنٌ بلا فائدة. */
const TOUCH_EVERY_MS = 10 * 60_000

/**
 * الرابط الشخصي كما يُرسَل. الرمز في **جزء العنوان** (`#`) لا في مساره:
 * الجزء لا يخرج من المتصفح، فلا يُكتب في سجلات خادم الموقع، ولا يصل من
 * يولّد معاينات الروابط في تطبيقات المراسلة.
 */
export const linkUrl = (token: string) =>
  `${env.PUBLIC_SITE_URL}/app/link#${token}`

function newLinkToken() {
  const token = `${LINK_TOKEN_PREFIX}${generateOpaqueToken().token}`

  return { token, tokenHash: hashToken(token) }
}

// ── الدخول بالرابط ─────────────────────────────────────────────────────

/**
 * من صاحب هذا الرمز؟ الملغى والمنتهي وغير الموجود جواب واحد: من يجرّب
 * رموزًا لا يعرف منها أيّها كان رابطًا يومًا.
 */
export async function resolveLink(token: string): Promise<ParticipantPrincipal> {
  const [row] = await db
    .select({
      id: participantLinks.id,
      participantId: participantLinks.participantId,
      initiativeId: participantLinks.initiativeId,
      expiresAt: participantLinks.expiresAt,
      revokedAt: participantLinks.revokedAt,
      firstUsedAt: participantLinks.firstUsedAt,
      lastUsedAt: participantLinks.lastUsedAt,
      fullNameAr: participants.fullNameAr,
    })
    .from(participantLinks)
    .innerJoin(participants, eq(participantLinks.participantId, participants.id))
    .where(eq(participantLinks.tokenHash, hashToken(token)))
    .limit(1)

  const now = new Date()

  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime()) {
    throw errors.unauthorized(INVALID_LINK)
  }

  if (
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS
  ) {
    await db
      .update(participantLinks)
      .set({ lastUsedAt: now, firstUsedAt: row.firstUsedAt ?? now })
      .where(eq(participantLinks.id, row.id))
  }

  return {
    kind: 'PARTICIPANT',
    participantId: row.participantId,
    fullNameAr: row.fullNameAr,
    initiativeId: row.initiativeId,
    linkId: row.id,
    linkExpiresAt: row.expiresAt,
  }
}

/**
 * فتح الرابط أول مرة: يتحقق ويعيد ما يكفي التطبيق ليقول «أهلًا يا فلان»
 * ويحفظ الرمز. البطاقة نفسها تُقرأ بعده من `/field/me`.
 */
export async function redeemLink(token: string) {
  const principal = await resolveLink(token)

  const [initiative] = await db
    .select({ id: initiatives.id, nameAr: initiatives.nameAr })
    .from(initiatives)
    .where(eq(initiatives.id, principal.initiativeId))
    .limit(1)

  if (!initiative) throw errors.unauthorized(INVALID_LINK)

  return {
    participant: {
      id: principal.participantId,
      fullNameAr: principal.fullNameAr,
    },
    initiative,
    expiresAt: principal.linkExpiresAt.toISOString(),
  }
}

// ── المنسّق: التوليد والإبطال ───────────────────────────────────────────

async function requireLinkableInitiative(initiativeId: string) {
  const [initiative] = await db
    .select({
      id: initiatives.id,
      nameAr: initiatives.nameAr,
      status: initiatives.status,
    })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!initiative) throw errors.notFound('المبادرة غير موجودة.')

  // المكتملة تبقى: بطاقة ما بعد اليوم — الأرقام والصور — تُفتح بالرابط.
  if (initiative.status === 'CANCELLED') {
    throw errors.conflict('أُلغيت المبادرة، فلا تُولَّد لها روابط.')
  }

  return initiative
}

/**
 * من تُولَّد لهم الروابط: أعضاء مجموعة بعينها، أو مشاركون مسمَّون — وكلهم
 * أعضاء في مجموعات **هذه** المبادرة. المجموعة الأقرب موعدًا هي ما يُذكر في
 * رسالة كلٍّ منهم.
 */
async function loadRecipients(
  initiativeId: string,
  input: { groupId?: string | undefined; participantIds: string[] },
) {
  const rows = await db
    .select({
      participantId: participants.id,
      fullNameAr: participants.fullNameAr,
      phone: participants.phone,
      email: participants.email,
      groupId: fieldGroups.id,
      groupNameAr: fieldGroups.nameAr,
      meetsAt: fieldGroups.meetsAt,
      meetingPointAr: fieldGroups.meetingPointAr,
      siteNameAr: initiativeSites.nameAr,
    })
    .from(fieldGroupMembers)
    .innerJoin(fieldGroups, eq(fieldGroupMembers.groupId, fieldGroups.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .innerJoin(
      participants,
      eq(fieldGroupMembers.participantId, participants.id),
    )
    .where(
      and(
        eq(fieldGroups.initiativeId, initiativeId),
        input.groupId ? eq(fieldGroups.id, input.groupId) : undefined,
        input.participantIds.length > 0
          ? inArray(participants.id, input.participantIds)
          : undefined,
      ),
    )
    // ASC في Postgres يضع NULL آخرًا: ما لا موعد له ينزل تحت المجدوَل.
    .orderBy(asc(participants.nameKey), asc(fieldGroups.meetsAt))

  const recipients = new Map<string, (typeof rows)[number]>()

  for (const row of rows) {
    if (!recipients.has(row.participantId)) recipients.set(row.participantId, row)
  }

  const missing = input.participantIds.filter((id) => !recipients.has(id))

  if (missing.length > 0) {
    throw errors.unprocessable(
      'بعض من اخترتهم ليسوا أعضاء في مجموعات هذه المبادرة.',
      missing.map((id) => ({
        path: 'participantIds',
        in: 'body',
        message: `المشارك ${id} ليس عضوًا في مجموعة من هذه المبادرة.`,
      })),
    )
  }

  return [...recipients.values()]
}

/** نص الرسالة كما يُلصق في واتساب: يقول ما الرابط قبل أن يعرضه. */
function inviteText(input: {
  fullNameAr: string
  initiativeNameAr: string
  url: string
}) {
  return [
    `مرحبًا ${input.fullNameAr}،`,
    `هذا رابطك الشخصي في «${input.initiativeNameAr}»: فيه موعدك وموقعك وقائد مجموعتك.`,
    input.url,
    'الرابط لك وحدك، فلا تشاركه.',
  ].join('\n')
}

/**
 * يولّد رابطًا لكل مشارك ويعيده **مرة واحدة**: الرمز لا يُحفظ إلا مجزّأً،
 * فما لم يُنسخ أو يُرسَل الآن لا يُسترجع — يُولَّد غيره.
 *
 * والجديد يُبطل القديم في المعاملة نفسها: لا تمرّ لحظة بلا رابط قائم، ولا
 * لحظة برابطين.
 */
export async function createLinks(
  initiativeId: string,
  input: dto.CreateLinksBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  // عنوان الموقع تُرك على قيمته الافتراضية في الإنتاج: الروابط تخرج إلى
  // `localhost` وتصل المتطوعين لا تفتح شيئًا. الرفض هنا يُري المنسّق السبب
  // قبل أن يرسل مئة رسالة، والرمز المولَّد لا يُسترجع ليُصحَّح عنوانه.
  if (env.NODE_ENV === 'production' && isLocalUrl(env.PUBLIC_SITE_URL)) {
    throw errors.conflict(
      'عنوان الموقع العام غير مضبوط على الخادم (PUBLIC_SITE_URL)، فالروابط لن تُفتح عند أصحابها. أبلغ من يدير الخادم.',
    )
  }

  const initiative = await requireLinkableInitiative(initiativeId)
  const recipients = await loadRecipients(initiativeId, {
    groupId: input.groupId,
    participantIds: input.participantIds,
  })

  if (recipients.length === 0) {
    throw errors.unprocessable('لا أعضاء تُولَّد لهم روابط.')
  }

  const now = new Date()
  const ttlDays = input.ttlDays ?? env.FIELD_LINK_TTL_DAYS
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS)
  const participantIds = recipients.map((recipient) => recipient.participantId)

  const issued = recipients.map((recipient) => {
    const { token, tokenHash } = newLinkToken()
    const url = linkUrl(token)
    const emailed = input.email && recipient.email !== null

    return { recipient, tokenHash, url, emailed }
  })

  await db.transaction(async (tx) => {
    await tx
      .update(participantLinks)
      .set({ revokedAt: now, revokedById: actor.userId })
      .where(
        and(
          eq(participantLinks.initiativeId, initiativeId),
          inArray(participantLinks.participantId, participantIds),
          isNull(participantLinks.revokedAt),
        ),
      )

    await tx.insert(participantLinks).values(
      issued.map((link) => ({
        participantId: link.recipient.participantId,
        initiativeId,
        tokenHash: link.tokenHash,
        expiresAt,
        emailedAt: link.emailed ? now : null,
        createdById: actor.userId,
      })),
    )

    for (const link of issued) {
      if (!link.emailed || !link.recipient.email) continue

      await enqueueEmail(tx, {
        templateKey: 'field-link',
        recipient: link.recipient.email,
        payload: {
          fullNameAr: link.recipient.fullNameAr,
          initiativeNameAr: initiative.nameAr,
          groupNameAr: link.recipient.groupNameAr,
          siteNameAr: link.recipient.siteNameAr,
          meetsAt: link.recipient.meetsAt?.toISOString() ?? null,
          meetingPointAr: link.recipient.meetingPointAr,
          linkUrl: link.url,
          expiresInDays: ttlDays,
        },
      })
    }

    await recordAudit(
      {
        action: 'field.links_created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'initiative',
        entityId: initiativeId,
        entityLabel: initiative.nameAr,
        summaryAr: `توليد روابط شخصية لـ${issued.length} من المشاركين`,
        // المعرّفات لا الرموز: السجل يُقرأ، والرمز اعتماد.
        metadata: {
          participantIds,
          groupId: input.groupId ?? null,
          expiresAt: expiresAt.toISOString(),
          emailed: issued.filter((link) => link.emailed).length,
        },
        ...trace,
      },
      tx,
    )
  })

  return {
    initiativeId,
    expiresAt: expiresAt.toISOString(),
    links: issued.map((link) => {
      const messageAr = inviteText({
        fullNameAr: link.recipient.fullNameAr,
        initiativeNameAr: initiative.nameAr,
        url: link.url,
      })
      const number = whatsappNumber(link.recipient.phone)

      return {
        participantId: link.recipient.participantId,
        fullNameAr: link.recipient.fullNameAr,
        phone: link.recipient.phone,
        email: link.recipient.email,
        groupNameAr: link.recipient.groupNameAr,
        url: link.url,
        messageAr,
        whatsappUrl: number
          ? `https://wa.me/${number}?text=${encodeURIComponent(messageAr)}`
          : null,
        emailed: link.emailed,
      }
    }),
  }
}

export async function revokeLinks(
  initiativeId: string,
  input: dto.RevokeLinksBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const [initiative] = await db
    .select({ id: initiatives.id, nameAr: initiatives.nameAr })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1)

  if (!initiative) throw errors.notFound('المبادرة غير موجودة.')

  const revoked = await db.transaction(async (tx) => {
    const rows = await tx
      .update(participantLinks)
      .set({ revokedAt: new Date(), revokedById: actor.userId })
      .where(
        and(
          eq(participantLinks.initiativeId, initiativeId),
          inArray(participantLinks.participantId, input.participantIds),
          isNull(participantLinks.revokedAt),
        ),
      )
      .returning({ participantId: participantLinks.participantId })

    if (rows.length > 0) {
      await recordAudit(
        {
          action: 'field.links_revoked',
          severity: 'NOTICE',
          actorUserId: actor.userId,
          entityType: 'initiative',
          entityId: initiativeId,
          entityLabel: initiative.nameAr,
          summaryAr: `إبطال روابط شخصية لـ${rows.length} من المشاركين`,
          metadata: { participantIds: rows.map((row) => row.participantId) },
          ...trace,
        },
        tx,
      )
    }

    return rows.length
  })

  return { initiativeId, revoked }
}
