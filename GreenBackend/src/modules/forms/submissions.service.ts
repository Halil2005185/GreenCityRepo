import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import {
  formFields,
  formSubmissions,
  formVersions,
  forms,
} from '../../db/schema/forms.js'
import type { AuthContext } from '../access/access.service.js'
import { type RequestTrace, recordAudit } from '../audit/audit.service.js'
import { readableAnswers } from './answers.service.js'
import { isRefType, loadRefOptions } from './public.service.js'
import type { ListSubmissionsQuery, SubmissionStatus } from './submissions.schemas.js'

/**
 * شرط على إجابة سؤال بعينه.
 *
 * طرفان في تعبير واحد: مساواة نصّية للإجابات المفردة، واحتواء للقوائم
 * المتعددة — إجابة «المهارات» مصفوفة، ومساواتها بنصّ لا تطابق أبدًا.
 */
function answerCondition(filter: string) {
  const at = filter.indexOf(':')
  const key = filter.slice(0, at)
  const value = filter.slice(at + 1)

  return sql`(
    ${formSubmissions.answers} ->> ${key} = ${value}
    or ${formSubmissions.answers} -> ${key} @> to_jsonb(${value}::text)
  )`
}

/**
 * أدوار الأسئلة في هذه الاستمارة: مفتاح السؤال ← دوره، من أحدث إصدار عرّفه.
 *
 * الدور ليس جزءًا من العقد المجمَّد بل طريقة قراءته: «هذا السؤال هو الاسم».
 * فوسمُه اليوم يجب أن يُصلح قراءة ما وصل أمس — والمفتاح ثابت بعد النشر،
 * فمعناه لا ينزلق تحت الطلبات القديمة.
 */
async function contactKeys(formId: string) {
  const rows = await db
    .select({
      key: formFields.key,
      contactRole: formFields.contactRole,
      version: formVersions.version,
    })
    .from(formFields)
    .innerJoin(formVersions, eq(formFields.versionId, formVersions.id))
    .where(and(eq(formVersions.formId, formId), isNotNull(formFields.contactRole)))
    .orderBy(desc(formVersions.version))

  const byRole = new Map<string, string>()

  // الأحدث يفوز: القائمة مرتّبة تنازليًا، فأول ما يُرى هو آخر ما عُرّف.
  for (const row of rows) {
    if (row.contactRole && !byRole.has(row.contactRole)) {
      byRole.set(row.contactRole, row.key)
    }
  }

  return byRole
}

/**
 * يردم الاسم والبريد والهاتف من الإجابات حين تكون أعمدتها فارغة.
 *
 * الأعمدة تُستخرج وقت التقديم من الأسئلة الموسومة بأدوارها؛ وطلبٌ وصل قبل
 * أن يُوسم سؤال الاسم يبقى بلا اسم في العمود وإن كان الاسم في إجاباته — فلا
 * يصحّ أن يُعرض «بلا اسم» أمام طلب مكتمل.
 *
 * والقراءة هنا لا تكتب في القاعدة: الأعمدة تبقى كما وصلت، والعرض يُصلح
 * نفسه. ولو كُتبت لصار تعديلُ وسمٍ يعيد كتابة طلبات قديمة بلا أثر مرئي.
 */
function fillContacts<
  T extends {
    answers: Record<string, unknown>
    applicantNameAr: string | null
    applicantEmail: string | null
    applicantPhone: string | null
  },
>(rows: T[], keys: Map<string, string>) {
  const read = (answers: Record<string, unknown>, role: string) => {
    const key = keys.get(role)
    const value = key ? answers[key] : undefined

    return typeof value === 'string' && value.trim() !== '' ? value : null
  }

  for (const row of rows) {
    row.applicantNameAr ||= read(row.answers, 'NAME')
    row.applicantEmail ||= read(row.answers, 'EMAIL')
    row.applicantPhone ||= read(row.answers, 'PHONE')
  }

  return rows
}

async function requireForm(formId: string) {
  const [form] = await db
    .select({ id: forms.id, nameAr: forms.nameAr })
    .from(forms)
    .where(eq(forms.id, formId))
    .limit(1)

  if (!form) throw errors.notFound('الاستمارة غير موجودة.')

  return form
}

/**
 * طلبات استمارة واحدة، الأحدث أولًا.
 *
 * الترشيح على الأعمدة المستخرجة لا داخل `answers`: البحث في jsonb لا فهرس
 * له هنا، والاسم والبريد والهاتف مستخرجة أصلًا لهذا الغرض.
 */
