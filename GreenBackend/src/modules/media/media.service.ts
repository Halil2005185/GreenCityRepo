import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { errors } from '../../common/errors/app-error.js'
import { normalizeEmail, normalizeText } from '../../common/utils/text.js'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/identity.js'
import {
  mediaContactChannels,
  mediaContactInteractions,
  mediaContacts,
} from '../../db/schema/media.js'
import { partners } from '../../db/schema/partners.js'
import { mediaChannels, relationshipTypes } from '../../db/schema/relations.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type * as dto from './media.schemas.js'

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

const accountManager = alias(users, 'media_account_manager')
const interactionRecorder = alias(users, 'media_interaction_recorder')

const STAGE_LABELS = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  INTERESTED: 'مهتم',
  COLLABORATING: 'تعاون قائم',
  DORMANT: 'خامل',
  DECLINED: 'اعتذر',
} as const

const KIND_LABELS = {
  NOTE: 'ملاحظة',
  CALL: 'مكالمة',
  EMAIL: 'بريد',
  MEETING: 'اجتماع',
  MESSAGE: 'رسالة',
  DOCUMENT_REQUEST: 'طلب مستند',
  STAGE_CHANGE: 'تغيير مرحلة',
} as const

/**
 * أولوية عالية أولًا ثم الأقدم تواصلًا.
 *
 * الترتيب هو المنتج نفسه لا تفصيلًا: الشاشة تجيب على «من أكلّم اليوم؟»،
 * فالفرز بتاريخ الإنشاء كان سيدفن من أهملناه شهرًا تحت من أضفناه أمس.
 * `nulls first` مقصود: من لم يُسجَّل له تواصل قط هو الأولى بالمكالمة.
 */
const listOrdering = [
  sql`case ${mediaContacts.priority}
        when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`,
  sql`${mediaContacts.lastContactAt} asc nulls first`,
]

/** الأشكال والمتابعات المفتوحة في استعلامين، كما في سجل الشركاء. */
async function decorate(rows: { id: string }[]) {
  if (rows.length === 0) {
    return {
      channels: new Map<string, { id: string; nameAr: string }[]>(),
      openFollowUps: new Map<string, number>(),
    }
  }

  const ids = rows.map((row) => row.id)

  const [channelRows, followUpRows] = await Promise.all([
    db
      .select({
        contactId: mediaContactChannels.contactId,
        id: mediaChannels.id,
        nameAr: mediaChannels.nameAr,
        displayOrder: mediaChannels.displayOrder,
      })
      .from(mediaContactChannels)
      .innerJoin(
        mediaChannels,
        eq(mediaContactChannels.channelId, mediaChannels.id),
      )
      .where(inArray(mediaContactChannels.contactId, ids))
      .orderBy(asc(mediaChannels.displayOrder)),

    db
      .select({
        contactId: mediaContactInteractions.contactId,
        count: sql<number>`count(*)::int`,
      })
      .from(mediaContactInteractions)
      .where(
        and(
          inArray(mediaContactInteractions.contactId, ids),
          sql`${mediaContactInteractions.dueAt} is not null`,
          isNull(mediaContactInteractions.completedAt),
        ),
      )
      .groupBy(mediaContactInteractions.contactId),
  ])

  const channels = new Map<string, { id: string; nameAr: string }[]>()

  for (const row of channelRows) {
    const list = channels.get(row.contactId) ?? []

    list.push({ id: row.id, nameAr: row.nameAr })
    channels.set(row.contactId, list)
  }

  return {
    channels,
    openFollowUps: new Map(
      followUpRows.map((row) => [row.contactId, row.count]),
    ),
  }
}

// ── القراءة ────────────────────────────────────────────────────────────

