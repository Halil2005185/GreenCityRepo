import { randomInt } from 'node:crypto'

import { and, asc, eq, isNull } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import {
  attendance,
  fieldGroups,
  fieldSettings,
  participantCertificates,
  participants,
} from '../../db/schema/field.js'
import { initiativeSites, initiatives, programs } from '../../db/schema/programs.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import type { ParticipantPrincipal } from './field-auth.js'

/** بلا ما يلتبس على من يقرأ الرمز من ورقة: لا 0 ولا O، ولا 1 ولا I. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODE_LENGTH = 10

function newCode() {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('')
}

/**
 * الرمز في الاستعلام لا في المسار: صفحة التحقق على الموقع ملف ثابت واحد يقرأ
 * الرمز في المتصفح ويسأل هذا الخادم منه، فيُحسب حدّ الطلبات على السائل لا
 * على خادم الموقع.
 */
export const certificateUrl = (code: string) =>
  `${env.PUBLIC_SITE_URL}/verify?code=${code}`

// ── المشاركات ──────────────────────────────────────────────────────────

/**
 * حضور المشارك القائم — ما سُجّل ولم يُتراجع عنه — في مبادرة أو في كلها.
 *
 * الحضور هو المشاركة: عضوية في مجموعة بلا يوم حضور دعوةٌ لا مشاركة، فلا
 * تدخل السجل ولا تُصدر شهادة.
 */
async function loadAttendance(participantId: string, initiativeId?: string) {
  return db
    .select({
      initiativeId: initiatives.id,
      initiativeNameAr: initiatives.nameAr,
      initiativeStatus: initiatives.status,
      programNameAr: programs.nameAr,
      siteNameAr: initiativeSites.nameAr,
      attendedOn: attendance.attendedOn,
      hoursPerDay: fieldGroups.hoursPerDay,
    })
    .from(attendance)
    .innerJoin(fieldGroups, eq(attendance.groupId, fieldGroups.id))
    .innerJoin(initiatives, eq(fieldGroups.initiativeId, initiatives.id))
    .innerJoin(programs, eq(initiatives.programId, programs.id))
    .innerJoin(initiativeSites, eq(fieldGroups.siteId, initiativeSites.id))
    .where(
      and(
        eq(attendance.participantId, participantId),
        isNull(attendance.undoneAt),
        initiativeId ? eq(initiatives.id, initiativeId) : undefined,
      ),
    )
    .orderBy(asc(attendance.attendedOn))
}

type AttendanceRow = Awaited<ReturnType<typeof loadAttendance>>[number]

/**
 * خلاصة مشاركة في مبادرة. اليوم يُعدّ مرة ولو حضر صاحبه في مجموعتين فيه؛
 * والساعات مجموع ساعات مجموعاته، و`null` حين لم يُحدَّد لأيٍّ منها ساعات —
 * «صفر ساعة» تقول ما لم يقع.
 */
function summarize(rows: readonly AttendanceRow[]) {
  const days = [...new Set(rows.map((row) => row.attendedOn))].sort()
  const timed = rows.filter((row) => row.hoursPerDay !== null)

  return {
    days: days.length,
    hours:
      timed.length > 0
        ? Math.round(
            timed.reduce((sum, row) => sum + Number(row.hoursPerDay), 0) * 10,
          ) / 10
        : null,
    firstDay: days[0] ?? null,
    lastDay: days.at(-1) ?? null,
    sites: [...new Set(rows.map((row) => row.siteNameAr))],
  }
}

/**
 * سجل المشارك عبر الحملات: ما حضره، بأيامه وساعاته.
 *
 * يُفتح برابط حملة واحدة ويعرض الحملات كلها. نطاق الرابط في ما يُكتب —
 * تأكيد الحضور والشهادة لمبادرته وحدها — وفي البطاقة. والسجل قراءة لأسماء
 * حملات وأيام، بلا وسيلة تواصل ولا أسماء غيره: ما يعرفه من وقف معه يومها.
 */
export async function loadRecord(principal: ParticipantPrincipal) {
  const [rows, issued, enabled] = await Promise.all([
    loadAttendance(principal.participantId),
    db
      .select({
        initiativeId: participantCertificates.initiativeId,
        code: participantCertificates.code,
      })
      .from(participantCertificates)
      .where(eq(participantCertificates.participantId, principal.participantId)),
    certificatesEnabled(principal.initiativeId),
  ])

  const byInitiative = new Map<string, AttendanceRow[]>()

  for (const row of rows) {
    byInitiative.set(row.initiativeId, [
      ...(byInitiative.get(row.initiativeId) ?? []),
      row,
    ])
  }

  const participations = [...byInitiative.values()]
    .map((group) => {
      const [first] = group
      const certificate = issued.find(
        (row) => row.initiativeId === first!.initiativeId,
      )

      return {
        initiativeId: first!.initiativeId,
        initiativeNameAr: first!.initiativeNameAr,
        initiativeStatus: first!.initiativeStatus,
        programNameAr: first!.programNameAr,
        ...summarize(group),
        certificate: {
          code: certificate?.code ?? null,
          /**
           * تُصدَر برابط مبادرتها وحده: رابط حملة لا يُصدر شهادة أخرى.
           */
          canIssue: first!.initiativeId === principal.initiativeId && enabled,
        },
      }
    })
    // الأحدث أولًا: ما يُسأل عنه هو آخر ما شارك فيه.
    .sort((a, b) => (b.lastDay ?? '').localeCompare(a.lastDay ?? ''))

  const total = summarize(rows)

  return {
    participant: {
      id: principal.participantId,
      fullNameAr: principal.fullNameAr,
    },
    totals: {
      initiatives: participations.length,
      // الأيام تُجمع بين الحملات: يوم في حملتين يومان من العمل.
      days: participations.reduce((sum, item) => sum + item.days, 0),
      hours: total.hours,
    },
    participations,
    generatedAt: new Date().toISOString(),
  }
}

