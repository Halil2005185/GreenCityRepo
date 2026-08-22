import { formFields } from '../../db/schema/forms.js'

type FieldRow = typeof formFields.$inferSelect

export type AnswerIssue = { path: string; message: string }

export type ValidationResult = {
  issues: AnswerIssue[]
  /** الإجابات المقبولة بعد التنظيف — المخفية محذوفة والزائدة مُهملة. */
  answers: Record<string, unknown>
  contact: {
    nameAr: string | null
    email: string | null
    phone: string | null
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_PATTERN = /^https?:\/\/[^\s]+$/i
const PHONE_PATTERN = /^[+]?[\d\s()-]{6,32}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/**
 * تقييم شرط الظهور على الإجابات — النسخة المرجعية.
 *
 * الواجهة تُخفي وتُظهر لتحسين التجربة، وهذه هي الحقيقة: حقل مخفي وصلته
 * إجابة يُهمَل، وحقل مطلوب ظاهر ولم يُجَب يُرفض. تكرار المنطق في
 * المتصفح لا يغني عنه لأن الطلب قد لا يأتي من متصفحنا أصلًا.
 */
export function isVisible(
  field: FieldRow,
  answers: Record<string, unknown>,
): boolean {
  if (!field.conditionFieldKey || !field.conditionOp) return true

  const value = answers[field.conditionFieldKey]

  if (field.conditionOp === 'notEmpty') return !isBlank(value)

  if (field.conditionOp === 'in') {
    const allowed = (field.conditionValue ?? []) as string[]

    return Array.isArray(value)
      ? value.some((item) => allowed.includes(String(item)))
      : allowed.includes(String(value))
  }

  return String(value ?? '') === String(field.conditionValue ?? '')
}

function validateScalar(
  field: FieldRow,
  raw: unknown,
  issues: AnswerIssue[],
): unknown {
  const value = typeof raw === 'string' ? raw.trim() : raw
  const push = (message: string) => issues.push({ path: field.key, message })

  switch (field.type) {
    case 'NUMBER': {
      const parsed = typeof value === 'number' ? value : Number(value)

      if (!Number.isFinite(parsed)) {
        push('القيمة يجب أن تكون رقمًا.')
        return null
      }

      return parsed
    }

    case 'BOOLEAN': {
      if (typeof value !== 'boolean') {
        push('القيمة يجب أن تكون نعم أو لا.')
        return null
      }

      return value
    }

    case 'DATE': {
      if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
        push('التاريخ يجب أن يكون بصيغة YYYY-MM-DD.')
        return null
      }

      return value
    }

    case 'EMAIL': {
      if (typeof value !== 'string' || !EMAIL_PATTERN.test(value)) {
        push('صيغة البريد الإلكتروني غير صحيحة.')
        return null
      }

      return value.toLowerCase()
    }

    case 'PHONE': {
      if (typeof value !== 'string' || !PHONE_PATTERN.test(value)) {
        push('صيغة رقم الهاتف غير صحيحة.')
        return null
      }

      return value
    }

    case 'URL': {
      if (typeof value !== 'string' || !URL_PATTERN.test(value)) {
        push('الرابط يجب أن يبدأ بـhttp أو https.')
        return null
      }

      return value
    }

    case 'TEXT':
    case 'LONG_TEXT': {
      if (typeof value !== 'string') {
        push('القيمة يجب أن تكون نصًا.')
        return null
      }

      if (field.maxLength && value.length > field.maxLength) {
        push(`الحد الأقصى ${field.maxLength} حرفًا.`)
        return null
      }

      return value
    }

    /**
     * المراجع تُقبل كمعرّفات دون التحقق من وجودها هنا.
     *
     * التحقق من كل معرّف يعني استعلامًا لكل حقل مرجعي على مسار عام بلا
     * مصادقة — سطح إنهاك رخيص الاستغلال. الفارز يرى المرجع المفقود
     * كقيمة لا تُعرض، وهذا أرخص من فتح الباب.
     */
    case 'AREA_REF':
    case 'OFFICE_REF':
    case 'PROGRAM_REF': {
      if (typeof value !== 'string' || value.length === 0) {
        push('اختيار غير صالح.')
        return null
      }

      return value
    }

    default: {
      push('نوع غير مدعوم.')
      return null
    }
  }
}

/**
 * يتحقق من الإجابات مقابل أسئلة الإصدار ويعيدها منظّفة.
 *
 * الترتيب مقصود: الشرطية تُقيَّم بالتسلسل على الإجابات كما وصلت، لأن كل
 * شرط يشير إلى سؤال يسبقه — وهو ما يفرضه بانِي الأسئلة أصلًا.
 */
export function validateAnswers(
  fields: readonly FieldRow[],
  raw: Record<string, unknown>,
): ValidationResult {
  const issues: AnswerIssue[] = []
  const answers: Record<string, unknown> = {}
  const contact = {
    nameAr: null as string | null,
    email: null as string | null,
    phone: null as string | null,
  }

  const ordered = [...fields].sort((a, b) => a.displayOrder - b.displayOrder)

  for (const field of ordered) {
    const visible = isVisible(field, answers)
    const provided = raw[field.key]

    if (!visible) {
      /**
       * إجابة على حقل مخفي تُرفض لا تُهمَل.
       *
       * الإهمال الصامت يقبل طلبًا يحمل «أنا مهندس» ممن أجاب «لست مهندسًا»،
       * فيصل الفارز سجل متناقض لا يعرف من أين جاء.
       */
      if (!isBlank(provided)) {
        issues.push({
          path: field.key,
          message: 'هذا السؤال لا يظهر بناءً على إجاباتك السابقة.',
        })
      }

      continue
    }

    if (isBlank(provided)) {
      if (field.isRequired) {
        issues.push({ path: field.key, message: 'هذا السؤال مطلوب.' })
      }

      continue
    }

    if (field.type === 'MULTI_SELECT') {
      if (!Array.isArray(provided)) {
        issues.push({ path: field.key, message: 'الإجابة يجب أن تكون قائمة.' })
        continue
      }

      const allowed = new Set(field.options.map((option) => option.value))
      const unique = [...new Set(provided.map((item) => String(item)))]
      const unknown = unique.filter((item) => !allowed.has(item))

      if (unknown.length > 0) {
        issues.push({ path: field.key, message: 'اختيار غير موجود ضمن الخيارات.' })
        continue
      }

      if (field.minSelections && unique.length < field.minSelections) {
        issues.push({
          path: field.key,
          message: `اختر ${field.minSelections} على الأقل.`,
        })
        continue
      }

      if (field.maxSelections && unique.length > field.maxSelections) {
        issues.push({
          path: field.key,
          message: `الحد الأقصى ${field.maxSelections} اختيارات.`,
        })
        continue
      }

      answers[field.key] = unique
      continue
    }

    if (field.type === 'SINGLE_SELECT') {
      const value = String(provided)

      if (!field.options.some((option) => option.value === value)) {
        issues.push({ path: field.key, message: 'اختيار غير موجود ضمن الخيارات.' })
        continue
      }

      answers[field.key] = value
      continue
    }

    const before = issues.length
    const value = validateScalar(field, provided, issues)

    if (issues.length > before) continue

    answers[field.key] = value

    if (field.contactRole === 'NAME') contact.nameAr = String(value)
    if (field.contactRole === 'EMAIL') contact.email = String(value)
    if (field.contactRole === 'PHONE') contact.phone = String(value)
  }

  /**
   * مفاتيح لا تخص هذا الإصدار تُرفض لا تُهمَل: قبولها يعني حفظ ما لا
   * يقابله سؤال، وهو باب لتضخيم الصف بما لا يُقرأ.
   */
  const known = new Set(fields.map((field) => field.key))

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      issues.push({ path: key, message: 'سؤال غير موجود في هذه الاستمارة.' })
    }
  }

  return { issues, answers, contact }
}