export async function listContacts(filters: dto.ListContactsQuery) {
  const conditions = [
    filters.stage ? eq(mediaContacts.stage, filters.stage) : undefined,
    filters.priority ? eq(mediaContacts.priority, filters.priority) : undefined,
    filters.horizon ? eq(mediaContacts.horizon, filters.horizon) : undefined,
    filters.relationshipTypeId
      ? eq(mediaContacts.relationshipTypeId, filters.relationshipTypeId)
      : undefined,
    filters.accountManagerId
      ? eq(mediaContacts.accountManagerId, filters.accountManagerId)
      : undefined,
    filters.q
      ? or(
          ilike(mediaContacts.fullNameAr, `%${filters.q}%`),
          ilike(mediaContacts.nameEn, `%${filters.q}%`),
          ilike(mediaContacts.outletNameAr, `%${filters.q}%`),
          ilike(mediaContacts.jobTitleAr, `%${filters.q}%`),
          ilike(mediaContacts.email, `%${filters.q}%`),
          ilike(mediaContacts.phone, `%${filters.q}%`),
        )
      : undefined,
    filters.channelId
      ? sql`exists (
          select 1 from ${mediaContactChannels}
          where ${mediaContactChannels.contactId} = ${mediaContacts.id}
            and ${mediaContactChannels.channelId} = ${filters.channelId}
        )`
      : undefined,
    // من لم يُسجَّل له تواصل قط داخل في «المتأخرين» لا خارجهم.
    filters.staleDays
      ? sql`${mediaContacts.lastContactAt} is null
            or ${mediaContacts.lastContactAt}
               < now() - make_interval(days => ${filters.staleDays})`
      : undefined,
    filters.hasOpenFollowUp
      ? sql`exists (
          select 1 from ${mediaContactInteractions}
          where ${mediaContactInteractions.contactId} = ${mediaContacts.id}
            and ${mediaContactInteractions.dueAt} is not null
            and ${mediaContactInteractions.completedAt} is null
        )`
      : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      contact: mediaContacts,
      accountManagerNameAr: accountManager.fullNameAr,
      relationshipTypeNameAr: relationshipTypes.nameAr,
      partnerNameAr: partners.displayNameAr,
    })
    .from(mediaContacts)
    .leftJoin(
      accountManager,
      eq(mediaContacts.accountManagerId, accountManager.id),
    )
    .leftJoin(
      relationshipTypes,
      eq(mediaContacts.relationshipTypeId, relationshipTypes.id),
    )
    .leftJoin(partners, eq(mediaContacts.partnerId, partners.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...listOrdering)
    .limit(300)

  const extra = await decorate(rows.map((row) => row.contact))

  return rows.map((row) => ({
    id: row.contact.id,
    fullNameAr: row.contact.fullNameAr,
    jobTitleAr: row.contact.jobTitleAr,
    outletNameAr: row.contact.outletNameAr,
    partnerId: row.contact.partnerId,
    partnerNameAr: row.partnerNameAr,
    email: row.contact.email,
    phone: row.contact.phone,
    stage: row.contact.stage,
    priority: row.contact.priority,
    horizon: row.contact.horizon,
    relationshipTypeNameAr: row.relationshipTypeNameAr,
    channels: extra.channels.get(row.contact.id) ?? [],
    accountManagerNameAr: row.accountManagerNameAr,
    lastContactAt: row.contact.lastContactAt?.toISOString() ?? null,
    openFollowUps: extra.openFollowUps.get(row.contact.id) ?? 0,
    createdAt: row.contact.createdAt.toISOString(),
  }))
}