export async function listSubmissions(
  formId: string,
  query: ListSubmissionsQuery,
) {
  await requireForm(formId)

  const term = query.q?.trim()

  const conditions = [
    eq(formVersions.formId, formId),
    query.status ? eq(formSubmissions.status, query.status) : undefined,
    // المؤشّر وقتٌ لا رقم صفحة: صفحة تُقرأ بينما تصل طلبات جديدة لا تتزحزح.
    query.before ? lt(formSubmissions.submittedAt, new Date(query.before)) : undefined,
    term
      ? or(
          ilike(formSubmissions.applicantNameAr, `%${term}%`),
          ilike(formSubmissions.applicantEmail, `%${term}%`),
          ilike(formSubmissions.applicantPhone, `%${term}%`),
        )
      : undefined,
    ...query.answer.map(answerCondition),
  ].filter(Boolean)

  const rows = await db
    .select({
      id: formSubmissions.id,
      status: formSubmissions.status,
      applicantNameAr: formSubmissions.applicantNameAr,
      applicantEmail: formSubmissions.applicantEmail,
      applicantPhone: formSubmissions.applicantPhone,
      formVersionId: formSubmissions.formVersionId,
      formVersion: formVersions.version,
      answers: formSubmissions.answers,
      submittedAt: formSubmissions.submittedAt,
      redactedAt: formSubmissions.redactedAt,
    })
    .from(formSubmissions)
    .innerJoin(formVersions, eq(formSubmissions.formVersionId, formVersions.id))
    .where(and(...conditions))
    .orderBy(desc(formSubmissions.submittedAt))
    .limit(query.limit)

  const missing = rows.some(
    (row) => !row.applicantNameAr || !row.applicantEmail || !row.applicantPhone,
  )

  const filled = missing ? fillContacts(rows, await contactKeys(formId)) : rows
  const last = rows.at(-1)

  return {
    /**
     * الإجابات تخرج مع الصف لا في نداء ثانٍ لكل طلب.
     *
     * الفارز يختار السؤال الذي يريد رؤيته في القائمة — الاسم أو المواليد أو
     * غيرهما — والقائمة تعرضه من هنا. وجلبها صفًّا صفًّا كان يعني خمسين نداءً
     * لصفحة واحدة.
     */
    data: filled.map(({ formVersionId: _versionId, ...row }) => ({
      ...row,
      submittedAt: row.submittedAt.toISOString(),
      redactedAt: row.redactedAt?.toISOString() ?? null,
    })),
    // `null` يعني نهاية القائمة، فتعرف الواجهة متى تتوقف عن الطلب.
    nextBefore:
      rows.length === query.limit && last
        ? last.submittedAt.toISOString()
        : null,
  }
}

/**
 * المقبولون في استمارة بما يلزم للتواصل وحده: الاسم والهاتف والبريد.
 *
 * لوحدة الميدان: المنسّق يوزّع المقبولين على مجموعات ولا يفرز طلباتهم،
 * فلا تخرج له إجاباتهم. والأعمدة الفارغة تُردم من الإجابات كما في القائمة،
 * فطلب وصل قبل وسم سؤال الاسم لا يُعرض بلا اسم.
 */
