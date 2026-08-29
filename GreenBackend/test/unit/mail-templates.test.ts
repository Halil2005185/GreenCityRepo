import { describe, expect, it } from 'vitest'

import { renderTemplate } from '../../src/modules/mail/templates.js'

describe('form copy template', () => {
  const rendered = renderTemplate('form-copy', {
    formNameAr: 'استمارة الانضمام للمتطوعين',
    items: [
      { labelAr: 'الاسم الكامل', valueAr: 'ليان العمر' },
      { labelAr: 'المهارات', valueAr: 'زراعة، توثيق' },
    ],
  })

  it('names the form in the subject and lists every answer', () => {
    expect(rendered.subject).toContain('استمارة الانضمام للمتطوعين')

    for (const part of ['الاسم الكامل', 'ليان العمر', 'المهارات', 'زراعة، توثيق']) {
      expect(rendered.html).toContain(part)
      expect(rendered.text).toContain(part)
    }
  })

  it('says it is a receipt, not an acceptance', () => {
    expect(rendered.html).toContain('لا إشعار قبول')
  })

  /**
   * الإجابات نصٌّ كتبه مجهول على مسار عام، والرسالة تُقرأ في عميل بريد.
   * تركها خامًا يعني وسمًا يُحقن من نموذج مفتوح للعالم.
   */
  it('escapes markup that came from the applicant', () => {
    const hostile = renderTemplate('form-copy', {
      formNameAr: 'استمارة',
      items: [
        {
          labelAr: 'ملاحظات',
          valueAr: '<img src=x onerror="alert(1)">',
        },
      ],
    })

    expect(hostile.html).not.toContain('<img')
    expect(hostile.html).toContain('&lt;img')
  })

  it('renders an empty submission without breaking', () => {
    const empty = renderTemplate('form-copy', { formNameAr: 'استمارة', items: [] })

    expect(empty.html).toContain('لا إجابات مسجّلة')
  })
})