export async function loadContactDetail(
  contactId: string,
  viewer: AuthContext,
) {
  const [found] = await db
    .select({
      contact: mediaContacts,
      accountManagerNameAr: accountManager.fullNameAr,
      relationshipTypeNameAr: relationshipTypes.nameAr,
      partnerNameAr: partners.displayNameAr,
    })
    .from(mediaContacts)
    .leftJoin(
      accountManager,
      eq(mediaContacts.accountManagerId, accountManager.id),
    )
    .leftJoin(
      relationshipTypes,
      eq(mediaContacts.relationshipTypeId, relationshipTypes.id),
    )
    .leftJoin(partners, eq(mediaContacts.partnerId, partners.id))
    .where(eq(mediaContacts.id, contactId))
    .limit(1)

  if (!found) throw errors.notFound('الشخص غير موجود في الشبكة الإعلامية.')

  const row = found.contact

  const interactions = await db
    .select({
      row: mediaContactInteractions,
      recordedByNameAr: interactionRecorder.fullNameAr,
    })
    .from(mediaContactInteractions)
    .leftJoin(
      interactionRecorder,
      eq(mediaContactInteractions.recordedById, interactionRecorder.id),
    )
    .where(eq(mediaContactInteractions.contactId, contactId))
    .orderBy(desc(mediaContactInteractions.occurredAt))
    .limit(100)

  const extra = await decorate([row])
  const now = Date.now()

  /** أرقام الهواتف والملاحظات معًا صورة كاملة عن شخص؛ الملاحظة وحدها محجوبة. */
  const canSeeNotes = viewer.capabilities.includes('media.notes.view')

  return {
    id: row.id,
    fullNameAr: row.fullNameAr,
    nameEn: row.nameEn,
    jobTitleAr: row.jobTitleAr,
    outletNameAr: row.outletNameAr,
    partnerId: row.partnerId,
    partnerNameAr: found.partnerNameAr,
    email: row.email,
    phone: row.phone,
    profileUrl: row.profileUrl,
    stage: row.stage,
    priority: row.priority,
    horizon: row.horizon,
    relationshipTypeId: row.relationshipTypeId,
    relationshipTypeNameAr: found.relationshipTypeNameAr,
    channels: extra.channels.get(row.id) ?? [],
    accountManagerId: row.accountManagerId,
    accountManagerNameAr: found.accountManagerNameAr,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    openFollowUps: extra.openFollowUps.get(row.id) ?? 0,
    internalNotesAr: canSeeNotes ? row.internalNotesAr : null,
    createdAt: row.createdAt.toISOString(),

    interactions: interactions.map((item) => ({
      id: item.row.id,
      kind: item.row.kind,
      occurredAt: item.row.occurredAt.toISOString(),
      summaryAr: item.row.summaryAr,
      bodyAr: item.row.bodyAr,
      dueAt: item.row.dueAt?.toISOString() ?? null,
      completedAt: item.row.completedAt?.toISOString() ?? null,
      isOverdue:
        item.row.dueAt !== null &&
        item.row.completedAt === null &&
        item.row.dueAt.getTime() < now,
      recordedByNameAr: item.recordedByNameAr,
    })),
  }
}

export async function listFollowUps(
  filters: dto.ListFollowUpsQuery,
  viewer: AuthContext,
) {
  const rows = await db
    .select({
      id: mediaContactInteractions.id,
      contactId: mediaContacts.id,
      contactNameAr: mediaContacts.fullNameAr,
      priority: mediaContacts.priority,
      kind: mediaContactInteractions.kind,
      summaryAr: mediaContactInteractions.summaryAr,
      dueAt: mediaContactInteractions.dueAt,
      recordedByNameAr: interactionRecorder.fullNameAr,
    })
    .from(mediaContactInteractions)
    .innerJoin(
      mediaContacts,
      eq(mediaContactInteractions.contactId, mediaContacts.id),
    )
    .leftJoin(
      interactionRecorder,
      eq(mediaContactInteractions.recordedById, interactionRecorder.id),
    )
    .where(
      and(
        isNull(mediaContactInteractions.completedAt),
        sql`${mediaContactInteractions.dueAt} is not null`,
        sql`${mediaContactInteractions.dueAt}
            <= now() + make_interval(days => ${filters.withinDays})`,
        filters.mine
          ? eq(mediaContacts.accountManagerId, viewer.userId)
          : undefined,
      ),
    )
    .orderBy(asc(mediaContactInteractions.dueAt))
    .limit(200)

  const now = Date.now()

  return rows.map((row) => ({
    id: row.id,
    contactId: row.contactId,
    contactNameAr: row.contactNameAr,
    priority: row.priority,
    kind: row.kind,
    summaryAr: row.summaryAr,
    dueAt: row.dueAt!.toISOString(),
    isOverdue: row.dueAt!.getTime() < now,
    recordedByNameAr: row.recordedByNameAr,
  }))
}