export async function listAcceptedApplicants(
  formId: string,
  options: { q?: string | undefined; ids?: readonly string[] | undefined } = {},
) {
  await requireForm(formId)

  const term = options.q?.trim()

  const rows = await db
    .select({
      id: formSubmissions.id,
      applicantNameAr: formSubmissions.applicantNameAr,
      applicantEmail: formSubmissions.applicantEmail,
      applicantPhone: formSubmissions.applicantPhone,
      answers: formSubmissions.answers,
      submittedAt: formSubmissions.submittedAt,
    })
    .from(formSubmissions)
    .innerJoin(formVersions, eq(formSubmissions.formVersionId, formVersions.id))
    .where(
      and(
        eq(formVersions.formId, formId),
        eq(formSubmissions.status, 'ACCEPTED'),
        // ما مُحيت بياناته بطلب صاحبه لا اسم فيه يُوزَّع.
        isNull(formSubmissions.redactedAt),
        options.ids ? inArray(formSubmissions.id, [...options.ids]) : undefined,
        term
          ? or(
              ilike(formSubmissions.applicantNameAr, `%${term}%`),
              ilike(formSubmissions.applicantEmail, `%${term}%`),
              ilike(formSubmissions.applicantPhone, `%${term}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(formSubmissions.applicantNameAr), desc(formSubmissions.submittedAt))
    .limit(500)

  const filled = fillContacts(rows, await contactKeys(formId))

  return filled.map(({ answers: _answers, ...row }) => row)
}

async function requireSubmission(formId: string, submissionId: string) {
  const [row] = await db
    .select({
      id: formSubmissions.id,
      status: formSubmissions.status,
      answers: formSubmissions.answers,
      applicantNameAr: formSubmissions.applicantNameAr,
      applicantEmail: formSubmissions.applicantEmail,
      applicantPhone: formSubmissions.applicantPhone,
      versionId: formVersions.id,
      formVersion: formVersions.version,
      formNameAr: forms.nameAr,
      submittedAt: formSubmissions.submittedAt,
      redactedAt: formSubmissions.redactedAt,
    })
    .from(formSubmissions)
    .innerJoin(formVersions, eq(formSubmissions.formVersionId, formVersions.id))
    .innerJoin(forms, eq(formVersions.formId, forms.id))
    .where(and(eq(formSubmissions.id, submissionId), eq(forms.id, formId)))
    .limit(1)

  if (!row) throw errors.notFound('الطلب غير موجود.')

  return row
}

/**
 * الطلب بإجاباته مقروءةً بأسئلة **الإصدار الذي أُرسل معه**.
 *
 * لا بأسئلة المسوّدة الحالية: الأسئلة تتغيّر بين إصدار وآخر، وقراءة إجابة
 * قديمة بسؤال جديد تنسب إلى المتقدّم ما لم يُسأل عنه.
 */
export async function getSubmission(formId: string, submissionId: string) {
  const submission = await requireSubmission(formId, submissionId)

  const fields = await db
    .select()
    .from(formFields)
    .where(eq(formFields.versionId, submission.versionId))
    .orderBy(asc(formFields.displayOrder))

  const [contact] = fillContacts(
    [
      {
        answers: submission.answers,
        applicantNameAr: submission.applicantNameAr,
        applicantEmail: submission.applicantEmail,
        applicantPhone: submission.applicantPhone,
      },
    ],
    await contactKeys(formId),
  )

  /**
   * أسئلة المرجع (المحافظة والمكتب والبرنامج) تحفظ معرّفًا لا اسمًا،
   * فتُقرأ أسماؤها من كتالوج النظام هنا كما تُقرأ عند بناء الاستمارة
   * العلنية — وإلا ظهر للفارز معرّف لا يُقرأ بدل اسم المحافظة.
   */
  const catalogs = await loadRefOptions(
    new Set(fields.map((field) => field.type).filter(isRefType)),
  )

  return {
    id: submission.id,
    status: submission.status,
    formNameAr: submission.formNameAr,
    formVersion: submission.formVersion,
    applicantNameAr: contact!.applicantNameAr,
    applicantEmail: contact!.applicantEmail,
    applicantPhone: contact!.applicantPhone,
    submittedAt: submission.submittedAt.toISOString(),
    redactedAt: submission.redactedAt?.toISOString() ?? null,
    answers: readableAnswers(
      fields.map((field) =>
        isRefType(field.type) ? { ...field, options: catalogs[field.type] } : field,
      ),
      submission.answers,
    ),
  }
}

/**
 * نقل حالة الطلب.
 *
 * بلا رسم انتقالات: الفارز يقرأ ثم يقرّر، وقد يعيد النظر — ومنعُ العودة من
 * «مرفوض» إلى «قيد المراجعة» يعني طلبًا يُدفن بنقرة خاطئة. والسجل التدقيقي
 * يحفظ من غيّر وإلى أي حالة.
 */
export async function setSubmissionStatus(
  formId: string,
  submissionId: string,
  status: SubmissionStatus,
  actor: AuthContext,
  trace: RequestTrace,
) {
  const current = await requireSubmission(formId, submissionId)

  if (current.status === status) return getSubmission(formId, submissionId)

  await db.transaction(async (tx) => {
    await tx
      .update(formSubmissions)
      .set({ status })
      .where(eq(formSubmissions.id, submissionId))

    await recordAudit(
      {
        action: 'form.submission_status_changed',
        actorUserId: actor.userId,
        entityType: 'form_submission',
        entityId: submissionId,
        entityLabel: current.applicantNameAr ?? current.formNameAr,
        summaryAr: `نقل طلب من «${current.status}» إلى «${status}»`,
        metadata: { formId, from: current.status, to: status },
        ...trace,
      },
      tx,
    )
  })

  return getSubmission(formId, submissionId)
}
