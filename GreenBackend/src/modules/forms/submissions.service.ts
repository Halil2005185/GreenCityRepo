import { and, asc, desc, eq, ilike, lt, or } from 'drizzle-orm'

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
import type { ListSubmissionsQuery, SubmissionStatus } from './submissions.schemas.js'

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
  ].filter(Boolean)

  const rows = await db
    .select({
      id: formSubmissions.id,
      status: formSubmissions.status,
      applicantNameAr: formSubmissions.applicantNameAr,
      applicantEmail: formSubmissions.applicantEmail,
      applicantPhone: formSubmissions.applicantPhone,
      formVersion: formVersions.version,
      submittedAt: formSubmissions.submittedAt,
    })
    .from(formSubmissions)
    .innerJoin(formVersions, eq(formSubmissions.formVersionId, formVersions.id))
    .where(and(...conditions))
    .orderBy(desc(formSubmissions.submittedAt))
    .limit(query.limit)

  const last = rows.at(-1)

  return {
    data: rows.map((row) => ({
      ...row,
      submittedAt: row.submittedAt.toISOString(),
    })),
    // `null` يعني نهاية القائمة، فتعرف الواجهة متى تتوقف عن الطلب.
    nextBefore:
      rows.length === query.limit && last
        ? last.submittedAt.toISOString()
        : null,
  }
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

  return {
    id: submission.id,
    status: submission.status,
    formNameAr: submission.formNameAr,
    formVersion: submission.formVersion,
    applicantNameAr: submission.applicantNameAr,
    applicantEmail: submission.applicantEmail,
    applicantPhone: submission.applicantPhone,
    submittedAt: submission.submittedAt.toISOString(),
    answers: readableAnswers(fields, submission.answers),
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