// ── الكتابة ────────────────────────────────────────────────────────────

async function requireContact(contactId: string, tx: Executor = db) {
  const [row] = await tx
    .select()
    .from(mediaContacts)
    .where(eq(mediaContacts.id, contactId))
    .limit(1)

  if (!row) throw errors.notFound('الشخص غير موجود في الشبكة الإعلامية.')

  return row
}

/**
 * البريد مفتاح فريد جزئي في القاعدة، والفحص هنا لتحويل خطأ القيد إلى
 * رسالة تقول أي شخص يملكه. القاعدة تبقى الحكم عند التسابق.
 */
async function assertEmailFree(
  email: string,
  exceptId: string | null,
  tx: Executor = db,
) {
  const [duplicate] = await tx
    .select({ id: mediaContacts.id, fullNameAr: mediaContacts.fullNameAr })
    .from(mediaContacts)
    .where(eq(mediaContacts.email, email))
    .limit(1)

  if (duplicate && duplicate.id !== exceptId) {
    throw errors.conflict(`البريد مسجّل باسم «${duplicate.fullNameAr}».`)
  }
}

/** يمنع ربط الشخص بمفردة معطّلة أو محذوفة قبل أن يرفضها المفتاح الأجنبي. */
async function assertChannelsExist(channelIds: string[], tx: Executor = db) {
  if (channelIds.length === 0) return

  const rows = await tx
    .select({ id: mediaChannels.id })
    .from(mediaChannels)
    .where(
      and(inArray(mediaChannels.id, channelIds), eq(mediaChannels.isActive, true)),
    )

  if (rows.length !== new Set(channelIds).size) {
    throw errors.unprocessable('أحد أشكال العمل الإعلامي غير موجود أو معطّل.')
  }
}

async function replaceChannels(
  tx: Executor,
  contactId: string,
  channelIds: string[],
) {
  await tx
    .delete(mediaContactChannels)
    .where(eq(mediaContactChannels.contactId, contactId))

  if (channelIds.length === 0) return

  await tx
    .insert(mediaContactChannels)
    .values(
      [...new Set(channelIds)].map((channelId) => ({ contactId, channelId })),
    )
}

async function logSystemInteraction(
  tx: Executor,
  input: {
    contactId: string
    summaryAr: string
    bodyAr?: string | undefined
    actorId: string
  },
) {
  await tx.insert(mediaContactInteractions).values({
    contactId: input.contactId,
    kind: 'STAGE_CHANGE',
    occurredAt: new Date(),
    summaryAr: input.summaryAr,
    recordedById: input.actorId,
    ...(input.bodyAr ? { bodyAr: input.bodyAr } : {}),
  })
}

export async function createContact(
  input: dto.CreateContactBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const fullNameAr = normalizeText(input.fullNameAr)
  const email = input.email ? normalizeEmail(input.email) : null

  if (email) await assertEmailFree(email, null)

  await assertChannelsExist(input.channelIds)

  const contactId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(mediaContacts)
      .values({
        fullNameAr,
        stage: input.stage,
        priority: input.priority,
        ...(email ? { email } : {}),
        ...(input.nameEn ? { nameEn: normalizeText(input.nameEn) } : {}),
        ...(input.jobTitleAr ? { jobTitleAr: normalizeText(input.jobTitleAr) } : {}),
        ...(input.phone ? { phone: normalizeText(input.phone) } : {}),
        ...(input.profileUrl ? { profileUrl: input.profileUrl } : {}),
        ...(input.outletNameAr
          ? { outletNameAr: normalizeText(input.outletNameAr) }
          : {}),
        ...(input.partnerId ? { partnerId: input.partnerId } : {}),
        ...(input.horizon ? { horizon: input.horizon } : {}),
        ...(input.relationshipTypeId
          ? { relationshipTypeId: input.relationshipTypeId }
          : {}),
        ...(input.accountManagerId
          ? { accountManagerId: input.accountManagerId }
          : {}),
        ...(input.lastContactAt
          ? { lastContactAt: new Date(input.lastContactAt) }
          : {}),
        ...(input.internalNotesAr
          ? { internalNotesAr: input.internalNotesAr }
          : {}),
      })
      .returning({ id: mediaContacts.id })

    if (!created) throw new Error('Failed to create media contact.')

    await replaceChannels(tx, created.id, input.channelIds)

    await logSystemInteraction(tx, {
      contactId: created.id,
      summaryAr: `إضافة إلى الشبكة الإعلامية بمرحلة «${STAGE_LABELS[input.stage]}»`,
      actorId: actor.userId,
    })

    await recordAudit(
      {
        action: 'media_contact.created',
        severity: 'NOTICE',
        actorUserId: actor.userId,
        entityType: 'media_contact',
        entityId: created.id,
        entityLabel: fullNameAr,
        summaryAr: 'إضافة شخص إلى الشبكة الإعلامية',
        ...trace,
      },
      tx,
    )

    return created.id
  })

  return loadContactDetail(contactId, actor)
}