// ── الشهادة ────────────────────────────────────────────────────────────

async function loadCertificateSettings(initiativeId: string) {
  const [row] = await db
    .select({
      enabled: fieldSettings.certificatesEnabled,
      signerNameAr: fieldSettings.certificateSignerNameAr,
      signerTitleAr: fieldSettings.certificateSignerTitleAr,
    })
    .from(fieldSettings)
    .where(eq(fieldSettings.initiativeId, initiativeId))
    .limit(1)

  return row ?? { enabled: false, signerNameAr: null, signerTitleAr: null }
}

export async function certificatesEnabled(initiativeId: string) {
  return (await loadCertificateSettings(initiativeId)).enabled
}

type CertificateRow = {
  code: string
  issuedAt: Date
  participantId: string
  initiativeId: string
  fullNameAr: string
}

/** الشهادة كما تُطبع وكما يُتحقق منها: الأيام والساعات من الحضور الآن. */
async function certificateView(certificate: CertificateRow) {
  const [rows, settings] = await Promise.all([
    loadAttendance(certificate.participantId, certificate.initiativeId),
    loadCertificateSettings(certificate.initiativeId),
  ])

  const [first] = rows

  if (!first) return null

  return {
    code: certificate.code,
    verifyUrl: certificateUrl(certificate.code),
    issuedAt: certificate.issuedAt.toISOString(),
    fullNameAr: certificate.fullNameAr,
    initiativeNameAr: first.initiativeNameAr,
    programNameAr: first.programNameAr,
    ...summarize(rows),
    signer: settings.signerNameAr
      ? { nameAr: settings.signerNameAr, titleAr: settings.signerTitleAr }
      : null,
  }
}

const certificateColumns = {
  code: participantCertificates.code,
  issuedAt: participantCertificates.issuedAt,
  participantId: participantCertificates.participantId,
  initiativeId: participantCertificates.initiativeId,
  fullNameAr: participants.fullNameAr,
}

/**
 * شهادة المتطوع في مبادرة رابطه: تصدر عند أول طلب وتعود هي نفسها بعده.
 *
 * شرطاها أن يفعّلها المنسّق للمبادرة، وأن يكون لصاحبها يوم حضور قائم فيها.
 */
export async function issueCertificate(
  principal: ParticipantPrincipal,
  trace: RequestTrace,
) {
  if (!(await certificatesEnabled(principal.initiativeId))) {
    throw errors.conflict('الشهادات غير مفعّلة لهذه الحملة.')
  }

  const attended = await loadAttendance(
    principal.participantId,
    principal.initiativeId,
  )

  if (attended.length === 0) {
    throw errors.conflict(
      'تصدر الشهادة بعد أن يُسجَّل حضورك في الحملة. راجع قائد مجموعتك إن حضرت ولم تُسجَّل.',
    )
  }

  const holder = and(
    eq(participantCertificates.participantId, principal.participantId),
    eq(participantCertificates.initiativeId, principal.initiativeId),
  )

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(participantCertificates)
      .values({
        participantId: principal.participantId,
        initiativeId: principal.initiativeId,
        code: newCode(),
      })
      // صدرت سلفًا: رمزها ثابت، ولا يُكتب حدث إصدار ثانٍ.
      .onConflictDoNothing({
        target: [
          participantCertificates.participantId,
          participantCertificates.initiativeId,
        ],
      })
      .returning({ id: participantCertificates.id })

    if (!created) return

    await recordAudit(
      {
        action: 'field.certificate_issued',
        actorType: 'SYSTEM',
        entityType: 'initiative',
        entityId: principal.initiativeId,
        entityLabel: attended[0]!.initiativeNameAr,
        summaryAr: 'إصدار شهادة مشاركة لمتطوع',
        metadata: {
          certificateId: created.id,
          participantId: principal.participantId,
        },
        ...trace,
      },
      tx,
    )
  })

  const [certificate] = await db
    .select(certificateColumns)
    .from(participantCertificates)
    .innerJoin(
      participants,
      eq(participantCertificates.participantId, participants.id),
    )
    .where(holder)
    .limit(1)

  const view = certificate ? await certificateView(certificate) : null

  if (!view) throw new Error('Certificate vanished after issue.')

  return view
}

/**
 * التحقق العام من شهادة برمزها. غير الموجودة، وما لم يبقَ لصاحبها يوم حضور،
 * جواب واحد: «لا شهادة بهذا الرمز».
 *
 * يعرض ما تقوله الورقة لا أكثر: الاسم والحملة والأيام والساعات. من يحمل
 * الورقة يعرفها كلها، ومن يخمّن رمزًا لا يأخذ غيرها.
 */
export async function verifyCertificate(code: string) {
  const [certificate] = await db
    .select(certificateColumns)
    .from(participantCertificates)
    .innerJoin(
      participants,
      eq(participantCertificates.participantId, participants.id),
    )
    .where(eq(participantCertificates.code, code))
    .limit(1)

  const view = certificate ? await certificateView(certificate) : null

  if (!view) throw errors.notFound('لا شهادة بهذا الرمز.')

  // رابط التحقق يعرفه من وصل إلى هنا؛ لا يُعاد في الجواب العام.
  const { verifyUrl: _verifyUrl, ...shown } = view

  return shown
}
