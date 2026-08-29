import { createHash } from 'node:crypto'

import { and, asc, eq } from 'drizzle-orm'

import { errors } from '../../common/errors/app-error.js'
import { db } from '../../db/client.js'
import {
  formFields,
  formSubmissions,
  formVersions,
  forms,
} from '../../db/schema/forms.js'
import { enqueueEmail } from '../mail/outbox.service.js'
import { validateAnswers } from './answers.service.js'

/** سقف على حجم ما يُحفظ، مستقل عن حد جسم الطلب في Express. */
const MAX_ANSWER_BYTES = 64 * 1024

/**
 * الاستمارة المنشورة كما يراها الزائر.
 *
 * لا `id` للاستمارة ولا للإصدار ولا للأسئلة في الرد: المتقدّم لا يحتاج
 * معرّفات داخلية، وإخراجها يوسّع ما يُعرف عن النظام بلا مقابل. المفتاح
 * وحده هو العقد بين الاستمارة وإجابتها.
 */
export async function getPublicForm(slug: string) {
  const [form] = await db
    .select({
      slug: forms.slug,
      nameAr: forms.nameAr,
      descriptionAr: forms.descriptionAr,
      isAccepting: forms.isAccepting,
      versionId: formVersions.id,
      version: formVersions.version,
    })
    .from(forms)
    .innerJoin(
      formVersions,
      and(
        eq(formVersions.formId, forms.id),
        eq(formVersions.status, 'PUBLISHED'),
      ),
    )
    .where(eq(forms.slug, slug))
    .limit(1)

  /**
   * استمارة غير منشورة واستمارة غير موجودة تعطيان 404 نفسه: التفريق
   * يخبر من يجرّب المعرّفات أيها موجود ينتظر النشر.
   */
  if (!form) throw errors.notFound('الاستمارة غير متاحة.')

  const fields = await db
    .select()
    .from(formFields)
    .where(eq(formFields.versionId, form.versionId))
    .orderBy(asc(formFields.displayOrder))

  return {
    slug: form.slug,
    nameAr: form.nameAr,
    descriptionAr: form.descriptionAr,
    isAccepting: form.isAccepting,
    version: form.version,
    fields: fields.map((field) => ({
      key: field.key,
      labelAr: field.labelAr,
      hintAr: field.hintAr,
      type: field.type,
      isRequired: field.isRequired,
      isContactEmail: field.contactRole === 'EMAIL',
      minSelections: field.minSelections,
      maxSelections: field.maxSelections,
      maxLength: field.maxLength,
      options: field.options,
      condition:
        field.conditionFieldKey && field.conditionOp
          ? {
              fieldKey: field.conditionFieldKey,
              op: field.conditionOp,
              ...(field.conditionOp === 'notEmpty'
                ? {}
                : { value: field.conditionValue }),
            }
          : null,
    })),
  }
}

/** تجزئة مع ملح ثابت من سرّ التطبيق: تكشف التكرار ولا تُعيد بناء العنوان. */
function hashIp(ip: string | undefined, salt: string) {
  if (!ip) return null

  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

/**
 * الإجابات كما تُقرأ لا كما تُخزَّن: النسخة التي تصل المتقدّم تحمل نص السؤال
 * ونص الخيار، لا مفاتيحهما. والقالب يُصيَّر وقت الإرسال ولا يصل إلى القاعدة،
 * فتُبنى الأزواج هنا وتُحفظ في حمولة الرسالة.
 */
function readableAnswers(
  fields: Array<{
    key: string
    labelAr: string
    type: string
    options: Array<{ value: string; labelAr: string }>
  }>,
  answers: Record<string, unknown>,
) {
  const items: Array<{ labelAr: string; valueAr: string }> = []

  for (const field of fields) {
    const value = answers[field.key]

    if (value === undefined || value === null || value === '') continue

    const labelOf = (option: string) =>
      field.options.find((one) => one.value === option)?.labelAr ?? option

    const valueAr = Array.isArray(value)
      ? value.map((one) => labelOf(String(one))).join('، ')
      : typeof value === 'boolean'
        ? value
          ? 'نعم'
          : 'لا'
        : field.type === 'SINGLE_SELECT'
          ? labelOf(String(value))
          : String(value)

    items.push({ labelAr: field.labelAr, valueAr })
  }

  return items
}

export async function submitForm(options: {
  slug: string
  answers: Record<string, unknown>
  sendCopy?: boolean | undefined
  ip: string | undefined
  salt: string
}) {
  const [form] = await db
    .select({
      nameAr: forms.nameAr,
      isAccepting: forms.isAccepting,
      versionId: formVersions.id,
    })
    .from(forms)
    .innerJoin(
      formVersions,
      and(
        eq(formVersions.formId, forms.id),
        eq(formVersions.status, 'PUBLISHED'),
      ),
    )
    .where(eq(forms.slug, options.slug))
    .limit(1)

  if (!form) throw errors.notFound('الاستمارة غير متاحة.')

  if (!form.isAccepting) {
    throw errors.conflict('الاستمارة مغلقة حاليًا ولا تستقبل طلبات.')
  }

  const size = Buffer.byteLength(JSON.stringify(options.answers), 'utf8')

  if (size > MAX_ANSWER_BYTES) {
    throw errors.unprocessable('حجم الإجابات يتجاوز الحد المسموح.')
  }

  const fields = await db
    .select()
    .from(formFields)
    .where(eq(formFields.versionId, form.versionId))
    .orderBy(asc(formFields.displayOrder))

  const result = validateAnswers(fields, options.answers)

  if (result.issues.length > 0) {
    throw errors.unprocessable('بعض الإجابات غير صالحة.', result.issues)
  }

  /**
   * الحفظ والنسخة في معاملة واحدة: رسالة تخرج لطلب لم يُحفظ تعِد بما لا
   * أثر له، وطلبٌ يُحفظ بلا رسالة يكسر وعدًا صريحًا للمتقدّم.
   */
  await db.transaction(async (tx) => {
    await tx.insert(formSubmissions).values({
      formVersionId: form.versionId,
      answers: result.answers,
      applicantNameAr: result.contact.nameAr,
      applicantEmail: result.contact.email,
      applicantPhone: result.contact.phone,
      sourceIpHash: hashIp(options.ip, options.salt),
    })

    if (!options.sendCopy || !result.contact.email) return

    await enqueueEmail(tx, {
      templateKey: 'form-copy',
      recipient: result.contact.email,
      payload: {
        formNameAr: form.nameAr,
        items: readableAnswers(fields, result.answers),
      },
    })
  })
}