export async function updateContact(
  contactId: string,
  input: dto.UpdateContactBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const current = await requireContact(contactId)
  const email =
    input.email === undefined
      ? undefined
      : input.email
        ? normalizeEmail(input.email)
        : null

  if (email) await assertEmailFree(email, contactId)

  if (input.channelIds) await assertChannelsExist(input.channelIds)

  const changes = {
    ...(input.fullNameAr ? { fullNameAr: normalizeText(input.fullNameAr) } : {}),
    ...(input.nameEn !== undefined ? { nameEn: input.nameEn || null } : {}),
    ...(input.jobTitleAr !== undefined
      ? { jobTitleAr: input.jobTitleAr || null }
      : {}),
    ...(email !== undefined ? { email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
    ...(input.profileUrl !== undefined
      ? { profileUrl: input.profileUrl || null }
      : {}),
    ...(input.outletNameAr !== undefined
      ? { outletNameAr: input.outletNameAr || null }
      : {}),
    ...(input.partnerId !== undefined ? { partnerId: input.partnerId } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.horizon !== undefined ? { horizon: input.horizon } : {}),
    ...(input.relationshipTypeId !== undefined
      ? { relationshipTypeId: input.relationshipTypeId }
      : {}),
    ...(input.accountManagerId !== undefined
      ? { accountManagerId: input.accountManagerId }
      : {}),
    ...(input.lastContactAt !== undefined
      ? {
          lastContactAt: input.lastContactAt
            ? new Date(input.lastContactAt)
            : null,
        }
      : {}),
    ...(input.internalNotesAr !== undefined
      ? { internalNotesAr: input.internalNotesAr || null }
      : {}),
  }

  /**
   * الشرط يُفحص على الصف بعد الدمج لا على الطلب.
   *
   * طلب يمسح البريد وحده صالح شكلًا، ولا يُعرف أنه يترك الشخص بلا وسيلة
   * تواصل إلا بالنظر إلى ما يبقى في الصف. القاعدة سترفضه على كل حال،
   * لكن برسالة إنجليزية عن قيد لا يفهمها من يملأ النموذج.
   */
  const merged = { ...current, ...changes }

  if (!merged.email && !merged.phone && !merged.profileUrl) {
    throw errors.unprocessable(
      'لا يمكن ترك الشخص بلا بريد ولا هاتف ولا رابط حساب.',
    )
  }

  if (Object.keys(changes).length === 0 && !input.channelIds) {
    return loadContactDetail(contactId, actor)
  }

  await db.transaction(async (tx) => {
    if (Object.keys(changes).length > 0) {
      await tx
        .update(mediaContacts)
        .set(changes)
        .where(eq(mediaContacts.id, contactId))
    }

    if (input.channelIds) {
      await replaceChannels(tx, contactId, input.channelIds)
    }

    await recordAudit(
      {
        action: 'media_contact.updated',
        actorUserId: actor.userId,
        entityType: 'media_contact',
        entityId: contactId,
        entityLabel: merged.fullNameAr,
        summaryAr: 'تعديل ملف شخص في الشبكة الإعلامية',
        metadata: {
          fields: [
            ...Object.keys(changes),
            ...(input.channelIds ? ['channelIds'] : []),
          ],
        },
        ...trace,
      },
      tx,
    )
  })

  return loadContactDetail(contactId, actor)
}

export async function changeStage(
  contactId: string,
  input: dto.ChangeStageBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const current = await requireContact(contactId)

  if (current.stage === input.stage) {
    return loadContactDetail(contactId, actor)
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mediaContacts)
      .set({ stage: input.stage })
      .where(eq(mediaContacts.id, contactId))

    await logSystemInteraction(tx, {
      contactId,
      summaryAr: `نقل المرحلة من «${STAGE_LABELS[current.stage]}» إلى «${STAGE_LABELS[input.stage]}»`,
      bodyAr: input.noteAr,
      actorId: actor.userId,
    })

    await recordAudit(
      {
        action: 'media_contact.stage_changed',
        actorUserId: actor.userId,
        entityType: 'media_contact',
        entityId: contactId,
        entityLabel: current.fullNameAr,
        summaryAr: `${STAGE_LABELS[current.stage]} ← ${STAGE_LABELS[input.stage]}`,
        metadata: { from: current.stage, to: input.stage },
        ...trace,
      },
      tx,
    )
  })

  return loadContactDetail(contactId, actor)
}

export async function recordInteraction(
  contactId: string,
  input: dto.InteractionBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const current = await requireContact(contactId)
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()

  await db.transaction(async (tx) => {
    await tx.insert(mediaContactInteractions).values({
      contactId,
      kind: input.kind,
      occurredAt,
      summaryAr: normalizeText(input.summaryAr),
      recordedById: actor.userId,
      ...(input.bodyAr ? { bodyAr: input.bodyAr } : {}),
      ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
    })

    /**
     * «آخر تواصل» يتقدّم ولا يتراجع.
     *
     * تسجيل مكالمة قديمة نُسي إدخالها يجب ألا يجعل الشخص يبدو مهملًا،
     * وهو ما كان سيحدث لو كُتب التاريخ دون مقارنة.
     */
    if (!current.lastContactAt || occurredAt > current.lastContactAt) {
      await tx
        .update(mediaContacts)
        .set({ lastContactAt: occurredAt })
        .where(eq(mediaContacts.id, contactId))
    }

    await recordAudit(
      {
        action: 'media_contact.interaction_recorded',
        actorUserId: actor.userId,
        entityType: 'media_contact',
        entityId: contactId,
        entityLabel: current.fullNameAr,
        summaryAr: `تسجيل ${KIND_LABELS[input.kind]}`,
        ...trace,
      },
      tx,
    )
  })

  return loadContactDetail(contactId, actor)
}

export async function setFollowUpCompletion(
  contactId: string,
  interactionId: string,
  input: dto.CompleteInteractionBody,
  actor: AuthContext,
  trace: RequestTrace,
) {
  await requireContact(contactId)

  const [interaction] = await db
    .select()
    .from(mediaContactInteractions)
    .where(
      and(
        eq(mediaContactInteractions.id, interactionId),
        eq(mediaContactInteractions.contactId, contactId),
      ),
    )
    .limit(1)

  if (!interaction) throw errors.notFound('المتابعة غير موجودة.')

  if (!interaction.dueAt) {
    throw errors.unprocessable('هذا السجل بلا موعد متابعة ليُنجَز.')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mediaContactInteractions)
      .set({ completedAt: input.completed ? new Date() : null })
      .where(eq(mediaContactInteractions.id, interactionId))

    await recordAudit(
      {
        action: input.completed
          ? 'media_contact.follow_up_completed'
          : 'media_contact.follow_up_reopened',
        actorUserId: actor.userId,
        entityType: 'media_contact',
        entityId: contactId,
        summaryAr: input.completed ? 'إنجاز متابعة' : 'إعادة فتح متابعة',
        ...trace,
      },
      tx,
    )
  })

  return loadContactDetail(contactId, actor)
}
